/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.report.chapter.txt"
import fs from "fs/promises"
import path from "path"
import YAML from "yaml"
import { CANON_KINDS, readAllCanon } from "../novel/canon"
import { extractIdCandidates, extractRefIds, parseChapterMarkdown } from "../novel/chapter"
import { resolveNovelPath } from "../novel/paths"

function groupByPrefix(ids: string[]) {
  const groups: Record<string, string[]> = {}
  for (const id of ids) {
    const prefix = id.split("_")[0] ?? "UNKNOWN"
    groups[prefix] ??= []
    groups[prefix].push(id)
  }
  for (const k of Object.keys(groups)) groups[k].sort()
  return groups
}

export default tool({
  description: DESCRIPTION,
  args: {
    chapterId: tool.schema.string().describe("Chapter id (e.g. CH_01_003)"),
  },
  async execute(args) {
    const all = await readAllCanon()
    const allIds = new Set<string>()
    for (const kind of CANON_KINDS) for (const item of all[kind]) allIds.add(item.id)

    const chapterPath = resolveNovelPath(path.join("chapters", `${args.chapterId}.md`))
    const chapterContent = await fs.readFile(chapterPath.abs, "utf8")
    const parsed = parseChapterMarkdown(chapterContent)

    const refs = extractRefIds(parsed)
    const missingRefs = refs.filter((id) => !allIds.has(id)).sort()

    const candidates = extractIdCandidates(chapterContent)
    const missingCandidates = candidates.filter((id) => !allIds.has(id)).sort()

    const summary = {
      chapterId: args.chapterId,
      refCount: refs.length,
      missingRefCount: missingRefs.length,
      missingCandidateCount: missingCandidates.length,
      missingRefs: groupByPrefix(missingRefs),
      missingCandidates: groupByPrefix(missingCandidates),
    }

    return [
      `# 章节对账报告：${args.chapterId}`,
      "",
      "## 结构化摘要",
      "```yml",
      YAML.stringify(summary).trimEnd(),
      "```",
      "",
      "## 缺失引用（需要写回 canon/）",
      missingRefs.length ? missingRefs.map((x) => `- ${x}`).join("\n") : "- 无",
      "",
      "## 文本中出现但未入库的 ID 候选（建议检查是否新增设定/人物/地点/物品）",
      missingCandidates.length ? missingCandidates.map((x) => `- ${x}`).join("\n") : "- 无",
    ].join("\n")
  },
})
