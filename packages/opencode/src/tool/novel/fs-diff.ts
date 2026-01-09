import fs from "fs/promises"
import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./fs-diff.txt"
import { unifiedDiff } from "../../novel/diff"
import { git, isTracked, isWorktreeRef, normalizeRef, requireGitRepo } from "../../novel/git"
import { resolveNovelPath } from "../../novel/paths"

export const NovelFsDiffTool = Tool.define("novel.fs.diff", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("Path relative to novel/"),
    aRef: z.string().optional().describe("Git ref (default: HEAD)"),
    bRef: z.string().optional().describe("Git ref or WORKTREE (default: WORKTREE)"),
  }),
  async execute(params, _ctx) {
    await requireGitRepo()
    const resolved = resolveNovelPath(params.path)
    const aRef = normalizeRef(params.aRef, "HEAD")
    const bRef = normalizeRef(params.bRef, "WORKTREE")

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
      return {
        title: resolved.relToProjectPosix,
        output: patch.trimEnd(),
        metadata: { path: resolved.relToProjectPosix, aRef: "untracked", bRef: "worktree" },
      }
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
    return {
      title: resolved.relToProjectPosix,
      output: res.stdout.trimEnd() || "(no diff)",
      metadata: { path: resolved.relToProjectPosix, aRef, bRef },
    }
  },
})
