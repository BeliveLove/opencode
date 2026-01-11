import fs from "fs/promises"
import path from "path"
import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./canon-validate.txt"
import { CANON_KINDS, CanonKind, canonIdPrefix, readAllCanon } from "../../novel/canon"
import { extractRefIds, parseChapterMarkdown } from "../../novel/chapter"
import { resolveNovelDir, resolveNovelPath } from "../../novel/paths"
import { askReadPattern } from "./util"

type Issue = {
  level: "error" | "warning"
  code: string
  message: string
  kind?: string
  id?: string
  chapterId?: string
}

const FORESHADOW_STATUS = new Set(["planted", "escalated", "paid_off", "dropped"])

function isStringArray(v: any): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
}

export const NovelCanonValidateTool = Tool.define("novel_canon_validate", {
  description: DESCRIPTION,
  parameters: z.object({
    chapterId: z.string().optional().describe("Optional chapter id to validate refs (e.g. CH_01_003)"),
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    const issues: Issue[] = []

    const dir = await (async () => {
      try {
        return await resolveNovelDir({ novelId: params.novelId })
      } catch (err) {
        const msg = (err as any)?.message?.toString?.() || "unknown error"
        const code = msg.includes("未选择当前小说") ? "NO_ACTIVE_NOVEL" : "NOVEL_NOT_INITIALIZED"
        issues.push({ level: "error", code, message: msg })
        return null
      }
    })()

    if (!dir) {
      return {
        title: "novel_canon_validate",
        output: YAML.stringify({ ok: false, issues }).trimEnd(),
        metadata: { ok: false, issueCount: issues.length },
      }
    }

    await askReadPattern(ctx, path.posix.join(dir.relToProjectPosix, "canon/*"), { scope: path.posix.join(dir.relToProjectPosix, "canon") })
    if (params.chapterId) {
      await askReadPattern(ctx, path.posix.join(dir.relToProjectPosix, `chapters/${params.chapterId}.md`), {
        scope: path.posix.join(dir.relToProjectPosix, "chapters"),
      })
    }

    const all = await readAllCanon({ novelId: params.novelId })

    for (const kind of CANON_KINDS) {
      const prefix = canonIdPrefix(kind)
      const seen = new Set<string>()

      for (const item of all[kind]) {
        if (seen.has(item.id)) {
          issues.push({ level: "error", code: "DUPLICATE_ID", kind, id: item.id, message: `重复 id：${item.id}` })
        }
        seen.add(item.id)

        if (prefix && !item.id.startsWith(prefix)) {
          issues.push({
            level: "error",
            code: "BAD_ID_PREFIX",
            kind,
            id: item.id,
            message: `id 前缀不合法：期望 ${prefix}*，实际 ${item.id}`,
          })
        }

        if (kind === CanonKind.characters && !item.name) {
          issues.push({ level: "warning", code: "MISSING_NAME", kind, id: item.id, message: "人物缺少 name" })
        }
        if (kind === CanonKind.factions && !item.name) {
          issues.push({ level: "warning", code: "MISSING_NAME", kind, id: item.id, message: "势力缺少 name" })
        }
        if (kind === CanonKind.rules && (!item.name || !item.rule)) {
          issues.push({
            level: "warning",
            code: "MISSING_RULE_FIELDS",
            kind,
            id: item.id,
            message: "设定建议至少包含 name 与 rule",
          })
        }
        if (kind === CanonKind.timeline && !item.title) {
          issues.push({ level: "warning", code: "MISSING_TITLE", kind, id: item.id, message: "时间线事件缺少 title" })
        }
        if (kind === CanonKind.foreshadow) {
          const status = (item.status ?? "").toString()
          if (!FORESHADOW_STATUS.has(status)) {
            issues.push({
              level: "error",
              code: "BAD_FORESHADOW_STATUS",
              kind,
              id: item.id,
              message: `伏笔 status 非法：${status}（允许：planted|escalated|paid_off|dropped）`,
            })
          }
          if (!item.promise) {
            issues.push({ level: "warning", code: "MISSING_PROMISE", kind, id: item.id, message: "伏笔缺少 promise" })
          }

          const payoffChapter = item.payoff?.chapter
          if (status === "paid_off" && !payoffChapter) {
            issues.push({
              level: "error",
              code: "PAIDOFF_MISSING_PAYOFF",
              kind,
              id: item.id,
              message: "paid_off 必须填写 payoff.chapter",
            })
          }
          if (status !== "paid_off" && payoffChapter) {
            issues.push({
              level: "warning",
              code: "PAYOFF_SET_BUT_NOT_PAID",
              kind,
              id: item.id,
              message: "payoff.chapter 已填写但 status 不是 paid_off",
            })
          }
        }
      }
    }

    if (params.chapterId) {
      const chapterPath = await resolveNovelPath(path.join("chapters", `${params.chapterId}.md`), { novelId: params.novelId })
      const chapterContent = await fs.readFile(chapterPath.abs, "utf8").catch(() => "")
      if (!chapterContent.trim()) {
        issues.push({
          level: "error",
          code: "CHAPTER_NOT_FOUND",
          chapterId: params.chapterId,
          message: `未找到章节文件：${path.posix.join(dir.relToProjectPosix, `chapters/${params.chapterId}.md`)}`,
        })
      } else {
        const parsed = parseChapterMarkdown(chapterContent)
        const refs = extractRefIds(parsed)

        const allIds = new Set<string>()
        for (const kind of CANON_KINDS) for (const item of all[kind]) allIds.add(item.id)

        for (const id of refs) {
          if (!allIds.has(id)) {
            issues.push({
              level: "error",
              code: "MISSING_REF",
              id,
              chapterId: params.chapterId,
              message: `引用不存在（请写回 canon/）：${id}`,
            })
          }
        }

        const fm = parsed.frontmatter
        if (fm.id && fm.id !== params.chapterId) {
          issues.push({
            level: "warning",
            code: "CHAPTER_ID_MISMATCH",
            chapterId: params.chapterId,
            message: `frontmatter.id 与文件名不一致：${fm.id} vs ${params.chapterId}`,
          })
        }
        if (fm.participants && !isStringArray(fm.participants)) {
          issues.push({
            level: "warning",
            code: "BAD_PARTICIPANTS",
            chapterId: params.chapterId,
            message: "frontmatter.participants 应为 string[]",
          })
        }
      }
    }

    const ok = issues.every((x) => x.level !== "error")
    return {
      title: "novel_canon_validate",
      output: YAML.stringify({ ok, issues }).trimEnd(),
      metadata: { ok, issueCount: issues.length },
    }
  },
})

