import { projectRoot } from "./paths"

export type GitRunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export async function git(args: string[], opts?: { cwd?: string }): Promise<GitRunResult> {
  const cwd = opts?.cwd ?? projectRoot
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return { stdout, stderr, exitCode }
}

export async function requireGitRepo() {
  const res = await git(["rev-parse", "--is-inside-work-tree"])
  if (res.exitCode !== 0 || !res.stdout.trim().startsWith("true")) {
    throw new Error(`当前目录不是 git 仓库：${projectRoot}`)
  }
}

export async function isTracked(relToProjectPosix: string) {
  const res = await git(["ls-files", "--error-unmatch", "--", relToProjectPosix])
  return res.exitCode === 0
}

export function normalizeRef(ref: string | undefined, fallback: string) {
  const r = (ref ?? "").trim()
  return r ? r : fallback
}

export function isWorktreeRef(ref: string) {
  return ref.toUpperCase() === "WORKTREE"
}

