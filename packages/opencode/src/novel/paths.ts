import path from "path"
import { Instance } from "../project/instance"

export type ResolvedNovelPath = {
  abs: string
  relToNovel: string
  relToProjectPosix: string
}

export function projectRoot() {
  return Instance.worktree
}

export function novelRoot() {
  return path.join(projectRoot(), "novel")
}

export function resolveNovelPath(inputPath: string): ResolvedNovelPath {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("path 不能为空")
  }

  let p = inputPath.replaceAll("\\", "/").replace(/^\/+/, "")
  if (p.startsWith("novel/")) p = p.slice("novel/".length)
  if (!p) throw new Error("path 不能为空")

  const abs = path.resolve(novelRoot(), p)
  const rel = path.relative(novelRoot(), abs)

  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`非法路径（必须位于 novel/ 内）：${inputPath}`)
  }

  const relToNovel = rel
  const relToProjectPosix = path.join("novel", relToNovel).replaceAll("\\", "/")

  return { abs, relToNovel, relToProjectPosix }
}

