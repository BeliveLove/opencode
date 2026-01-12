import z from "zod"
import path from "path"
import YAML from "yaml"
import { diffLines } from "diff"
import { Tool } from "../tool"
import DESCRIPTION from "./version-diff.txt"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"

type SectionDiff = {
  section: string
  change: "added" | "removed" | "modified"
  addedLines?: number
  removedLines?: number
}

function normalizeContent(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function parseSections(markdown: string, maxDepth: number) {
  const lines = markdown.split(/\r?\n/)
  const sections = new Map<string, string[]>()
  const stack: Array<{ level: number; title: string }> = []
  let currentKey = "Document"
  sections.set(currentKey, [])

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (match) {
      const level = match[1].length
      const title = match[2].trim().replace(/\s+#\s*$/, "")
      if (level <= maxDepth) {
        while (stack.length && stack[stack.length - 1]!.level >= level) {
          stack.pop()
        }
        stack.push({ level, title })
        currentKey = stack.map((s) => s.title).join(" > ")
        if (!sections.has(currentKey)) sections.set(currentKey, [])
        continue
      }
    }
    if (!sections.has(currentKey)) sections.set(currentKey, [])
    sections.get(currentKey)!.push(line)
  }

  return sections
}

async function ensureReadableFile(ctx: Tool.Context, filePath: string) {
  if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filePath)) {
    const parentDir = path.dirname(filePath)
    await ctx.ask({
      permission: "external_directory",
      patterns: [parentDir],
      always: [parentDir + "/*"],
      metadata: { filePath, parentDir },
    })
  }

  await ctx.ask({
    permission: "read",
    patterns: [filePath],
    always: ["*"],
    metadata: {},
  })
}

async function readMarkdownLike(ctx: Tool.Context, filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (![".md", ".markdown", ".txt"].includes(ext)) {
    throw new Error(
      `Unsupported file type for diff (${ext || "(no ext)"}). Convert to .md first (use doc_convert) or provide text.`,
    )
  }
  await ensureReadableFile(ctx, filePath)
  const file = Bun.file(filePath)
  if (!(await file.exists())) throw new Error(`File not found: ${filePath}`)
  return await file.text()
}

export const DocVersionDiffTool = Tool.define("doc_version_diff", {
  description: DESCRIPTION,
  parameters: z.object({
    oldPath: z.string().optional().describe("Path to the older document (markdown/text)"),
    newPath: z.string().optional().describe("Path to the newer document (markdown/text)"),
    oldText: z.string().optional().describe("Inline older document text (overrides oldPath)"),
    newText: z.string().optional().describe("Inline newer document text (overrides newPath)"),
    sectionDepth: z.number().int().min(1).max(6).optional().describe("Heading depth to diff (default 3)"),
  }),
  async execute(params, ctx) {
    const depth = params.sectionDepth ?? 3

    let oldText = params.oldText
    let newText = params.newText

    if (!oldText) {
      if (!params.oldPath) {
        throw new Error("oldText or oldPath is required")
      }
      const resolved = path.isAbsolute(params.oldPath)
        ? params.oldPath
        : path.resolve(process.cwd(), params.oldPath)
      oldText = await readMarkdownLike(ctx, resolved)
    }

    if (!newText) {
      if (!params.newPath) {
        throw new Error("newText or newPath is required")
      }
      const resolved = path.isAbsolute(params.newPath)
        ? params.newPath
        : path.resolve(process.cwd(), params.newPath)
      newText = await readMarkdownLike(ctx, resolved)
    }

    const oldSections = parseSections(oldText ?? "", depth)
    const newSections = parseSections(newText ?? "", depth)
    const allKeys = new Set<string>([...oldSections.keys(), ...newSections.keys()])

    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []
    const details: SectionDiff[] = []

    for (const key of allKeys) {
      const oldContent = (oldSections.get(key) ?? []).join("\n").trim()
      const newContent = (newSections.get(key) ?? []).join("\n").trim()

      if (!oldContent && newContent) {
        added.push(key)
        details.push({ section: key, change: "added" })
        continue
      }
      if (oldContent && !newContent) {
        removed.push(key)
        details.push({ section: key, change: "removed" })
        continue
      }

      if (normalizeContent(oldContent) !== normalizeContent(newContent)) {
        const diffs = diffLines(oldContent, newContent)
        let addedLines = 0
        let removedLines = 0
        for (const part of diffs) {
          if (part.added) addedLines += part.count ?? part.value.split(/\r?\n/).length
          if (part.removed) removedLines += part.count ?? part.value.split(/\r?\n/).length
        }
        modified.push(key)
        details.push({ section: key, change: "modified", addedLines, removedLines })
      }
    }

    const report = {
      schema: "doc.version.diff.v1",
      summary: {
        added_sections: added,
        removed_sections: removed,
        modified_sections: modified,
      },
      details,
    }

    return {
      title: "doc_version_diff",
      output: ["```yml", YAML.stringify(report).trimEnd(), "```"].join("\n"),
      metadata: {
        added: added.length,
        removed: removed.length,
        modified: modified.length,
        sectionDepth: depth,
      },
    }
  },
})
