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

export const NovelFsRollbackTool = Tool.define("novel.fs.rollback", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("Path relative to novel/"),
    ref: z.string().optional().describe("Git ref (default: HEAD)"),
  }),
  async execute(params, ctx) {
    await requireGitRepo()
    const resolved = resolveNovelPath(params.path)
    const ref = normalizeRef(params.ref, "HEAD")

    const tracked = await isTracked(resolved.relToProjectPosix)
    if (!tracked) throw new Error(`文件未被 git 跟踪，无法回滚：${resolved.relToProjectPosix}`)

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

