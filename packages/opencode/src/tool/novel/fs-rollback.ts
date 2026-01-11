import fs from "fs/promises"
import z from "zod"
import { createTwoFilesPatch } from "diff"
import { Tool } from "../tool"
import DESCRIPTION from "./fs-rollback.txt"
import { git, isTracked, normalizeRef, requireGitRepo } from "../../novel/git"
import { resolveNovelPath } from "../../novel/paths"
import { askEdit } from "./util"
import { trimDiff } from "../edit"

async function gitShow(ref: string, relToProjectPosix: string) {
  const res = await git(["show", `${ref}:${relToProjectPosix}`])
  if (res.exitCode !== 0) return ""
  return res.stdout
}

export const NovelFsRollbackTool = Tool.define("novel_fs_rollback", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("Path relative to novel root"),
    ref: z.string().optional().describe("Git ref (default: HEAD)"),
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    await requireGitRepo()
    const resolved = await resolveNovelPath(params.path, { novelId: params.novelId })
    const ref = normalizeRef(params.ref, "HEAD")

    const tracked = await isTracked(resolved.relToProjectPosix)
    if (!tracked) throw new Error(`鏂囦欢鏈 git 璺熻釜锛屾棤娉曞洖婊氾細${resolved.relToProjectPosix}`)

    const before = await fs.readFile(resolved.abs, "utf8").catch(() => "")
    const after = await gitShow(ref, resolved.relToProjectPosix)
    const diff = trimDiff(createTwoFilesPatch(resolved.relToProjectPosix, resolved.relToProjectPosix, before, after))
    await askEdit(ctx, resolved.abs, { filepath: resolved.abs, diff, ref })

    let res = await git(["restore", "--source", ref, "--", resolved.relToProjectPosix])
    if (res.exitCode !== 0) {
      res = await git(["checkout", ref, "--", resolved.relToProjectPosix])
    }
    if (res.exitCode !== 0) {
      const msg = res.stderr.trim() || res.stdout.trim() || "git rollback failed"
      throw new Error(msg)
    }

    return {
      title: resolved.relToProjectPosix,
      output: `rolled back: ${resolved.relToProjectPosix} -> ${ref}`,
      metadata: { path: resolved.relToProjectPosix, ref },
    }
  },
})

