import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import { Archive } from "@/util/archive"
import { lazy } from "@/util/lazy"
import { Log } from "@/util/log"

export namespace Pandoc {
  const log = Log.create({ service: "pandoc" })
  const VERSION = "3.1.12"
  const BIN_NAME = process.platform === "win32" ? "pandoc.exe" : "pandoc"
  const MIRRORS = [
    "https://mirrors.tuna.tsinghua.edu.cn/github-release/jgm/pandoc/LatestRelease",
    "https://mirrors.bfsu.edu.cn/github-release/jgm/pandoc/LatestRelease",
  ]

  const PLATFORM = {
    "x64-win32": { asset: `pandoc-${VERSION}-windows-x86_64.zip`, kind: "zip" },
    "x64-linux": { asset: `pandoc-${VERSION}-linux-amd64.tar.gz`, kind: "tar.gz" },
    "arm64-linux": { asset: `pandoc-${VERSION}-linux-arm64.tar.gz`, kind: "tar.gz" },
    "x64-darwin": { asset: `pandoc-${VERSION}-macOS.zip`, kind: "zip" },
    "arm64-darwin": { asset: `pandoc-${VERSION}-macOS-arm64.zip`, kind: "zip" },
  } as const

  function ensurePath(dir: string) {
    const current = process.env.PATH ?? ""
    const parts = current.split(path.delimiter).filter(Boolean)
    if (!parts.includes(dir)) {
      process.env.PATH = [dir, current].filter(Boolean).join(path.delimiter)
    }
  }

  function manualInstallMessage(extra?: string) {
    const note = extra ? `${extra}\n\n` : ""
    return [
      note + "Pandoc is required for file conversion but is not available.",
      "Install pandoc manually and ensure it is on PATH, or set OPENCODE_PANDOC_BIN to its full path.",
      "Download URLs:",
      "- https://pandoc.org/installing.html",
      "- https://github.com/jgm/pandoc/releases/latest",
      "- https://mirrors.tuna.tsinghua.edu.cn/github-release/jgm/pandoc/LatestRelease/",
      "- https://mirrors.bfsu.edu.cn/github-release/jgm/pandoc/LatestRelease/",
    ].join("\n")
  }

  async function findBinary(root: string) {
    const glob = new Bun.Glob(`**/${BIN_NAME}`)
    for await (const match of glob.scan({
      cwd: root,
      absolute: true,
      onlyFiles: true,
      followSymlinks: true,
    })) {
      return match
    }
    return null
  }

  async function extractArchive(archivePath: string, extractDir: string, kind: "zip" | "tar.gz") {
    if (kind === "zip") {
      await Archive.extractZip(archivePath, extractDir)
      return
    }
    const proc = Bun.spawn(["tar", "-xzf", archivePath, "-C", extractDir], {
      stdout: "pipe",
      stderr: "pipe",
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      const stderr = await Bun.readableStreamToText(proc.stderr)
      throw new Error(`Failed to extract pandoc archive: ${stderr || "tar exited with error"}`)
    }
  }

  async function downloadFromMirrors(asset: string) {
    const errors: string[] = []
    for (const base of MIRRORS) {
      const url = `${base}/${asset}`
      const response = await fetch(url)
      if (response.ok) {
        return {
          url,
          buffer: await response.arrayBuffer(),
        }
      }
      errors.push(`${url} (HTTP ${response.status})`)
    }
    throw new Error(manualInstallMessage(`Auto-download failed from mirrors:\n${errors.join("\n")}`))
  }

  const state = lazy(async () => {
    const override = process.env.OPENCODE_PANDOC_BIN
    if (override) {
      const resolved = path.resolve(override)
      const file = Bun.file(resolved)
      if (!(await file.exists())) {
        throw new Error(manualInstallMessage(`OPENCODE_PANDOC_BIN not found: ${resolved}`))
      }
      ensurePath(path.dirname(resolved))
      return { filepath: resolved }
    }

    let filepath = Bun.which("pandoc")
    if (filepath) return { filepath }

    filepath = path.join(Global.Path.bin, BIN_NAME)
    if (await Bun.file(filepath).exists()) {
      ensurePath(path.dirname(filepath))
      return { filepath }
    }

    const platformKey = `${process.arch}-${process.platform}` as keyof typeof PLATFORM
    const platform = PLATFORM[platformKey]
    if (!platform) {
      throw new Error(manualInstallMessage(`Auto-download not supported for ${platformKey}.`))
    }

    const archivePath = path.join(Global.Path.bin, platform.asset)
    const extractDir = path.join(Global.Path.bin, `pandoc-${VERSION}-${process.pid}`)
    await fs.mkdir(extractDir, { recursive: true })

    try {
      const { url, buffer } = await downloadFromMirrors(platform.asset)
      log.info("downloaded pandoc", { url, archivePath })
      await Bun.write(archivePath, buffer)
      await extractArchive(archivePath, extractDir, platform.kind)
      const extracted = await findBinary(extractDir)
      if (!extracted) {
        throw new Error(`pandoc binary not found after extracting ${platform.asset}`)
      }
      await fs.copyFile(extracted, filepath)
      if (process.platform !== "win32") {
        await fs.chmod(filepath, 0o755)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Pandoc is required")) {
        throw error
      }
      throw new Error(manualInstallMessage(String(error)))
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {})
      await fs.rm(archivePath, { force: true }).catch(() => {})
    }

    ensurePath(path.dirname(filepath))
    process.env.OPENCODE_PANDOC_BIN = filepath
    return { filepath }
  })

  export async function filepath() {
    return state().then((x) => x.filepath)
  }

  export function reset() {
    state.reset()
  }
}
