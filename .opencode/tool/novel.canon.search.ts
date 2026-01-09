/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.canon.search.txt"
import { CANON_KINDS, type CanonKind, readCanon } from "../novel/canon"

type CanonSearchHit = { id: string; label?: string }

function labelForItem(item: Record<string, any>) {
  return (item.name ?? item.title ?? item.promise ?? item.term ?? item.text ?? "").toString()
}

export default tool({
  description: DESCRIPTION,
  args: {
    kind: tool.schema.enum(CANON_KINDS as [CanonKind, ...CanonKind[]]).describe("Canon kind"),
    query: tool.schema.string().describe("Search query"),
    limit: tool.schema.number().int().min(1).max(50).default(10),
  },
  async execute(args) {
    const q = args.query.trim().toLowerCase()
    const items = await readCanon(args.kind)

    const hits: CanonSearchHit[] = []
    for (const item of items) {
      const text = JSON.stringify(item).toLowerCase()
      if (item.id.toLowerCase().includes(q) || text.includes(q)) {
        const label = labelForItem(item)
        hits.push({ id: item.id, label: label ? label : undefined })
      }
    }

    const sliced = hits.slice(0, args.limit)
    if (sliced.length === 0) return "[]"
    return JSON.stringify(sliced, null, 2)
  },
})

