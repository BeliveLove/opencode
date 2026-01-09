import fs from "fs/promises"
import path from "path"
import { Instance } from "../../project/instance"
import type { Tool } from "../tool"
import { novelRoot, resolveNovelPath } from "../../novel/paths"

export async function ensureNovelDirExists(): Promise<boolean> {
  return fs
    .access(novelRoot())
    .then(() => true)
    .catch(() => false)
}

export function titleForNovelPath(inputPath: string) {
  const resolved = resolveNovelPath(inputPath)
  return resolved.relToProjectPosix
}

export function relativeToWorktree(filepath: string) {
  return path.relative(Instance.worktree, filepath)
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
