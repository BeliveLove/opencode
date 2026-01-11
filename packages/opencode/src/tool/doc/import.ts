import z from "zod"
import path from "path"
import { Tool } from "../tool"
import DESCRIPTION from "./import.txt"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"
import { Identifier } from "../../id/id"
import { ZipReader, BlobReader, BlobWriter } from "@zip.js/zip.js"

const DEFAULT_MAX_CHARS = 200_000

function decodeXmlEntities(input: string) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
}

async function readZipTextEntry(zipFile: Bun.BunFile, entryName: string): Promise<string | null> {
  const blob = new Blob([await zipFile.arrayBuffer()])
  const reader = new ZipReader(new BlobReader(blob))
  try {
    const entries = await reader.getEntries()
    const entry = entries.find((e) => e.filename === entryName)
    if (!entry) return null
    const outBlob = await entry.getData?.(new BlobWriter())
    if (!outBlob) return null
    return await outBlob.text()
  } finally {
    await reader.close().catch(() => {})
  }
}

async function readZipEntries(zipFile: Bun.BunFile, predicate: (filename: string) => boolean) {
  const blob = new Blob([await zipFile.arrayBuffer()])
  const reader = new ZipReader(new BlobReader(blob))
  try {
    const entries = await reader.getEntries()
    const matches = entries.filter((e) => predicate(e.filename)).sort((a, b) => a.filename.localeCompare(b.filename))
    const results: Array<{ filename: string; text: string }> = []
    for (const entry of matches) {
      const outBlob = await entry.getData?.(new BlobWriter())
      if (!outBlob) continue
      results.push({ filename: entry.filename, text: await outBlob.text() })
    }
    return results
  } finally {
    await reader.close().catch(() => {})
  }
}

function stripTagsPreservingWhitespace(xml: string) {
  const withMarkers = xml
    .replaceAll(/<w:tab[^>]*\/>/g, "\t")
    .replaceAll(/<(w:br|w:cr)[^>]*\/>/g, "\n")
    .replaceAll(/<a:br[^>]*\/>/g, "\n")
  const noTags = withMarkers.replaceAll(/<[^>]+>/g, "")
  return decodeXmlEntities(noTags)
}

function extractDocxText(documentXml: string) {
  // Best-effort: keep paragraph boundaries as newlines.
  const paragraphs = Array.from(documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)).map((m) => m[0])
  if (paragraphs.length === 0) return stripTagsPreservingWhitespace(documentXml).trim()
  return paragraphs
    .map((p) => stripTagsPreservingWhitespace(p).replaceAll(/\n{3,}/g, "\n\n").trimEnd())
    .filter((p) => p.trim().length > 0)
    .join("\n\n")
    .trim()
}

function extractPptxSlideText(slideXml: string) {
  // Best-effort: collect <a:t> runs (PowerPoint text)
  const texts = Array.from(slideXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) => decodeXmlEntities(m[1] ?? ""))
  return texts.join("").replaceAll(/\s+/g, " ").trim()
}

async function extractPptxText(zipFile: Bun.BunFile) {
  const slides = await readZipEntries(zipFile, (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
  if (slides.length === 0) return ""
  return slides
    .map((s) => `# ${path.posix.basename(s.filename, ".xml")}\n\n${extractPptxSlideText(s.text)}`.trim())
    .join("\n\n")
    .trim()
}

function parseSharedStrings(sharedStringsXml: string) {
  // Collect all <t> nodes under sharedStrings. This ignores rich-text boundaries but is good enough for extraction.
  const items = Array.from(sharedStringsXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => decodeXmlEntities(m[1] ?? ""))
  return items
}

function extractXlsxSheetText(sheetXml: string, shared: string[]) {
  // Best-effort: reconstruct rows as TSV.
  const rows = Array.from(sheetXml.matchAll(/<row[\s\S]*?<\/row>/g)).map((m) => m[0])
  const outRows: string[] = []

  for (const rowXml of rows) {
    const cells = Array.from(rowXml.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)).map((m) => ({ attrs: m[1] ?? "", body: m[2] ?? "" }))
    const vals: string[] = []
    for (const cell of cells) {
      const t = /t="([^"]+)"/.exec(cell.attrs)?.[1]
      if (t === "inlineStr") {
        const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell.body)?.[1]
        vals.push(decodeXmlEntities(inline ?? ""))
        continue
      }
      const vRaw = /<v>([\s\S]*?)<\/v>/.exec(cell.body)?.[1]?.trim() ?? ""
      if (!vRaw) {
        vals.push("")
        continue
      }
      if (t === "s") {
        const idx = Number(vRaw)
        vals.push(Number.isFinite(idx) && shared[idx] !== undefined ? shared[idx]! : vRaw)
        continue
      }
      vals.push(vRaw)
    }
    const line = vals.join("\t").trimEnd()
    if (line.trim()) outRows.push(line)
  }

  // If no <row> blocks, fallback: just strip tags (still yields something for small sheets).
  if (outRows.length === 0) {
    const text = stripTagsPreservingWhitespace(sheetXml).replaceAll(/\s+/g, " ").trim()
    return text
  }
  return outRows.join("\n")
}

async function extractXlsxText(zipFile: Bun.BunFile) {
  const sharedXml = await readZipTextEntry(zipFile, "xl/sharedStrings.xml")
  const shared = sharedXml ? parseSharedStrings(sharedXml) : []
  const sheets = await readZipEntries(zipFile, (name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
  if (sheets.length === 0) return ""
  return sheets
    .map((s) => `# ${path.posix.basename(s.filename, ".xml")}\n\n${extractXlsxSheetText(s.text, shared)}`.trim())
    .join("\n\n")
    .trim()
}

async function ensureReadableFile(ctx: Tool.Context, filePath: string) {
  if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filePath)) {
    const parentDir = path.dirname(filePath)
    await ctx.ask({
      permission: "external_directory",
      patterns: [parentDir],
      always: [parentDir + "/*"],
      metadata: { filePath, parentDir },
    })
  }

  await ctx.ask({
    permission: "read",
    patterns: [filePath],
    always: ["*"],
    metadata: {},
  })
}

export const DocImportTool = Tool.define("doc_import", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("Path to the file to import (absolute or relative)"),
    outputFormat: z.enum(["text", "markdown"]).optional().describe("Output format hint (defaults to 'text')"),
    maxChars: z.number().int().positive().max(2_000_000).optional().describe("Maximum characters to return"),
  }),
  async execute(params, ctx) {
    const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS
    let filePath = params.filePath
    if (!path.isAbsolute(filePath)) filePath = path.join(process.cwd(), filePath)
    filePath = path.resolve(filePath)

    await ensureReadableFile(ctx, filePath)

    const file = Bun.file(filePath)
    if (!(await file.exists())) throw new Error(`File not found: ${filePath}`)

    const ext = path.extname(filePath).toLowerCase()
    const warnings: string[] = []
    let extracted = ""
    let attachments: any[] | undefined

    if (ext === ".md" || ext === ".txt") {
      extracted = await file.text()
    } else if (ext === ".docx") {
      const xml = await readZipTextEntry(file, "word/document.xml")
      if (!xml) throw new Error("Invalid .docx: missing word/document.xml")
      extracted = extractDocxText(xml)
      warnings.push("docx text extraction is best-effort (formatting/tables not preserved)")
    } else if (ext === ".pptx") {
      extracted = await extractPptxText(file)
      if (!extracted.trim()) warnings.push("pptx text extraction found no slide text")
      warnings.push("pptx text extraction is best-effort (layout/notes not preserved)")
    } else if (ext === ".xlsx") {
      extracted = await extractXlsxText(file)
      if (!extracted.trim()) warnings.push("xlsx text extraction found no sheet text")
      warnings.push("xlsx text extraction is best-effort (formulas/formatting not preserved)")
    } else if (ext === ".pdf") {
      const mime = file.type || "application/pdf"
      const msg = "PDF attached (text extraction not performed). Use a model with PDF input capability to understand it."
      attachments = [
        {
          id: Identifier.ascending("part"),
          sessionID: ctx.sessionID,
          messageID: ctx.messageID,
          type: "file",
          mime,
          url: `data:${mime};base64,${Buffer.from(await file.bytes()).toString("base64")}`,
        },
      ]
      return {
        title: path.relative(Instance.worktree, filePath),
        output: msg,
        metadata: {
          filePath,
          type: "pdf",
          extractedChars: 0,
          truncated: false,
          warnings,
          attached: true,
          outputFormat: params.outputFormat ?? "text",
        },
        attachments,
      }
    } else if (ext === ".doc" || ext === ".xls" || ext === ".ppt") {
      throw new Error(`Unsupported legacy binary format (${ext}). Please convert to .docx/.xlsx/.pptx first.`)
    } else {
      throw new Error(
        `Unsupported file type: ${ext || "(no ext)"}.\n\nSupported: .md, .txt, .docx, .pptx, .xlsx, .pdf`,
      )
    }

    // Normalize line endings for output
    extracted = extracted.replaceAll("\r\n", "\n")

    const truncated = extracted.length > maxChars
    const output = truncated ? extracted.slice(0, maxChars) + "\n\n...(truncated)" : extracted

    return {
      title: path.relative(Instance.worktree, filePath),
      output: output.trimEnd(),
      metadata: {
        filePath,
        type: ext.replace(/^\./, "") || "text",
        extractedChars: extracted.length,
        truncated,
        warnings,
        attached: false,
        outputFormat: params.outputFormat ?? "text",
      },
    }
  },
})

