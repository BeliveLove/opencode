import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "../tool"
import DESCRIPTION from "./convert.txt"
import { Pandoc } from "@/file/pandoc"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"
import { extractDocStylePayload } from "./style"
import { ZipReader, ZipWriter, BlobReader, BlobWriter } from "@zip.js/zip.js"
import { ensureMermaidCli } from "./mermaid-cli"

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

async function ensureWritableFile(ctx: Tool.Context, filePath: string) {
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
    permission: "edit",
    patterns: [filePath],
    always: ["*"],
    metadata: { filePath },
  })
}

type DocxFonts = {
  body?: string
  heading?: string
  mono?: string
}

const DEFAULT_DOCX_FONTS: DocxFonts = {
  body: "SimSun",
  heading: "SimHei",
  mono: "Consolas",
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function buildFontTag(font: string) {
  const safe = escapeXml(font)
  return `<w:rFonts w:ascii="${safe}" w:hAnsi="${safe}" w:eastAsia="${safe}" w:cs="${safe}"/>`
}

function replaceFontsInStyle(xml: string, styleId: string, fontTag: string) {
  const regex = new RegExp(`(<w:style[^>]*w:styleId="${styleId}"[\\s\\S]*?</w:style>)`, "g")
  return xml.replace(regex, (block) => {
    if (block.includes("<w:rFonts")) {
      return block.replace(/<w:rFonts[^/>]*\/>/g, fontTag)
    }
    if (block.includes("<w:rPr")) {
      return block.replace(/<w:rPr[^>]*>/, (match) => `${match}${fontTag}`)
    }
    return block.replace(/<w:style[^>]*>/, (match) => `${match}<w:rPr>${fontTag}</w:rPr>`)
  })
}

async function patchDocxFonts(docxPath: string, fonts: DocxFonts) {
  const data = await Bun.file(docxPath).arrayBuffer()
  const reader = new ZipReader(new BlobReader(new Blob([data])))
  const writer = new ZipWriter(
    new BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  )
  try {
    const entries = await reader.getEntries()
    for (const entry of entries) {
      if (entry.directory) continue
      const blob = await entry.getData?.(new BlobWriter())
      if (!blob) continue
      if (entry.filename === "word/styles.xml") {
        let stylesXml = await blob.text()
        if (fonts.body) {
          const bodyTag = buildFontTag(fonts.body)
          stylesXml = stylesXml.replace(/<w:rFonts[^/>]*\/>/g, bodyTag)
        }
        if (fonts.heading) {
          const headingTag = buildFontTag(fonts.heading)
          const headingStyles = ["Title", "Subtitle", "Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6"]
          for (const styleId of headingStyles) {
            stylesXml = replaceFontsInStyle(stylesXml, styleId, headingTag)
          }
        }
        if (fonts.mono) {
          const monoTag = buildFontTag(fonts.mono)
          const monoStyles = ["SourceCode", "Code", "CodeBlock", "Verbatim", "Preformatted"]
          for (const styleId of monoStyles) {
            stylesXml = replaceFontsInStyle(stylesXml, styleId, monoTag)
          }
        }
        const updatedBlob = new Blob([stylesXml], { type: "application/xml" })
        await writer.add(entry.filename, new BlobReader(updatedBlob))
        continue
      }
      await writer.add(entry.filename, new BlobReader(blob))
    }
    const outBlob = await writer.close()
    await fs.writeFile(docxPath, new Uint8Array(await outBlob.arrayBuffer()))
  } finally {
    await reader.close().catch(() => {})
  }
}

async function patchDocxUpdateFields(docxPath: string) {
  const data = await Bun.file(docxPath).arrayBuffer()
  const reader = new ZipReader(new BlobReader(new Blob([data])))
  const writer = new ZipWriter(
    new BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  )
  let updatedSettings = false
  try {
    const entries = await reader.getEntries()
    for (const entry of entries) {
      if (entry.directory) continue
      const blob = await entry.getData?.(new BlobWriter())
      if (!blob) continue
      if (entry.filename === "word/settings.xml") {
        let settingsXml = await blob.text()
        if (settingsXml.includes("w:updateFields")) {
          settingsXml = settingsXml.replace(/<w:updateFields[^/>]*\/>/g, '<w:updateFields w:val="true"/>')
        } else {
          settingsXml = settingsXml.replace(
            /<w:settings[^>]*>/,
            (match) => `${match}<w:updateFields w:val="true"/>`,
          )
        }
        const updatedBlob = new Blob([settingsXml], { type: "application/xml" })
        await writer.add(entry.filename, new BlobReader(updatedBlob))
        updatedSettings = true
        continue
      }
      await writer.add(entry.filename, new BlobReader(blob))
    }
    if (!updatedSettings) {
      await writer.add(
        "word/settings.xml",
        new BlobReader(
          new Blob(
            ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>'],
            { type: "application/xml" },
          ),
        ),
      )
    }
    const outBlob = await writer.close()
    await fs.writeFile(docxPath, new Uint8Array(await outBlob.arrayBuffer()))
  } finally {
    await reader.close().catch(() => {})
  }
}

async function createReferenceDocx(pandocPath: string, fonts: DocxFonts, workDir: string) {
  const referenceDir = path.join(workDir, ".opencode", "doc", "tmp", `reference-${Date.now()}`)
  await fs.mkdir(referenceDir, { recursive: true })
  const sourcePath = path.join(referenceDir, "reference.md")
  const referenceDocxPath = path.join(referenceDir, "reference.docx")
  const baseMarkdown = ["# Title", "", "Body text.", "", "## Heading 1", "", "`code`", ""].join("\n")
  await fs.writeFile(sourcePath, baseMarkdown, "utf8")

  const proc = Bun.spawn([pandocPath, sourcePath, "-o", referenceDocxPath], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: Instance.directory,
    env: { ...process.env },
  })
  await proc.exited
  if (proc.exitCode !== 0) {
    const stdout = await Bun.readableStreamToText(proc.stdout)
    const stderr = await Bun.readableStreamToText(proc.stderr)
    const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n")
    throw new Error(`pandoc reference docx failed (exit ${proc.exitCode})${details ? `:\n${details}` : ""}`)
  }

  await patchDocxFonts(referenceDocxPath, fonts)
  return referenceDocxPath
}

function hasArg(args: string[], flag: string) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`))
}

function resolveDocxPath(docxPath: string, baseDir: string) {
  if (path.isAbsolute(docxPath)) return docxPath
  return path.resolve(baseDir, docxPath)
}

function toPosixPath(value: string) {
  return value.replaceAll("\\", "/")
}

function formatMarkdownPath(value: string) {
  const normalized = toPosixPath(value)
  if (/\s|\(|\)/.test(normalized)) return `<${normalized}>`
  return normalized
}

function isRemotePath(value: string) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
}

function rewriteImageLinks(markdown: string, baseDir: string) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  return markdown.replace(imageRegex, (full, alt, raw) => {
    const trimmed = String(raw).trim()
    let pathPart = trimmed
    let titlePart = ""

    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      pathPart = trimmed.slice(1, -1).trim()
    } else {
      let inQuote = false
      let splitAt = -1
      for (let i = 0; i < trimmed.length; i += 1) {
        const ch = trimmed[i]
        if (ch === '"') inQuote = !inQuote
        if (!inQuote && /\s/.test(ch)) {
          splitAt = i
          break
        }
      }
      if (splitAt !== -1) {
        pathPart = trimmed.slice(0, splitAt).trim()
        titlePart = trimmed.slice(splitAt).trim()
      }
    }

    if (!pathPart || isRemotePath(pathPart)) {
      return full
    }

    if (!path.isAbsolute(pathPart)) {
      return full
    }

    const resolved = path.resolve(pathPart)
    const relative = path
      .relative(baseDir, resolved)
      .split(path.sep)
      .join("/")
    const formatted = formatMarkdownPath(relative)
    const withTitle = titlePart ? `${formatted} ${titlePart}` : formatted
    return `![${alt}](${withTitle})`
  })
}

async function renderMermaidBlocks(
  markdown: string,
  outputDir: string,
  diagramPrefix: string,
  sourceDir: string,
) {
  const mmdcPath = await ensureMermaidCli()

  await fs.mkdir(outputDir, { recursive: true })
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let index = 0
  let updated = markdown

  while ((match = mermaidRegex.exec(markdown)) !== null) {
    index += 1
    const mermaidSource = match[1].trim()
    const diagramBase = `${diagramPrefix}-${index}`
    const mmdPath = path.join(outputDir, `${diagramBase}.mmd`)
    const imgPath = path.join(outputDir, `${diagramBase}.png`)

    await fs.writeFile(mmdPath, mermaidSource, "utf8")

    const proc = Bun.spawn([mmdcPath, "-i", mmdPath, "-o", imgPath], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: Instance.directory,
      env: { ...process.env },
    })
    await proc.exited
    const stderr = await Bun.readableStreamToText(proc.stderr)
    if (proc.exitCode !== 0) {
      throw new Error(`mmdc failed (exit ${proc.exitCode})${stderr ? `:\n${stderr.trim()}` : ""}`)
    }

    const relImgPath = path
      .relative(sourceDir, imgPath)
      .split(path.sep)
      .join("/")
    const replacement = `![${diagramBase}](${formatMarkdownPath(relImgPath)})`
    updated = updated.replace(match[0], replacement)
  }

  return { updated, count: index }
}

export const DocConvertTool = Tool.define("doc.convert", {
  description: DESCRIPTION,
  parameters: z.object({
    inputPath: z.string().describe("Path to the input file (absolute or relative)"),
    outputPath: z.string().describe("Path to the output file (absolute or relative)"),
    from: z.string().optional().describe("Optional pandoc input format (-f)"),
    to: z.string().optional().describe("Optional pandoc output format (-t)"),
    args: z.array(z.string()).optional().describe("Optional extra pandoc arguments"),
  }),
  async execute(params, ctx) {
    let inputPath = params.inputPath
    if (!path.isAbsolute(inputPath)) inputPath = path.join(process.cwd(), inputPath)
    inputPath = path.resolve(inputPath)

    let outputPath = params.outputPath
    if (!path.isAbsolute(outputPath)) outputPath = path.join(process.cwd(), outputPath)
    outputPath = path.resolve(outputPath)

    await ensureReadableFile(ctx, inputPath)
    await ensureWritableFile(ctx, outputPath)

    const inputFile = Bun.file(inputPath)
    if (!(await inputFile.exists())) {
      throw new Error(`Input file not found: ${inputPath}`)
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    const pandocPath = await Pandoc.filepath()
    const outputExt = path.extname(outputPath).toLowerCase()
    const toDocx = outputExt === ".docx" || params.to?.toLowerCase() === "docx"

    let effectiveInputPath = inputPath
    let referenceDocxPath: string | undefined
    let mermaidRendered = 0

    const inputText = await inputFile.text()
    const docStyle = extractDocStylePayload(inputText)
    const sourceDir = path.dirname(inputPath)
    if (docStyle) {
      const tempDir = path.join(Instance.directory, ".opencode", "doc", "tmp", `convert-${Date.now()}`)
      await fs.mkdir(tempDir, { recursive: true })
      effectiveInputPath = path.join(tempDir, path.basename(inputPath))
      await fs.writeFile(effectiveInputPath, docStyle.styledMarkdown, "utf8")

      const shouldRenderMermaid =
        docStyle.hints.diagramStyle === undefined || docStyle.hints.diagramStyle.toLowerCase() === "mermaid"
      if (shouldRenderMermaid && docStyle.styledMarkdown.includes("```mermaid") && (toDocx || outputExt === ".pdf")) {
        const diagramDir = path.join(Instance.directory, "diagrams")
        const diagramPrefix = path.basename(outputPath, path.extname(outputPath)) || "diagram"
        const rendered = await renderMermaidBlocks(
          docStyle.styledMarkdown,
          diagramDir,
          diagramPrefix,
          sourceDir,
        )
        mermaidRendered = rendered.count
        const rewritten = rewriteImageLinks(rendered.updated, sourceDir)
        await fs.writeFile(effectiveInputPath, rewritten, "utf8")
      } else {
        const rewritten = rewriteImageLinks(docStyle.styledMarkdown, sourceDir)
        await fs.writeFile(effectiveInputPath, rewritten, "utf8")
      }
    }

    if (!docStyle && (toDocx || outputExt === ".pdf") && inputText.includes("```mermaid")) {
      const tempDir = path.join(Instance.directory, ".opencode", "doc", "tmp", `convert-${Date.now()}`)
      await fs.mkdir(tempDir, { recursive: true })
      effectiveInputPath = path.join(tempDir, path.basename(inputPath))
      const diagramDir = path.join(Instance.directory, "diagrams")
      const diagramPrefix = path.basename(outputPath, path.extname(outputPath)) || "diagram"
      const rendered = await renderMermaidBlocks(
        inputText,
        diagramDir,
        diagramPrefix,
        sourceDir,
      )
      mermaidRendered = rendered.count
      const rewritten = rewriteImageLinks(rendered.updated, sourceDir)
      await fs.writeFile(effectiveInputPath, rewritten, "utf8")
    } else if (!docStyle && effectiveInputPath !== inputPath) {
      const rewritten = rewriteImageLinks(inputText, sourceDir)
      await fs.writeFile(effectiveInputPath, rewritten, "utf8")
    }

    const args = [effectiveInputPath, "-o", outputPath]
    if (params.from) args.push("-f", params.from)
    if (params.to) args.push("-t", params.to)

    const extraArgs = [...(params.args ?? [])]
    if (docStyle?.hints.pandocArgs?.length) extraArgs.push(...docStyle.hints.pandocArgs)

    const hasReferenceDoc = hasArg(extraArgs, "--reference-doc")
    if (docStyle?.hints.referenceDocx && docStyle.hints.referenceDocx.trim() && !hasReferenceDoc) {
      referenceDocxPath = resolveDocxPath(docStyle.hints.referenceDocx, path.dirname(inputPath))
      extraArgs.push("--reference-doc", referenceDocxPath)
    }

    const tocEnabled = docStyle?.hints.toc
    if (!hasArg(extraArgs, "--toc")) {
      if (tocEnabled) {
        extraArgs.push("--toc")
      } else if (toDocx && /(^|\n)#{1,6}\s+/m.test(docStyle?.styledMarkdown ?? inputText)) {
        extraArgs.push("--toc")
      }
    }
    if (!hasArg(extraArgs, "--toc-depth")) {
      if (docStyle?.hints.tocDepth !== undefined) {
        extraArgs.push("--toc-depth", String(docStyle.hints.tocDepth))
      } else if (toDocx) {
        extraArgs.push("--toc-depth", "5")
      }
    }

    if (toDocx && !hasReferenceDoc && !referenceDocxPath) {
      const fonts: DocxFonts = {
        body: docStyle?.hints.fontBody ?? DEFAULT_DOCX_FONTS.body,
        heading: docStyle?.hints.fontHeading ?? DEFAULT_DOCX_FONTS.heading,
        mono: docStyle?.hints.fontMono ?? DEFAULT_DOCX_FONTS.mono,
      }
      referenceDocxPath = await createReferenceDocx(pandocPath, fonts, Instance.directory)
      extraArgs.push("--reference-doc", referenceDocxPath)
    }

    const hasResourcePath = hasArg(extraArgs, "--resource-path")
    if (!hasResourcePath) {
      const diagramDir = path.join(Instance.directory, "diagrams")
      const resourcePath = [sourceDir, diagramDir, Instance.directory].join(path.delimiter)
      extraArgs.push("--resource-path", resourcePath)
    }

    if (extraArgs.length) args.push(...extraArgs)

    const proc = Bun.spawn([pandocPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: Instance.directory,
      env: { ...process.env },
    })
    await proc.exited
    const stdout = await Bun.readableStreamToText(proc.stdout)
    const stderr = await Bun.readableStreamToText(proc.stderr)
    if (proc.exitCode !== 0) {
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n")
      throw new Error(`pandoc conversion failed (exit ${proc.exitCode})${details ? `:\n${details}` : ""}`)
    }

    if (toDocx) {
      await patchDocxUpdateFields(outputPath)
    }

    return {
      title: path.relative(Instance.worktree, outputPath),
      output: `converted ${path.relative(Instance.worktree, inputPath)} -> ${path.relative(Instance.worktree, outputPath)}`,
      metadata: {
        inputPath,
        outputPath,
        effectiveInputPath,
        referenceDocxPath,
        mermaidRendered,
        exitCode: proc.exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      },
    }
  },
})
