import fs from "fs/promises"
import path from "path"
import { Instance } from "../../project/instance"
import type { Tool } from "../tool"
import { legacyNovelRoot, novelsRoot, resolveNovelDir, resolveNovelPath } from "../../novel/paths"

export async function ensureNovelDirExists(options: { novelId?: string } = {}): Promise<boolean> {
  return resolveNovelDir(options)
    .then(async (dir) => {
      // If dir resolution succeeds, check existence.
      return fs
        .access(dir.abs)
        .then(() => true)
        .catch(() => false)
    })
    .catch(() => false)
}

export async function titleForNovelPath(inputPath: string, options: { novelId?: string } = {}) {
  const resolved = await resolveNovelPath(inputPath, options)
  return resolved.relToProjectPosix
}

export function relativeToWorktree(filepath: string) {
  return path.relative(Instance.worktree, filepath)
}

export async function novelPattern(relPattern: string, options: { novelId?: string } = {}) {
  const dir = await resolveNovelDir(options)
  const clean = relPattern.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "")
  if (!clean) return dir.relToProjectPosix
  return path.posix.join(dir.relToProjectPosix, clean)
}

export function novelsActiveFileAbs() {
  return path.join(novelsRoot(), ".active")
}

export function novelsRootAbs() {
  return novelsRoot()
}

export function legacyNovelRootAbs() {
  return legacyNovelRoot()
}

export async function askRead(ctx: Tool.Context, filepath: string) {
  await ctx.ask({
    permission: "read",
    patterns: [relativeToWorktree(filepath)],
    always: ["*"],
    metadata: {},
  })
}

export async function askReadPattern(ctx: Tool.Context, pattern: string, metadata: Record<string, any> = {}) {
  await ctx.ask({
    permission: "read",
    patterns: [pattern],
    always: ["*"],
    metadata,
  })
}

export async function askEdit(ctx: Tool.Context, filepath: string, metadata: Record<string, any>) {
  await ctx.ask({
    permission: "edit",
    patterns: [relativeToWorktree(filepath)],
    always: ["*"],
    metadata,
  })
}
