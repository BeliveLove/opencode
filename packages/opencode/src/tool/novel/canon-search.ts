import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./canon-search.txt"
import { CANON_KINDS, type CanonKind, readCanon } from "../../novel/canon"

type CanonSearchHit = { id: string; label?: string }

function labelForItem(item: Record<string, any>) {
  return (item.name ?? item.title ?? item.promise ?? item.term ?? item.text ?? "").toString()
}

export const NovelCanonSearchTool = Tool.define("novel.canon.search", {
  description: DESCRIPTION,
  parameters: z.object({
    kind: z.enum(CANON_KINDS as [CanonKind, ...CanonKind[]]).describe("Canon kind"),
    query: z.string().describe("Search query"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  async execute(params) {
    const q = params.query.trim().toLowerCase()
    const items = await readCanon(params.kind)

    const hits: CanonSearchHit[] = []
    for (const item of items) {
      const text = JSON.stringify(item).toLowerCase()
      if (item.id.toLowerCase().includes(q) || text.includes(q)) {
        const label = labelForItem(item)
        hits.push({ id: item.id, label: label ? label : undefined })
      }
    }

    const sliced = hits.slice(0, params.limit)
    return {
      title: `${params.kind}:${params.query}`,
      output: sliced.length === 0 ? "[]" : JSON.stringify(sliced, null, 2),
      metadata: { kind: params.kind, query: params.query, count: sliced.length },
    }
  },
})

