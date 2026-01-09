/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.canon.upsert.txt"
import fs from "fs/promises"
import YAML from "yaml"
import { CANON_KINDS, type CanonKind, canonFile, canonIdPrefix, readCanon, writeCanon } from "../novel/canon"
import { unifiedDiff } from "../novel/diff"

type Source = { chapter: string; quote?: string }

function assertObject(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("item 必须是对象")
}

function assertSource(source: Source) {
  if (!source?.chapter || typeof source.chapter !== "string" || !source.chapter.trim()) {
    throw new Error("source.chapter 为必填字段")
  }
}

export default tool({
  description: DESCRIPTION,
  args: {
    kind: tool.schema.enum(CANON_KINDS as [CanonKind, ...CanonKind[]]).describe("Canon kind"),
    item: tool.schema.any().describe("Canon item object (must include id)"),
    source: tool.schema
      .object({
        chapter: tool.schema.string().describe("Source chapter id (e.g. CH_01_003)"),
        quote: tool.schema.string().optional().describe("Optional quote / summary"),
      })
      .describe("Provenance info"),
    apply: tool.schema.boolean().default(false).describe("Apply changes to canon files"),
  },
  async execute(args) {
    assertObject(args.item)
    assertSource(args.source as any)

    const id = (args.item.id ?? "").toString().trim()
    if (!id) throw new Error("item.id 为必填字段")

    const expectedPrefix = canonIdPrefix(args.kind)
    if (expectedPrefix && !id.startsWith(expectedPrefix)) {
      throw new Error(`id 前缀不合法：kind=${args.kind} 期望 ${expectedPrefix}*，实际 ${id}`)
    }

    const items = await readCanon(args.kind)
    const idx = items.findIndex((x) => x.id === id)

    const merged = (() => {
      const next = idx >= 0 ? { ...items[idx], ...args.item } : { ...args.item }
      next.source = {
        ...(next.source ?? {}),
        chapter: args.source.chapter,
        ...(args.source.quote ? { quote: args.source.quote } : {}),
      }
      next.id = id
      return next
    })()

    const nextItems = [...items]
    if (idx >= 0) nextItems[idx] = merged
    else nextItems.push(merged)

    nextItems.sort((a, b) => a.id.localeCompare(b.id))

    const before = await fs.readFile(canonFile(args.kind), "utf8").catch(() => "")
    const after = YAML.stringify(nextItems).trimEnd() + "\n"

    const patch = unifiedDiff({
      filePath: `novel/canon/${args.kind}.yml`,
      before,
      after,
      fromLabel: "before",
      toLabel: "after",
    }).trimEnd()

    if (args.apply) {
      await writeCanon(args.kind, nextItems as any)
    }

    return patch || "(no changes)"
  },
})

