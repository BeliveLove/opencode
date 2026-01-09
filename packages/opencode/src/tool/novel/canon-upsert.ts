import fs from "fs/promises"
import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./canon-upsert.txt"
import { CANON_KINDS, type CanonKind, canonFile, canonIdPrefix, readCanon, writeCanon } from "../../novel/canon"
import { unifiedDiff } from "../../novel/diff"
import { askEdit } from "./util"

type Source = { chapter: string; quote?: string }

function assertObject(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("item 必须是对象")
}

function assertSource(source: Source) {
  if (!source?.chapter || typeof source.chapter !== "string" || !source.chapter.trim()) {
    throw new Error("source.chapter 为必填字段")
  }
}

export const NovelCanonUpsertTool = Tool.define("novel.canon.upsert", {
  description: DESCRIPTION,
  parameters: z.object({
    kind: z.enum(CANON_KINDS as [CanonKind, ...CanonKind[]]).describe("Canon kind"),
    item: z.unknown().describe("Canon item object (must include id)"),
    source: z
      .object({
        chapter: z.string().describe("Source chapter id (e.g. CH_01_003)"),
        quote: z.string().optional().describe("Optional quote / summary"),
      })
      .describe("Provenance info"),
    apply: z.boolean().default(false).describe("Apply changes to canon files"),
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    assertObject(params.item)
    assertSource(params.source as any)

    const id = ((params.item as any).id ?? "").toString().trim()
    if (!id) throw new Error("item.id 为必填字段")

    const expectedPrefix = canonIdPrefix(params.kind)
    if (expectedPrefix && !id.startsWith(expectedPrefix)) {
      throw new Error(`id 前缀不合法：kind=${params.kind} 期望 ${expectedPrefix}*，实际 ${id}`)
    }

    const options = { novelId: params.novelId }
    const items = await readCanon(params.kind, options)
    const idx = items.findIndex((x) => x.id === id)

    const merged = (() => {
      const next = idx >= 0 ? { ...items[idx], ...(params.item as any) } : { ...(params.item as any) }
      next.source = {
        ...(next.source ?? {}),
        chapter: params.source.chapter,
        ...(params.source.quote ? { quote: params.source.quote } : {}),
      }
      next.id = id
      return next
    })()

    const nextItems = [...items]
    if (idx >= 0) nextItems[idx] = merged
    else nextItems.push(merged)
    nextItems.sort((a, b) => a.id.localeCompare(b.id))

    const canonPath = await canonFile(params.kind, options)
    const before = await fs.readFile(canonPath.abs, "utf8").catch(() => "")
    const after = YAML.stringify(nextItems).trimEnd() + "\n"

    const patch = unifiedDiff({
      filePath: canonPath.relToProjectPosix,
      before,
      after,
      fromLabel: "before",
      toLabel: "after",
    }).trimEnd()

    if (params.apply) {
      await askEdit(ctx, canonPath.abs, { filepath: canonPath.abs, diff: patch || "(no changes)" })
      await writeCanon(params.kind, nextItems as any, options)
    }

    return {
      title: canonPath.relToProjectPosix,
      output: patch || "(no changes)",
      metadata: { kind: params.kind, id, applied: params.apply },
    }
  },
})
