import z from "zod"
import path from "path"
import TurndownService from "turndown"
import * as XLSX from "xlsx"
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

function applyDocxTrackChangesMarkers(xml: string) {
  return xml
    .replace(/<w:ins\b[^>]*>/g, "[[+")
    .replace(/<\/w:ins>/g, "+]]")
    .replace(/<w:del\b[^>]*>/g, "[[-")
    .replace(/<\/w:del>/g, "-]]")
    .replace(/<w:moveTo\b[^>]*>/g, "[[+")
    .replace(/<\/w:moveTo>/g, "+]]")
    .replace(/<w:moveFrom\b[^>]*>/g, "[[-")
    .replace(/<\/w:moveFrom>/g, "-]]")
    .replace(/<w:delText\b[^>]*>/g, "<w:t>")
    .replace(/<\/w:delText>/g, "</w:t>")
}

function extractDocxComments(commentsXml: string) {
  const comments: Array<{ id: string; author?: string; date?: string; text: string }> = []
  const regex = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(commentsXml)) !== null) {
    const attrs = match[1] ?? ""
    const body = match[2] ?? ""
    const id = /w:id="([^"]+)"/.exec(attrs)?.[1] ?? ""
    const author = /w:author="([^"]+)"/.exec(attrs)?.[1]
    const date = /w:date="([^"]+)"/.exec(attrs)?.[1]
    const text = stripTagsPreservingWhitespace(body).replace(/\s+/g, " ").trim()
    if (text) {
      comments.push({ id, author, date, text })
    }
  }
  return comments
}

async function extractDocxMarkdown(file: Bun.BunFile, warnings: string[]) {
  try {
    const mammoth = await import("mammoth")
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.convertToHtml({ arrayBuffer })
    if (result.messages?.length) {
      for (const msg of result.messages) {
        warnings.push(`docx conversion warning: ${msg.message}`)
      }
    }
    const turndown = new TurndownService({
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    })
    const markdown = turndown.turndown(result.value || "")
    return markdown.trim()
  } catch (error) {
    warnings.push(`docx markdown extraction failed: ${(error as Error).message}`)
    return null
  }
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

type PptxParagraph = { text: string; level: number }

function extractPptxParagraphs(xml: string): PptxParagraph[] {
  const paragraphs = Array.from(xml.matchAll(/<a:p[\s\S]*?<\/a:p>/g)).map((m) => m[0])
  if (!paragraphs.length) {
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) => decodeXmlEntities(m[1] ?? ""))
    const text = texts.join("").replaceAll(/\s+/g, " ").trim()
    return text ? [{ text, level: 0 }] : []
  }
  const out: PptxParagraph[] = []
  for (const p of paragraphs) {
    const level = Number(/<a:pPr[^>]*lvl="(\d+)"/.exec(p)?.[1] ?? 0)
    const texts = Array.from(p.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) => decodeXmlEntities(m[1] ?? ""))
    const text = texts.join("").replaceAll(/\s+/g, " ").trim()
    if (text) out.push({ text, level: Number.isFinite(level) ? level : 0 })
  }
  return out
}

function formatPptxParagraphs(paragraphs: PptxParagraph[], outputFormat: "text" | "markdown") {
  if (!paragraphs.length) return ""
  const hasList = paragraphs.length > 1 || paragraphs.some((p) => p.level > 0)
  if (!hasList) return paragraphs.map((p) => p.text).join("\n").trim()
  if (outputFormat === "markdown") {
    return paragraphs
      .map((p) => `${"  ".repeat(Math.max(0, p.level))}- ${p.text}`)
      .join("\n")
      .trim()
  }
  return paragraphs
    .map((p) => `${"  ".repeat(Math.max(0, p.level))}- ${p.text}`)
    .join("\n")
    .trim()
}

async function extractPptxText(
  zipFile: Bun.BunFile,
  opts: { includeNotes: boolean; outputFormat: "text" | "markdown" },
) {
  const slides = await readZipEntries(zipFile, (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
  if (slides.length === 0) return ""
  const notes = opts.includeNotes
    ? await readZipEntries(zipFile, (name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    : []
  const notesBySlide = new Map<string, string>()
  for (const note of notes) {
    const slideId = note.filename.replace(/^ppt\/notesSlides\/notesSlide/i, "slide").replace(/\.xml$/i, "")
    const paragraphs = extractPptxParagraphs(note.text)
    notesBySlide.set(slideId, formatPptxParagraphs(paragraphs, "text"))
  }
  return slides
    .map((s, idx) => {
      const slideName = path.posix.basename(s.filename, ".xml")
      const heading = opts.outputFormat === "markdown" ? `# ${slideName}` : `Slide ${idx + 1}`
      const paragraphs = extractPptxParagraphs(s.text)
      const body = formatPptxParagraphs(paragraphs, opts.outputFormat)
      const noteText = notesBySlide.get(slideName)
      const noteBlock =
        opts.includeNotes && noteText
          ? opts.outputFormat === "markdown"
            ? `\n\n> Notes: ${noteText}`
            : `\n\nNotes: ${noteText}`
          : ""
      return `${heading}\n\n${body}${noteBlock}`.trim()
    })
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

function trimEmptyRows(rows: string[][]) {
  let end = rows.length
  while (end > 0) {
    const row = rows[end - 1]
    if (row && row.some((cell) => String(cell ?? "").trim() !== "")) break
    end -= 1
  }
  return rows.slice(0, end)
}

function trimEmptyCols(rows: string[][]) {
  let maxCol = 0
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (String(row[i] ?? "").trim() !== "") {
        maxCol = Math.max(maxCol, i + 1)
        break
      }
    }
  }
  return rows.map((row) => row.slice(0, maxCol))
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
}

function rowsToMarkdownTable(rows: string[][]) {
  if (!rows.length) return ""
  const normalized = trimEmptyCols(trimEmptyRows(rows))
  if (!normalized.length) return ""
  const header = normalized[0].map((cell, i) => (cell.trim() ? cell.trim() : `Column ${i + 1}`))
  const body = normalized.slice(1)
  const lines: string[] = []
  lines.push(`| ${header.map(escapeTableCell).join(" | ")} |`)
  lines.push(`| ${header.map(() => "---").join(" | ")} |`)
  for (const row of body) {
    const rowValues = header.map((_, i) => escapeTableCell(String(row[i] ?? "").trim()))
    lines.push(`| ${rowValues.join(" | ")} |`)
  }
  return lines.join("\n")
}

function buildSheetMatrix(sheet: XLSX.WorkSheet, includeFormulas: boolean) {
  const ref = sheet["!ref"]
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const rows: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: string[] = []
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr] as XLSX.CellObject | undefined
      const raw = cell?.w ?? cell?.v ?? ""
      let value = raw === undefined || raw === null ? "" : String(raw)
      if (includeFormulas && cell?.f) {
        const formula = cell.f.startsWith("=") ? cell.f : `=${cell.f}`
        value = value ? `${value} (formula: ${formula})` : `formula: ${formula}`
      }
      row.push(value)
    }
    rows.push(row)
  }
  return rows
}

async function extractXlsxTextWithXlsx(
  file: Bun.BunFile,
  outputFormat: "text" | "markdown",
  warnings: string[],
  includeFormulas: boolean,
) {
  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "array" })
    if (!workbook.SheetNames.length) return ""
    const chunks: string[] = []
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]
      const rows = buildSheetMatrix(sheet, includeFormulas)
      if (!rows.length) continue
      const title = outputFormat === "markdown" ? `# ${name}` : `Sheet: ${name}`
      chunks.push(title)
      if (outputFormat === "markdown") {
        chunks.push("", rowsToMarkdownTable(rows))
      } else {
        const lines = trimEmptyRows(rows).map((row) => row.map((cell) => String(cell ?? "")).join("\t"))
        chunks.push("", lines.join("\n"))
      }
      chunks.push("")
    }
    if (includeFormulas) {
      warnings.push("xlsx formulas were emitted as text and not evaluated")
    }
    warnings.push("xlsx extracted with spreadsheet parser (formulas/formatting may be simplified)")
    return chunks.join("\n").trim()
  } catch (error) {
    warnings.push(`xlsx parser fallback: ${(error as Error).message}`)
    return ""
  }
}

async function extractXlsxText(
  zipFile: Bun.BunFile,
  outputFormat: "text" | "markdown",
  warnings: string[],
  includeFormulas: boolean,
) {
  const withLib = await extractXlsxTextWithXlsx(zipFile, outputFormat, warnings, includeFormulas)
  if (withLib.trim()) return withLib

  const sharedXml = await readZipTextEntry(zipFile, "xl/sharedStrings.xml")
  const shared = sharedXml ? parseSharedStrings(sharedXml) : []
  const sheets = await readZipEntries(zipFile, (name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
  if (sheets.length === 0) return ""
  return sheets
    .map((s) => `# ${path.posix.basename(s.filename, ".xml")}\n\n${extractXlsxSheetText(s.text, shared)}`.trim())
    .join("\n\n")
    .trim()
}

async function extractPdfText(
  file: Bun.BunFile,
  opts: { outputFormat: "text" | "markdown"; maxPages?: number },
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = ""
  }
  const data = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  const totalPages = doc.numPages
  const limit = Math.min(totalPages, opts.maxPages ?? totalPages)
  const parts: string[] = []
  for (let i = 1; i <= limit; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: any) => String(item.str ?? "")).join(" ").replace(/\s+/g, " ").trim()
    if (opts.outputFormat === "markdown") {
      parts.push(`# Page ${i}`, "", text, "")
    } else {
      parts.push(`Page ${i}`, text, "")
    }
  }
  return parts.join("\n").trim()
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
    includeSlideNotes: z.boolean().optional().describe("Include PPTX speaker notes when extracting text"),
    pdfExtract: z.boolean().optional().describe("Attempt PDF text extraction instead of attaching the file"),
    pdfMaxPages: z.number().int().positive().optional().describe("Limit PDF pages to extract when pdfExtract is true"),
    docxIncludeComments: z.boolean().optional().describe("Include DOCX comments (as an appendix section)"),
    docxTrackChanges: z.boolean().optional().describe("Render DOCX track changes with inline markers"),
    xlsxIncludeFormulas: z.boolean().optional().describe("Include Excel formulas as literal text"),
    maxChars: z.number().int().positive().max(2_000_000).optional().describe("Maximum characters to return"),
  }),
  async execute(params, ctx) {
    const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS
    const outputFormat = params.outputFormat ?? "text"
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
      const includeComments = params.docxIncludeComments ?? false
      const trackChanges = params.docxTrackChanges ?? false
      const commentsXml = includeComments ? await readZipTextEntry(file, "word/comments.xml") : null
      const comments = commentsXml ? extractDocxComments(commentsXml) : []

      if (outputFormat === "markdown" && !trackChanges) {
        const markdown = await extractDocxMarkdown(file, warnings)
        if (markdown) extracted = markdown
      }

      if (!extracted.trim()) {
        let xml = await readZipTextEntry(file, "word/document.xml")
        if (!xml) throw new Error("Invalid .docx: missing word/document.xml")
        if (trackChanges) {
          xml = applyDocxTrackChangesMarkers(xml)
          warnings.push("docx track changes rendered with inline markers")
        }
        extracted = extractDocxText(xml)
      }

      if (includeComments) {
        if (comments.length === 0) {
          warnings.push("docx comments requested but none found")
        } else {
          const commentLines =
            outputFormat === "markdown"
              ? [
                  "## Comments",
                  "",
                  ...comments.map((c) => {
                    const meta = [c.author, c.date].filter(Boolean).join(" ")
                    const prefix = meta ? ` (${meta})` : ""
                    return `- [C${c.id || "?"}]${prefix}: ${c.text}`
                  }),
                ]
              : [
                  "Comments:",
                  ...comments.map((c) => {
                    const meta = [c.author, c.date].filter(Boolean).join(" ")
                    const prefix = meta ? ` (${meta})` : ""
                    return `- [C${c.id || "?"}]${prefix}: ${c.text}`
                  }),
                ]
          extracted = [extracted.trimEnd(), commentLines.join("\n")].filter(Boolean).join("\n\n")
        }
      }
      warnings.push("docx text extraction is best-effort (formatting/tables not preserved)")
    } else if (ext === ".pptx") {
      extracted = await extractPptxText(file, {
        includeNotes: params.includeSlideNotes ?? false,
        outputFormat,
      })
      if (!extracted.trim()) warnings.push("pptx text extraction found no slide text")
      warnings.push("pptx text extraction is best-effort (layout/notes not preserved)")
    } else if (ext === ".xlsx") {
      extracted = await extractXlsxText(file, outputFormat, warnings, params.xlsxIncludeFormulas ?? false)
      if (!extracted.trim()) warnings.push("xlsx text extraction found no sheet text")
      warnings.push("xlsx text extraction is best-effort (formulas/formatting not preserved)")
    } else if (ext === ".pdf") {
      if (params.pdfExtract) {
        try {
          extracted = await extractPdfText(file, { outputFormat, maxPages: params.pdfMaxPages })
          if (!extracted.trim()) warnings.push("pdf text extraction produced empty output")
          warnings.push("pdf text extraction is best-effort (layout/tables may be lost)")
        } catch (error) {
          warnings.push(`pdf text extraction failed: ${(error as Error).message}`)
        }
      }
      if (params.pdfExtract && !extracted.trim()) {
        warnings.push("consider doc_ocr for scanned PDFs or image-only pages")
      }
      if (!extracted.trim()) {
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
            outputFormat,
          },
          attachments,
        }
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
        outputFormat,
      },
    }
  },
})

