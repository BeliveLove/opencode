import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "../tool"
import DESCRIPTION from "./convert.txt"
import { Pandoc } from "@/file/pandoc"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"

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
    const args = [inputPath, "-o", outputPath]
    if (params.from) args.push("-f", params.from)
    if (params.to) args.push("-t", params.to)
    if (params.args?.length) args.push(...params.args)

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

    return {
      title: path.relative(Instance.worktree, outputPath),
      output: `converted ${path.relative(Instance.worktree, inputPath)} -> ${path.relative(Instance.worktree, outputPath)}`,
      metadata: {
        inputPath,
        outputPath,
        exitCode: proc.exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      },
    }
  },
})
