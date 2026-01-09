/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.export.txt"
import fs from "fs/promises"
import path from "path"
import { novelRoot, resolveNovelPath } from "../novel/paths"

function isChapterFile(name: string) {
  return /^CH_\d+_\d+\.md$/i.test(name)
}

export default tool({
  description: DESCRIPTION,
  args: {
    output: tool.schema.string().default("export/book.md").describe("Output path relative to novel/"),
  },
  async execute(args) {
    const chaptersDir = path.join(novelRoot, "chapters")
    const entries = await fs.readdir(chaptersDir, { withFileTypes: true }).catch(() => [])
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter(isChapterFile)
      .sort((a, b) => a.localeCompare(b))

    const parts: string[] = []
    for (const file of files) {
      const content = await fs.readFile(path.join(chaptersDir, file), "utf8")
      parts.push(`\n\n---\n\n# ${file.replace(/\\.md$/i, "")}\n\n`)
      parts.push(content.trimEnd())
    }

    const out = resolveNovelPath(args.output)
    await fs.mkdir(path.dirname(out.abs), { recursive: true })
    await fs.writeFile(out.abs, parts.join(""), "utf8")

    return `exported ${files.length} chapter(s) -> ${out.relToProjectPosix}`
  },
})
