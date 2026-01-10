import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "../tool"
import DESCRIPTION from "./diagram-render.txt"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"

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
      path.join(path.dirname(outputPath), "diagrams")

    await ensureReadableFile(ctx, inputPath)
    await ensureWritableDir(ctx, outputDir)
    await ensureWritableDir(ctx, path.dirname(outputPath))

    const inputFile = Bun.file(inputPath)
    if (!(await inputFile.exists())) {
      throw new Error(`Input file not found: ${inputPath}`)
    }

    const mmdcPath = Bun.which("mmdc")
    if (!mmdcPath) {
      throw new Error(
        [
          "Mermaid CLI (mmdc) not found.",
          "Install it first:",
          "- npm i -g @mermaid-js/mermaid-cli",
          "- or bun add -g @mermaid-js/mermaid-cli",
        ].join("\n"),
      )
    }

    await fs.mkdir(outputDir, { recursive: true })

    const markdown = await inputFile.text()
    const mermaidRegex = /```mermaid\\s*([\\s\\S]*?)```/g
    let match: RegExpExecArray | null
    let index = 0
    let updated = markdown

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
      const replacement = `![${diagramBase}](${relImgPath})`
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
