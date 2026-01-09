import fs from "fs/promises"
import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./fs-read.txt"
import { resolveNovelPath } from "../../novel/paths"
import { askRead } from "./util"

export const NovelFsReadTool = Tool.define("novel.fs.read", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("Path relative to novel/ (e.g. chapters/CH_01_001.md)"),
  }),
  async execute(params, ctx) {
    const resolved = resolveNovelPath(params.path)
    await askRead(ctx, resolved.abs)
    const output = await fs.readFile(resolved.abs, "utf8")
    return {
      title: resolved.relToProjectPosix,
      output,
      metadata: {
        path: resolved.relToProjectPosix,
      },
    }
  },
})

