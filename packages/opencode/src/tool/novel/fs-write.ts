import fs from "fs/promises"
import path from "path"
import z from "zod"
import { createTwoFilesPatch } from "diff"
import { Tool } from "../tool"
import DESCRIPTION from "./fs-write.txt"
import { resolveNovelPath } from "../../novel/paths"
import { askEdit } from "./util"
import { trimDiff } from "../edit"

export const NovelFsWriteTool = Tool.define("novel.fs.write", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("Path relative to novel/ (e.g. canon/characters.yml)"),
    content: z.string().describe("File content to write"),
    mode: z.enum(["create", "overwrite", "append"]).default("overwrite"),
  }),
  async execute(params, ctx) {
    const resolved = resolveNovelPath(params.path)
    await fs.mkdir(path.dirname(resolved.abs), { recursive: true })

    const exists = await fs
      .access(resolved.abs)
      .then(() => true)
      .catch(() => false)
    const before = exists ? await fs.readFile(resolved.abs, "utf8").catch(() => "") : ""

    if (params.mode === "create" && exists) {
      return {
        title: resolved.relToProjectPosix,
        output: `skipped (already exists): ${resolved.relToProjectPosix}`,
        metadata: { path: resolved.relToProjectPosix, mode: "create", skipped: true, created: false },
      }
    }

    const after =
      params.mode === "append"
        ? before + params.content
        : // overwrite/create
          params.content

    const diff = trimDiff(createTwoFilesPatch(resolved.relToProjectPosix, resolved.relToProjectPosix, before, after))
    await askEdit(ctx, resolved.abs, { filepath: resolved.abs, diff })

    if (params.mode === "append") {
      await fs.appendFile(resolved.abs, params.content, "utf8")
      return {
        title: resolved.relToProjectPosix,
        output: `appended: ${resolved.relToProjectPosix}`,
        metadata: { path: resolved.relToProjectPosix, mode: "append", skipped: false, created: !exists },
      }
    }

    await fs.writeFile(resolved.abs, params.content, "utf8")
    return {
      title: resolved.relToProjectPosix,
      output: exists ? `wrote: ${resolved.relToProjectPosix}` : `created: ${resolved.relToProjectPosix}`,
      metadata: { path: resolved.relToProjectPosix, mode: params.mode, skipped: false, created: !exists },
    }
  },
})
