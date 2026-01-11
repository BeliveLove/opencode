import fs from "fs/promises"
import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./fs-read.txt"
import { resolveNovelPath } from "../../novel/paths"
import { askRead } from "./util"

export const NovelFsReadTool = Tool.define("novel_fs_read", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("Path relative to novel root (e.g. chapters/CH_01_001.md)"),
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    const resolved = await resolveNovelPath(params.path, { novelId: params.novelId })
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

