/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.fs.diff.txt"
import fs from "fs/promises"
import { unifiedDiff } from "../novel/diff"
import { git, isTracked, isWorktreeRef, normalizeRef, requireGitRepo } from "../novel/git"
import { resolveNovelPath } from "../novel/paths"

export default tool({
  description: DESCRIPTION,
  args: {
    path: tool.schema.string().describe("Path relative to novel/"),
    aRef: tool.schema.string().optional().describe("Git ref (default: HEAD)"),
    bRef: tool.schema.string().optional().describe("Git ref or WORKTREE (default: WORKTREE)"),
  },
  async execute(args) {
    await requireGitRepo()
    const resolved = resolveNovelPath(args.path)
    const aRef = normalizeRef(args.aRef, "HEAD")
    const bRef = normalizeRef(args.bRef, "WORKTREE")

    const tracked = await isTracked(resolved.relToProjectPosix)
    if (!tracked && (isWorktreeRef(aRef) || isWorktreeRef(bRef) || aRef === "HEAD" || bRef === "HEAD")) {
      const after = await fs.readFile(resolved.abs, "utf8").catch(() => "")
      const patch = unifiedDiff({
        filePath: resolved.relToProjectPosix,
        before: "",
        after,
        fromLabel: "untracked",
        toLabel: "worktree",
      })
      return patch.trimEnd()
    }

    const res = await (async () => {
      if (isWorktreeRef(bRef)) {
        return git(["diff", aRef, "--", resolved.relToProjectPosix])
      }
      if (isWorktreeRef(aRef)) {
        return git(["diff", bRef, "--", resolved.relToProjectPosix])
      }
      return git(["diff", aRef, bRef, "--", resolved.relToProjectPosix])
    })()

    if (res.exitCode !== 0) {
      const msg = res.stderr.trim() || res.stdout.trim() || "git diff failed"
      throw new Error(msg)
    }
    return res.stdout.trimEnd() || "(no diff)"
  },
})

