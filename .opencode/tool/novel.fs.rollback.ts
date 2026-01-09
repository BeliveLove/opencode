/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.fs.rollback.txt"
import { git, isTracked, normalizeRef, requireGitRepo } from "../novel/git"
import { resolveNovelPath } from "../novel/paths"

export default tool({
  description: DESCRIPTION,
  args: {
    path: tool.schema.string().describe("Path relative to novel/"),
    ref: tool.schema.string().optional().describe("Git ref (default: HEAD)"),
  },
  async execute(args) {
    await requireGitRepo()
    const resolved = resolveNovelPath(args.path)
    const ref = normalizeRef(args.ref, "HEAD")

    const tracked = await isTracked(resolved.relToProjectPosix)
    if (!tracked) throw new Error(`文件未被 git 跟踪，无法回滚：${resolved.relToProjectPosix}`)

    let res = await git(["restore", "--source", ref, "--", resolved.relToProjectPosix])
    if (res.exitCode !== 0) {
      res = await git(["checkout", ref, "--", resolved.relToProjectPosix])
    }
    if (res.exitCode !== 0) {
      const msg = res.stderr.trim() || res.stdout.trim() || "git rollback failed"
      throw new Error(msg)
    }

    return `rolled back: ${resolved.relToProjectPosix} -> ${ref}`
  },
})

