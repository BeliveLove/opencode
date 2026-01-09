import fs from "fs/promises"
import path from "path"
import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./export.txt"
import { novelRoot, resolveNovelPath } from "../../novel/paths"
import { askEdit } from "./util"

function isChapterFile(name: string) {
  return /^CH_\d+_\d+\.md$/i.test(name)
}

export const NovelExportTool = Tool.define("novel.export", {
  description: DESCRIPTION,
  parameters: z.object({
    output: z.string().default("export/book.md").describe("Output path relative to novel/"),
  }),
  async execute(params, ctx) {
    const chaptersDir = path.join(novelRoot(), "chapters")
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

    const out = resolveNovelPath(params.output)
    await fs.mkdir(path.dirname(out.abs), { recursive: true })
    await askEdit(ctx, out.abs, { filepath: out.abs, chapters: files.length })
    await fs.writeFile(out.abs, parts.join(""), "utf8")

    return {
      title: out.relToProjectPosix,
      output: `exported ${files.length} chapter(s) -> ${out.relToProjectPosix}`,
      metadata: { output: out.relToProjectPosix, chapterCount: files.length },
    }
  },
})

