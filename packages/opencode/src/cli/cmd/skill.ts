import { cmd } from "./cmd"
import { Instance } from "../../project/instance"
import { Skill } from "../../skill/skill"
import { Global } from "../../global"
import { ConfigMarkdown } from "../../config/markdown"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import path from "path"
import fs from "fs/promises"
import os from "os"
import matter from "gray-matter"
import { Archive } from "../../util/archive"
import { $ } from "bun"
import type { Argv } from "yargs"

type Scope = "global" | "project"
type SourceType = "npm" | "pypi" | "url" | "file"

type InstallSource = {
  type: SourceType
  spec: string
  subpath?: string
}

const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SKILL_MAX_LEN = 64

function validateSkillName(name: string) {
  if (!name || name.length < 1 || name.length > SKILL_MAX_LEN || !SKILL_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid skill name "${name}". Must match ${SKILL_NAME_REGEX.source} and be 1-${SKILL_MAX_LEN} characters.`,
    )
  }
}

function normalizeSkillRoot(inputPath: string) {
  const resolved = path.resolve(inputPath)
  const base = path.basename(resolved)
  if (base === "skill" || base === "skills") return resolved
  return path.join(resolved, "skill")
}

function resolveProjectRoot() {
  return Instance.worktree === "/" ? Instance.directory : Instance.worktree
}

function resolveSkillRoot(scope: Scope, cliPath?: string) {
  if (cliPath) return normalizeSkillRoot(cliPath)
  if (scope === "project") return normalizeSkillRoot(path.join(resolveProjectRoot(), ".opencode"))
  return normalizeSkillRoot(Global.Path.config)
}

async function readSkillFromText(sourceLabel: string, text: string) {
  const parsed = matter(text)
  const name = typeof parsed.data?.name === "string" ? parsed.data.name : ""
  const description = typeof parsed.data?.description === "string" ? parsed.data.description : ""
  if (!name || !description) {
    throw new Error(`Skill at ${sourceLabel} is missing required frontmatter fields "name" and/or "description".`)
  }
  validateSkillName(name)
  return { name, description, content: text }
}

async function readSkillFromFile(filePath: string) {
  const md = await ConfigMarkdown.parse(filePath)
  const name = typeof md.data?.name === "string" ? md.data.name : ""
  const description = typeof md.data?.description === "string" ? md.data.description : ""
  if (!name || !description) {
    throw new Error(`Skill at ${filePath} is missing required frontmatter fields "name" and/or "description".`)
  }
  validateSkillName(name)
  const content = await Bun.file(filePath).text()
  return { name, description, content }
}

async function withTempDir<T>(label: string, fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `opencode-skill-${label}-`))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function detectArchiveKind(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".zip") || lower.endsWith(".whl")) return "zip"
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz"
  if (lower.endsWith(".tar")) return "tar"
  return null
}

type RepoProvider = "github" | "gitlab" | "gitee"

type RepoInfo = {
  provider: RepoProvider
  owner: string
  repo: string
  ref?: string
  subpath?: string
}

function parseGitHubUrl(url: URL): RepoInfo | null {
  if (url.hostname !== "github.com") return null
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null
  const owner = segments[0]!
  let repo = segments[1]!
  if (repo.endsWith(".git")) repo = repo.slice(0, -4)
  if (!owner || !repo) return null
  if (segments[2] === "archive" || segments[2] === "releases") return null
  let ref: string | undefined
  let subpath: string | undefined
  if (segments[2] === "tree" || segments[2] === "blob") {
    ref = segments[3]
    if (ref) {
      const rest = segments.slice(4)
      if (rest.length > 0) subpath = rest.join("/")
    }
  }
  return { provider: "github", owner, repo, ref, subpath }
}

function parseGitLabUrl(url: URL): RepoInfo | null {
  if (url.hostname !== "gitlab.com") return null
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null
  const dashIndex = segments.indexOf("-")
  const repoSegments = dashIndex === -1 ? segments : segments.slice(0, dashIndex)
  if (repoSegments.length < 2) return null
  let repo = repoSegments[repoSegments.length - 1]!
  if (repo.endsWith(".git")) repo = repo.slice(0, -4)
  const owner = repoSegments.slice(0, -1).join("/")
  if (!owner || !repo) return null
  let ref: string | undefined
  let subpath: string | undefined
  if (dashIndex !== -1 && (segments[dashIndex + 1] === "tree" || segments[dashIndex + 1] === "blob")) {
    ref = segments[dashIndex + 2]
    if (ref) {
      const rest = segments.slice(dashIndex + 3)
      if (rest.length > 0) subpath = rest.join("/")
    }
  }
  return { provider: "gitlab", owner, repo, ref, subpath }
}

function parseGiteeUrl(url: URL): RepoInfo | null {
  if (url.hostname !== "gitee.com") return null
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null
  const owner = segments[0]!
  let repo = segments[1]!
  if (repo.endsWith(".git")) repo = repo.slice(0, -4)
  if (!owner || !repo) return null
  let ref: string | undefined
  let subpath: string | undefined
  if (segments[2] === "tree" || segments[2] === "blob") {
    ref = segments[3]
    if (ref) {
      const rest = segments.slice(4)
      if (rest.length > 0) subpath = rest.join("/")
    }
  }
  return { provider: "gitee", owner, repo, ref, subpath }
}

function parseRepoUrl(raw: string): RepoInfo | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  return parseGitHubUrl(url) ?? parseGitLabUrl(url) ?? parseGiteeUrl(url)
}

async function resolveDefaultBranch(info: RepoInfo) {
  if (info.provider === "github") {
    const response = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}`)
    if (!response.ok) {
      throw new Error(`Failed to resolve GitHub default branch: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { default_branch?: string }
    if (!data.default_branch) throw new Error("GitHub API missing default_branch")
    return data.default_branch
  }
  if (info.provider === "gitlab") {
    const projectId = encodeURIComponent(`${info.owner}/${info.repo}`)
    const response = await fetch(`https://gitlab.com/api/v4/projects/${projectId}`)
    if (!response.ok) {
      throw new Error(`Failed to resolve GitLab default branch: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { default_branch?: string }
    if (!data.default_branch) throw new Error("GitLab API missing default_branch")
    return data.default_branch
  }
  if (info.provider === "gitee") {
    const response = await fetch(`https://gitee.com/api/v5/repos/${info.owner}/${info.repo}`)
    if (!response.ok) {
      throw new Error(`Failed to resolve Gitee default branch: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { default_branch?: string }
    if (!data.default_branch) throw new Error("Gitee API missing default_branch")
    return data.default_branch
  }
  throw new Error("Unsupported provider")
}

async function resolveRepoArchive(
  url: string,
  subpath?: string,
): Promise<{ archiveUrl: string; subpath?: string } | null> {
  const info = parseRepoUrl(url)
  if (!info) return null
  if (subpath && info.subpath) {
    throw new Error("Subpath specified both in URL and --subpath. Please provide only one.")
  }
  const resolvedRef = info.ref ?? (await resolveDefaultBranch(info))
  const finalSubpath = subpath ?? info.subpath
  if (info.provider === "github") {
    return {
      archiveUrl: `https://codeload.github.com/${info.owner}/${info.repo}/tar.gz/${resolvedRef}`,
      subpath: finalSubpath,
    }
  }
  if (info.provider === "gitlab") {
    return {
      archiveUrl: `https://gitlab.com/${info.owner}/${info.repo}/-/archive/${resolvedRef}/${info.repo}-${resolvedRef}.tar.gz`,
      subpath: finalSubpath,
    }
  }
  if (info.provider === "gitee") {
    return {
      archiveUrl: `https://gitee.com/api/v5/repos/${info.owner}/${info.repo}/tarball/${resolvedRef}`,
      subpath: finalSubpath,
    }
  }
  return null
}

async function extractArchive(archivePath: string, destDir: string) {
  const kind = detectArchiveKind(archivePath)
  if (!kind) throw new Error(`Unsupported archive type: ${archivePath}`)
  if (kind === "zip") {
    await Archive.extractZip(archivePath, destDir)
    return
  }
  if (kind === "tar.gz") {
    await $`tar -xzf ${archivePath} -C ${destDir}`
    return
  }
  if (kind === "tar") {
    await $`tar -xf ${archivePath} -C ${destDir}`
    return
  }
}

async function findSkillFiles(root: string, subpath?: string) {
  const resolvedRoot = path.resolve(root)
  if (subpath) {
    const candidate = path.resolve(resolvedRoot, subpath)
    const stat = await fs.stat(candidate).catch(() => null)
    if (!stat) throw new Error(`Subpath not found: ${candidate}`)
    if (stat.isFile()) {
      if (!candidate.endsWith("SKILL.md")) {
        throw new Error(`Subpath must point to a SKILL.md file or directory: ${candidate}`)
      }
      return [candidate]
    }
    if (!stat.isDirectory()) {
      throw new Error(`Subpath must point to a SKILL.md file or directory: ${candidate}`)
    }
    return findSkillFiles(candidate)
  }

  const matches = await Array.fromAsync(
    new Bun.Glob("**/SKILL.md").scan({
      cwd: resolvedRoot,
      absolute: true,
      onlyFiles: true,
      followSymlinks: false,
      dot: true,
    }),
  )

  const filtered = matches.filter((file) => {
    const normalized = file.replaceAll("\\", "/")
    return !normalized.includes("/node_modules/") && !normalized.includes("/.git/") && !normalized.includes("/dist/")
  })

  if (filtered.length === 0) {
    throw new Error(`No SKILL.md found in ${resolvedRoot}`)
  }
  return filtered
}

async function installSkillFiles(skillFiles: string[], skillRoot: string, force: boolean) {
  const installed: Array<{ name: string; path: string }> = []
  for (const filePath of skillFiles) {
    const skill = await readSkillFromFile(filePath)
    const targetDir = path.join(skillRoot, skill.name)
    const targetPath = path.join(targetDir, "SKILL.md")
    if (!force && (await Bun.file(targetPath).exists())) {
      throw new Error(`Skill already exists: ${targetPath} (use --force to overwrite)`)
    }
    await fs.mkdir(targetDir, { recursive: true })
    await Bun.write(targetPath, skill.content)
    installed.push({ name: skill.name, path: targetPath })
  }
  return installed
}

async function installFromUrlInternal(
  url: string,
  skillRoot: string,
  force: boolean,
  subpath?: string,
  opts?: { skipRepoDetection?: boolean },
) {
  if (!opts?.skipRepoDetection) {
    const repoArchive = await resolveRepoArchive(url, subpath).catch((error) => {
      throw error
    })
    if (repoArchive) {
      return installFromUrlInternal(repoArchive.archiveUrl, skillRoot, force, repoArchive.subpath, {
        skipRepoDetection: true,
      })
    }
  }

  const pathname = new URL(url).pathname
  const fileName = path.basename(pathname)
  const kind = detectArchiveKind(fileName)

  if (!kind) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download skill: ${response.status} ${response.statusText}`)
    const text = await response.text()
    const skill = await readSkillFromText(url, text)
    const targetDir = path.join(skillRoot, skill.name)
    const targetPath = path.join(targetDir, "SKILL.md")
    if (!force && (await Bun.file(targetPath).exists())) {
      throw new Error(`Skill already exists: ${targetPath} (use --force to overwrite)`)
    }
    await fs.mkdir(targetDir, { recursive: true })
    await Bun.write(targetPath, skill.content)
    return [{ name: skill.name, path: targetPath }]
  }

  return withTempDir("url", async (dir) => {
    const archivePath = path.join(dir, fileName)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`)
    await Bun.file(archivePath).write(response)
    const extractDir = path.join(dir, "extract")
    await fs.mkdir(extractDir, { recursive: true })
    await extractArchive(archivePath, extractDir)
    const skillFiles = await findSkillFiles(extractDir, subpath)
    return installSkillFiles(skillFiles, skillRoot, force)
  })
}

async function installFromUrl(url: string, skillRoot: string, force: boolean, subpath?: string) {
  return installFromUrlInternal(url, skillRoot, force, subpath)
}

function parseNpmSpec(spec: string) {
  if (spec.startsWith("@")) {
    const at = spec.lastIndexOf("@")
    if (at > 0) {
      const name = spec.slice(0, at)
      const version = spec.slice(at + 1) || undefined
      return { name, version }
    }
    return { name: spec, version: undefined }
  }
  const [name, version] = spec.split("@")
  return { name, version: version || undefined }
}

async function installFromNpm(spec: string, skillRoot: string, force: boolean, subpath?: string) {
  const { name, version } = parseNpmSpec(spec)
  const registry = (process.env["NPM_CONFIG_REGISTRY"] || "https://registry.npmjs.org").replace(/\/$/, "")
  const encoded = encodeURIComponent(name)
  const response = await fetch(`${registry}/${encoded}`)
  if (!response.ok) throw new Error(`Failed to fetch npm metadata: ${response.status} ${response.statusText}`)
  const metadata = (await response.json()) as any
  const resolvedVersion = version || metadata["dist-tags"]?.latest
  const versionInfo = metadata.versions?.[resolvedVersion]
  if (!versionInfo?.dist?.tarball) throw new Error(`Could not resolve npm tarball for ${name}@${resolvedVersion}`)
  const tarballUrl = versionInfo.dist.tarball

  return withTempDir("npm", async (dir) => {
    const archivePath = path.join(dir, path.basename(new URL(tarballUrl).pathname) || "package.tgz")
    const tarballResponse = await fetch(tarballUrl)
    if (!tarballResponse.ok) throw new Error(`Failed to download npm tarball: ${tarballResponse.status}`)
    await Bun.file(archivePath).write(tarballResponse)
    const extractDir = path.join(dir, "extract")
    await fs.mkdir(extractDir, { recursive: true })
    await extractArchive(archivePath, extractDir)
    const packageRoot = (await fs.stat(path.join(extractDir, "package")).catch(() => null))?.isDirectory()
      ? path.join(extractDir, "package")
      : extractDir
    const skillFiles = await findSkillFiles(packageRoot, subpath)
    return installSkillFiles(skillFiles, skillRoot, force)
  })
}

function parsePypiSpec(spec: string) {
  if (spec.includes("==")) {
    const [name, version] = spec.split("==")
    return { name, version: version || undefined }
  }
  if (spec.includes("@")) {
    const [name, version] = spec.split("@")
    return { name, version: version || undefined }
  }
  return { name: spec, version: undefined }
}

async function installFromPypi(spec: string, skillRoot: string, force: boolean, subpath?: string) {
  const { name, version } = parsePypiSpec(spec)
  const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`)
  if (!response.ok) throw new Error(`Failed to fetch PyPI metadata: ${response.status} ${response.statusText}`)
  const metadata = (await response.json()) as any
  const resolvedVersion = version || metadata.info?.version
  const releaseFiles = metadata.releases?.[resolvedVersion] || []
  const sdist = releaseFiles.find((item: any) => item.packagetype === "sdist") || releaseFiles[0]
  if (!sdist?.url) throw new Error(`Could not resolve PyPI package for ${name}@${resolvedVersion}`)
  const archiveUrl = sdist.url as string

  return withTempDir("pypi", async (dir) => {
    const archivePath = path.join(dir, path.basename(new URL(archiveUrl).pathname) || "package.tar.gz")
    const pkgResponse = await fetch(archiveUrl)
    if (!pkgResponse.ok) throw new Error(`Failed to download PyPI package: ${pkgResponse.status}`)
    await Bun.file(archivePath).write(pkgResponse)
    const extractDir = path.join(dir, "extract")
    await fs.mkdir(extractDir, { recursive: true })
    await extractArchive(archivePath, extractDir)
    const entries = await fs.readdir(extractDir).catch(() => [])
    const firstDir = entries.length === 1 ? path.join(extractDir, entries[0]!) : extractDir
    const skillFiles = await findSkillFiles(firstDir, subpath)
    return installSkillFiles(skillFiles, skillRoot, force)
  })
}

async function installFromFile(filePath: string, skillRoot: string, force: boolean, subpath?: string) {
  const resolved = path.resolve(filePath)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat) throw new Error(`File not found: ${resolved}`)
  if (stat.isFile()) {
    const kind = detectArchiveKind(resolved)
    if (kind) {
      return withTempDir("file", async (dir) => {
        const extractDir = path.join(dir, "extract")
        await fs.mkdir(extractDir, { recursive: true })
        await extractArchive(resolved, extractDir)
        const skillFiles = await findSkillFiles(extractDir, subpath)
        return installSkillFiles(skillFiles, skillRoot, force)
      })
    }
    if (!resolved.endsWith("SKILL.md")) {
      throw new Error(`File must be a SKILL.md or archive: ${resolved}`)
    }
    return installSkillFiles([resolved], skillRoot, force)
  }
  if (!stat.isDirectory()) throw new Error(`Invalid path: ${resolved}`)
  const skillFiles = await findSkillFiles(resolved, subpath)
  return installSkillFiles(skillFiles, skillRoot, force)
}

function collectSources(args: {
  source?: string[]
  npm?: string[]
  python?: string[]
  url?: string[]
}) {
  const sources: InstallSource[] = []
  const add = (type: SourceType, spec?: string) => {
    if (!spec) return
    sources.push({ type, spec })
  }

  for (const item of args.source ?? []) {
    if (item.startsWith("npm:")) add("npm", item.slice("npm:".length))
    else if (item.startsWith("pypi:")) add("pypi", item.slice("pypi:".length))
    else if (item.startsWith("python:")) add("pypi", item.slice("python:".length))
    else if (item.startsWith("git+http://") || item.startsWith("git+https://")) add("url", item.slice(4))
    else if (item.startsWith("http://") || item.startsWith("https://")) add("url", item)
    else add("file", item)
  }

  for (const item of args.npm ?? []) add("npm", item)
  for (const item of args.python ?? []) add("pypi", item)
  for (const item of args.url ?? []) add("url", item)

  return sources
}

async function runInstall(
  sources: InstallSource[],
  {
    scope,
    path: cliPath,
    force,
    subpath,
  }: { scope: Scope; path?: string; force: boolean; subpath?: string },
) {
  if (sources.length === 0) throw new Error("No skill sources provided.")
  const skillRoot = resolveSkillRoot(scope, cliPath)
  await fs.mkdir(skillRoot, { recursive: true })

  for (const source of sources) {
    const label = `${source.type}:${source.spec}`
    const installed = await (async () => {
      switch (source.type) {
        case "npm":
          return installFromNpm(source.spec, skillRoot, force, subpath)
        case "pypi":
          return installFromPypi(source.spec, skillRoot, force, subpath)
        case "url":
          return installFromUrl(source.spec, skillRoot, force, subpath)
        case "file":
          return installFromFile(source.spec, skillRoot, force, subpath)
      }
    })()
    for (const entry of installed) {
      process.stdout.write(`Installed ${entry.name} from ${label} -> ${entry.path}` + os.EOL)
    }
  }
}

const SkillCreateCommand = cmd({
  command: "create <name>",
  describe: "create a new skill",
  builder: (yargs: Argv) =>
    yargs
      .positional("name", { type: "string", demandOption: true })
      .option("description", { type: "string", describe: "skill description" })
      .option("scope", {
        type: "string",
        choices: ["global", "project"] as const,
        default: "global",
        describe: "install scope (default: global)",
      })
      .option("path", { type: "string", describe: "config root (defaults to global or project)" })
      .option("force", { type: "boolean", default: false, describe: "overwrite existing skill file" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const name = args.name as string
        validateSkillName(name)
        const scope = args.scope as Scope
        const skillRoot = resolveSkillRoot(scope, args.path as string | undefined)

        let description = args.description as string | undefined
        if (!description) {
          if (!process.stdout.isTTY) {
            throw new Error("Description is required when not running interactively.")
          }
          UI.empty()
          prompts.intro("Create skill")
          const result = await prompts.text({
            message: "Description",
            placeholder: "What does this skill do?",
            validate: (x) => (x && x.length > 0 ? undefined : "Required"),
          })
          if (prompts.isCancel(result)) throw new UI.CancelledError()
          description = result
        }

        const content = matter.stringify(
          [
            "## What I do",
            "",
            "-",
            "",
            "## When to use me",
            "",
            "-",
            "",
          ].join("\n"),
          { name, description },
        )

        const targetDir = path.join(skillRoot, name)
        const targetPath = path.join(targetDir, "SKILL.md")
        if (!args.force && (await Bun.file(targetPath).exists())) {
          throw new Error(`Skill already exists: ${targetPath} (use --force to overwrite)`)
        }
        await fs.mkdir(targetDir, { recursive: true })
        await Bun.write(targetPath, content)
        process.stdout.write(targetPath + os.EOL)
      },
    })
  },
})

const SkillListCommand = cmd({
  command: "list",
  describe: "list all available skills",
  builder: (yargs: Argv) =>
    yargs.option("json", { type: "boolean", default: false, describe: "output as JSON" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const skills = await Skill.all()
        const sorted = skills.sort((a, b) => a.name.localeCompare(b.name))
        if (args.json) {
          process.stdout.write(JSON.stringify(sorted, null, 2) + os.EOL)
          return
        }
        for (const skill of sorted) {
          process.stdout.write(`${skill.name} - ${skill.description} (${skill.location})` + os.EOL)
        }
      },
    })
  },
})

const SkillShowCommand = cmd({
  command: "show <name>",
  describe: "print a skill's content",
  builder: (yargs: Argv) =>
    yargs
      .positional("name", { type: "string", demandOption: true })
      .option("scope", {
        type: "string",
        choices: ["global", "project"] as const,
        describe: "restrict lookup to a scope",
      })
      .option("path", { type: "string", describe: "config root (defaults to global or project)" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const name = args.name as string
        if (args.scope || args.path) {
          const scope = (args.scope as Scope | undefined) ?? "global"
          const skillRoot = resolveSkillRoot(scope, args.path as string | undefined)
          const skillPath = path.join(skillRoot, name, "SKILL.md")
          if (!(await Bun.file(skillPath).exists())) {
            throw new Error(`Skill not found at ${skillPath}`)
          }
          process.stdout.write((await Bun.file(skillPath).text()) + os.EOL)
          return
        }

        const info = await Skill.get(name)
        if (!info) throw new Error(`Skill "${name}" not found`)
        const content = info.location.startsWith("builtin:")
          ? Skill.getBuiltinContent(info.name) ?? ""
          : await Bun.file(info.location).text()
        process.stdout.write(content + os.EOL)
      },
    })
  },
})

const SkillDeleteCommand = cmd({
  command: "delete <name>",
  describe: "delete a skill from disk",
  builder: (yargs: Argv) =>
    yargs
      .positional("name", { type: "string", demandOption: true })
      .option("scope", {
        type: "string",
        choices: ["global", "project"] as const,
        default: "global",
        describe: "delete from scope (default: global)",
      })
      .option("path", { type: "string", describe: "config root (defaults to global or project)" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const scope = args.scope as Scope
        const skillRoot = resolveSkillRoot(scope, args.path as string | undefined)
        const skillDir = path.join(skillRoot, args.name as string)
        const skillPath = path.join(skillDir, "SKILL.md")
        if (!(await Bun.file(skillPath).exists())) {
          throw new Error(`Skill not found at ${skillPath}`)
        }
        await fs.rm(skillDir, { recursive: true, force: true })
        process.stdout.write(`Deleted ${skillDir}` + os.EOL)
      },
    })
  },
})

const SkillInstallCommand = cmd({
  command: "install [source..]",
  describe: "install skills from npm, pypi, url, or local file",
  builder: (yargs: Argv) =>
    yargs
      .positional("source", { type: "string", array: true })
      .option("npm", { type: "string", array: true, describe: "npm package (repeatable)" })
      .option("python", { type: "string", array: true, describe: "PyPI package (repeatable)" })
      .option("url", { type: "string", array: true, describe: "URL to SKILL.md or archive (repeatable)" })
      .option("subpath", { type: "string", describe: "subpath to SKILL.md inside an archive" })
      .option("scope", {
        type: "string",
        choices: ["global", "project"] as const,
        default: "global",
        describe: "install scope (default: global)",
      })
      .option("path", { type: "string", describe: "config root (defaults to global or project)" })
      .option("force", { type: "boolean", default: false, describe: "overwrite existing skills" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const sources = collectSources({
          source: args.source as string[] | undefined,
          npm: args.npm as string[] | undefined,
          python: args.python as string[] | undefined,
          url: args.url as string[] | undefined,
        })
        await runInstall(sources, {
          scope: args.scope as Scope,
          path: args.path as string | undefined,
          force: args.force as boolean,
          subpath: args.subpath as string | undefined,
        })
      },
    })
  },
})

const SkillUpdateCommand = cmd({
  command: "update [source..]",
  describe: "update skills from npm, pypi, url, or local file",
  builder: (yargs: Argv) =>
    yargs
      .positional("source", { type: "string", array: true })
      .option("npm", { type: "string", array: true, describe: "npm package (repeatable)" })
      .option("python", { type: "string", array: true, describe: "PyPI package (repeatable)" })
      .option("url", { type: "string", array: true, describe: "URL to SKILL.md or archive (repeatable)" })
      .option("subpath", { type: "string", describe: "subpath to SKILL.md inside an archive" })
      .option("scope", {
        type: "string",
        choices: ["global", "project"] as const,
        default: "global",
        describe: "update scope (default: global)",
      })
      .option("path", { type: "string", describe: "config root (defaults to global or project)" })
      .option("force", { type: "boolean", default: true, describe: "overwrite existing skills" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const sources = collectSources({
          source: args.source as string[] | undefined,
          npm: args.npm as string[] | undefined,
          python: args.python as string[] | undefined,
          url: args.url as string[] | undefined,
        })
        await runInstall(sources, {
          scope: args.scope as Scope,
          path: args.path as string | undefined,
          force: args.force as boolean,
          subpath: args.subpath as string | undefined,
        })
      },
    })
  },
})

export const SkillCommand = cmd({
  command: "skill",
  describe: "manage skills",
  builder: (yargs) =>
    yargs
      .command(SkillCreateCommand)
      .command(SkillListCommand)
      .command(SkillShowCommand)
      .command(SkillInstallCommand)
      .command(SkillUpdateCommand)
      .command(SkillDeleteCommand)
      .demandCommand(),
  async handler() {},
})
