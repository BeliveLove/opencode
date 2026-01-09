import fs from "fs/promises"
import path from "path"
import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./report-chapter.txt"
import { CANON_KINDS, readAllCanon } from "../../novel/canon"
import { extractIdCandidates, extractRefIds, parseChapterMarkdown } from "../../novel/chapter"
import { resolveNovelDir, resolveNovelPath } from "../../novel/paths"
import { askReadPattern } from "./util"

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

export const NovelReportChapterTool = Tool.define("novel.report.chapter", {
  description: DESCRIPTION,
  parameters: z.object({
    chapterId: z.string().describe("Chapter id (e.g. CH_01_003)"),
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    const dir = await resolveNovelDir({ novelId: params.novelId })
    await askReadPattern(ctx, path.posix.join(dir.relToProjectPosix, "canon/*"), { scope: path.posix.join(dir.relToProjectPosix, "canon") })
    await askReadPattern(ctx, path.posix.join(dir.relToProjectPosix, `chapters/${params.chapterId}.md`), {
      scope: path.posix.join(dir.relToProjectPosix, "chapters"),
    })

    const all = await readAllCanon({ novelId: params.novelId })
    const allIds = new Set<string>()
    for (const kind of CANON_KINDS) for (const item of all[kind]) allIds.add(item.id)

    const chapterPath = await resolveNovelPath(path.join("chapters", `${params.chapterId}.md`), { novelId: params.novelId })
    const chapterContent = await fs.readFile(chapterPath.abs, "utf8")
    const parsed = parseChapterMarkdown(chapterContent)

    const refs = extractRefIds(parsed)
    const missingRefs = refs.filter((id) => !allIds.has(id)).sort()

    const candidates = extractIdCandidates(chapterContent)
    const missingCandidates = candidates.filter((id) => !allIds.has(id)).sort()

    const summary = {
      chapterId: params.chapterId,
      refCount: refs.length,
      missingRefCount: missingRefs.length,
      missingCandidateCount: missingCandidates.length,
      missingRefs: groupByPrefix(missingRefs),
      missingCandidates: groupByPrefix(missingCandidates),
    }

    const output = [
      `# 章节对账报告：${params.chapterId}`,
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

    return {
      title: params.chapterId,
      output,
      metadata: { chapterId: params.chapterId, missingRefCount: missingRefs.length, missingCandidateCount: missingCandidates.length },
    }
  },
})
