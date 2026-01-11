import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "../tool"
import DESCRIPTION from "./diagram-render.txt"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"
import { extractDocStylePayload } from "./style"
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

async function ensureWritableDir(ctx: Tool.Context, dirPath: string) {
  if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, dirPath)) {
    const parentDir = path.dirname(dirPath)
    await ctx.ask({
      permission: "external_directory",
      patterns: [parentDir],
      always: [parentDir + "/*"],
      metadata: { dirPath, parentDir },
    })
  }

  await ctx.ask({
    permission: "edit",
    patterns: [dirPath, path.join(dirPath, "*")],
    always: ["*"],
    metadata: { dirPath },
  })
}

export const DocDiagramRenderTool = Tool.define("doc.diagram.render", {
  description: DESCRIPTION,
  parameters: z.object({
    inputPath: z.string().describe("Path to the input Markdown file"),
    outputPath: z.string().describe("Path to the output Markdown file with images"),
    outputDir: z.string().optional().describe("Directory for rendered images (defaults to ./diagrams next to output)"),
    format: z.enum(["png", "svg"]).optional().describe("Image format (png or svg). Default: png"),
    args: z.array(z.string()).optional().describe("Extra arguments to pass to mmdc"),
  }),
  async execute(params, ctx) {
    let inputPath = params.inputPath
    if (!path.isAbsolute(inputPath)) inputPath = path.join(process.cwd(), inputPath)
    inputPath = path.resolve(inputPath)

    let outputPath = params.outputPath
    if (!path.isAbsolute(outputPath)) outputPath = path.join(process.cwd(), outputPath)
    outputPath = path.resolve(outputPath)

    const outputDir =
      params.outputDir ??
      (Filesystem.contains(Instance.directory, outputPath)
        ? path.join(Instance.directory, "diagrams")
        : path.join(path.dirname(outputPath), "diagrams"))

    await ensureReadableFile(ctx, inputPath)
    await ensureWritableDir(ctx, outputDir)
    await ensureWritableDir(ctx, path.dirname(outputPath))

    const inputFile = Bun.file(inputPath)
    if (!(await inputFile.exists())) {
      throw new Error(`Input file not found: ${inputPath}`)
    }

    const mmdcPath = await ensureMermaidCli()

    await fs.mkdir(outputDir, { recursive: true })

    const rawMarkdown = await inputFile.text()
    const styled = extractDocStylePayload(rawMarkdown)
  const markdown = styled?.styledMarkdown ?? rawMarkdown
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let index = 0
  let updated = markdown
  const headings: { level: number; text: string; index: number }[] = []
  let inFence = false
  let fenceMarker = ""
  let offset = 0

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith("```")) {
      if (!inFence) {
        inFence = true
        fenceMarker = "```"
      } else if (trimmed.startsWith(fenceMarker)) {
        inFence = false
      }
      offset += line.length + 1
      continue
    }
    if (!inFence) {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line)
      if (headingMatch) {
        headings.push({
          level: headingMatch[1].length,
          text: headingMatch[2].trim().replace(/\s+#\s*$/, ""),
          index: offset,
        })
      }
    }
    offset += line.length + 1
  }

  const normalizeHeadingForCaption = (text: string) => {
    let value = text.trim()
    value = value.replace(/^\d+(?:\.\d+)*\s*/, "")
    value = value.replace(/^[\)\]}.。\-\s]+/, "")
    value = value.trim()
    if (!value) return ""
    if (!value.endsWith("图") && !value.endsWith("图示") && !value.endsWith("示意")) {
      return `${value}图`
    }
    return value
  }

  const sanitizeAltText = (text: string) => text.replace(/[\[\]]/g, "").trim()

  const stripDiagramSuffix = (text: string) => text.replace(/(图示|示意|图)$/u, "").trim()

  const buildDiagramCaption = (index: number, caption: string) => {
    const base = stripDiagramSuffix(caption)
    const label = `图 ${index}：${caption}`
    const descriptionBase = base || "相关结构"
    const description = `说明：本图展示${descriptionBase}的主要组成与关系。`
    return { label, description }
  }

  while ((match = mermaidRegex.exec(markdown)) !== null) {
    index += 1
    const mermaidSource = match[1].trim()
    const diagramBase = `diagram-${index}`
    const mmdPath = path.join(outputDir, `${diagramBase}.mmd`)
    const imgExt = params.format ?? "png"
    const imgPath = path.join(outputDir, `${diagramBase}.${imgExt}`)

    await fs.writeFile(mmdPath, mermaidSource, "utf8")

    const args = ["-i", mmdPath, "-o", imgPath]
    if (params.args?.length) args.push(...params.args)

    const proc = Bun.spawn([mmdcPath, ...args], {
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
      .relative(path.dirname(outputPath), imgPath)
      .split(path.sep)
      .join("/")
    const heading = [...headings].reverse().find((h) => h.index <= (match?.index ?? 0))
    const caption = heading ? normalizeHeadingForCaption(heading.text) : diagramBase
    const altText = sanitizeAltText(caption || diagramBase)
    const { label, description } = buildDiagramCaption(index, caption || diagramBase)
    const replacement = `![${altText}](${relImgPath})\n\n${label}\n\n${description}`
    updated = updated.replace(match[0], replacement)
  }
    await fs.writeFile(outputPath, updated, "utf8")

    return {
      title: path.relative(Instance.worktree, outputPath),
      output: `rendered ${index} mermaid diagram(s)`,
      metadata: {
        inputPath,
        outputPath,
        outputDir,
        count: index,
      },
    }
  },
})


