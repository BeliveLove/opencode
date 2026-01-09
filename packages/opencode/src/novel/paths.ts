import fs from "fs/promises"
import path from "path"
import { Instance } from "../project/instance"

export type ResolvedNovelDir = {
  abs: string
  kind: "novels" | "legacy"
  novelId?: string
  relToProjectPosix: string
}

export type ResolvedNovelPath = {
  abs: string
  relToNovel: string
  relToProjectPosix: string
  novelDir: ResolvedNovelDir
}

export function projectRoot() {
  return Instance.worktree
}

export function novelsRoot() {
  return path.join(projectRoot(), "novels")
}

export function legacyNovelRoot() {
  return path.join(projectRoot(), "novel")
}

async function pathExists(p: string) {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false)
}

async function readActiveNovelId(): Promise<string | null> {
  const activeFile = path.join(novelsRoot(), ".active")
  const content = await fs.readFile(activeFile, "utf8").catch(() => "")
  const id = content.trim()
  return id ? id : null
}

export async function listNovelIds(): Promise<string[]> {
  const root = novelsRoot()
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => name && !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b))
  return dirs
}

export async function resolveNovelDir(options: { novelId?: string } = {}): Promise<ResolvedNovelDir> {
  if (options.novelId) {
    const novelId = options.novelId.trim()
    if (!novelId) throw new Error("novelId 不能为空")
    return {
      abs: path.join(novelsRoot(), novelId),
      kind: "novels",
      novelId,
      relToProjectPosix: path.posix.join("novels", novelId),
    }
  }

  const hasNovelsRoot = await pathExists(novelsRoot())
  let ids: string[] = []
  if (hasNovelsRoot) {
    const active = await readActiveNovelId().catch(() => null)
    if (active && (await pathExists(path.join(novelsRoot(), active)))) {
      return {
        abs: path.join(novelsRoot(), active),
        kind: "novels",
        novelId: active,
        relToProjectPosix: path.posix.join("novels", active),
      }
    }

    ids = await listNovelIds()
    if (ids.length === 1) {
      const only = ids[0]!
      return {
        abs: path.join(novelsRoot(), only),
        kind: "novels",
        novelId: only,
        relToProjectPosix: path.posix.join("novels", only),
      }
    }

    if (ids.length > 1) {
      throw new Error("未选择当前小说：请运行 novel-use <novel_id> 或创建 novels/.active")
    }
  }

  // Fallback to legacy only when `novels/` is absent or empty.
  const hasLegacy = await pathExists(legacyNovelRoot())
  if (hasLegacy && (!hasNovelsRoot || ids.length === 0)) {
    return { abs: legacyNovelRoot(), kind: "legacy", relToProjectPosix: "novel" }
  }

  if (hasNovelsRoot) {
    throw new Error("未选择当前小说：请运行 novel-use <novel_id> 或创建 novels/.active")
  }
  throw new Error("未找到 novels/ 或 novel/ 目录，请先运行 novel-init")
}

function normalizeInputPath(inputPath: string) {
  if (!inputPath || typeof inputPath !== "string") throw new Error("path 不能为空")
  const p = inputPath.replaceAll("\\", "/").replace(/^\/+/, "")
  if (!p) throw new Error("path 不能为空")
  return p
}

function assertInside(baseAbs: string, baseLabel: string, inputPath: string, targetAbs: string) {
  const rel = path.relative(baseAbs, targetAbs)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`非法路径（必须位于 ${baseLabel} 内）：${inputPath}`)
  }
  return rel
}

export async function resolveNovelPath(
  inputPath: string,
  options: {
    novelId?: string
  } = {},
): Promise<ResolvedNovelPath> {
  const p = normalizeInputPath(inputPath)

  // Explicit roots
  if (p.startsWith("novels/")) {
    const parts = p.split("/")
    const novelId = (parts[1] ?? "").trim()
    const rest = parts.slice(2).join("/").trim()
    if (!novelId) throw new Error(`非法路径（缺少 novel_id）：${inputPath}`)
    if (!rest) throw new Error(`非法路径（缺少相对路径）：${inputPath}`)
    const novelDir: ResolvedNovelDir = {
      abs: path.join(novelsRoot(), novelId),
      kind: "novels",
      novelId,
      relToProjectPosix: path.posix.join("novels", novelId),
    }
    const abs = path.resolve(novelDir.abs, rest)
    const relToNovel = assertInside(novelDir.abs, `${novelDir.relToProjectPosix}/`, inputPath, abs).replaceAll("\\", "/")
    const relToProjectPosix = path.posix.join(novelDir.relToProjectPosix, relToNovel)
    return { abs, relToNovel, relToProjectPosix, novelDir }
  }

  if (p.startsWith("novel/")) {
    const rest = p.slice("novel/".length).trim()
    if (!rest) throw new Error(`非法路径（缺少相对路径）：${inputPath}`)
    const novelDir: ResolvedNovelDir = { abs: legacyNovelRoot(), kind: "legacy", relToProjectPosix: "novel" }
    const abs = path.resolve(novelDir.abs, rest)
    const relToNovel = assertInside(novelDir.abs, `${novelDir.relToProjectPosix}/`, inputPath, abs).replaceAll("\\", "/")
    const relToProjectPosix = path.posix.join(novelDir.relToProjectPosix, relToNovel)
    return { abs, relToNovel, relToProjectPosix, novelDir }
  }

  // Default: active/selected novel, or explicit novelId override
  const novelDir = await resolveNovelDir({ novelId: options.novelId })
  const abs = path.resolve(novelDir.abs, p)
  const relToNovel = assertInside(novelDir.abs, `${novelDir.relToProjectPosix}/`, inputPath, abs).replaceAll("\\", "/")
  const relToProjectPosix = path.posix.join(novelDir.relToProjectPosix, relToNovel)
  return { abs, relToNovel, relToProjectPosix, novelDir }
}
