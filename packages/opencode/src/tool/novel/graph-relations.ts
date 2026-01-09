import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./graph-relations.txt"
import { CanonKind, readCanon } from "../../novel/canon"
import { resolveNovelDir } from "../../novel/paths"
import { askReadPattern } from "./util"

function labelNode(id: string, name?: string) {
  return name ? `${id} ${name}` : id
}

export const NovelGraphRelationsTool = Tool.define("novel.graph.relations", {
  description: DESCRIPTION,
  parameters: z.object({
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    const dir = await resolveNovelDir({ novelId: params.novelId })
    await askReadPattern(ctx, `${dir.relToProjectPosix}/canon/*`, { scope: `${dir.relToProjectPosix}/canon` })

    const options = { novelId: params.novelId }
    const characters = await readCanon(CanonKind.characters, options)
    const factions = await readCanon(CanonKind.factions, options)
    const relations = await readCanon(CanonKind.relations, options).catch(() => [])

    const charNodes = new Map<string, string>()
    for (const c of characters) charNodes.set(c.id, labelNode(c.id, c.name))

    const orgNodes = new Map<string, string>()
    for (const o of factions) orgNodes.set(o.id, labelNode(o.id, o.name))

    const charEdges: string[] = []
    const orgEdges: string[] = []

    const addNodeIfMissing = (id: string) => {
      if (id.startsWith("CHAR_") && !charNodes.has(id)) charNodes.set(id, id)
      if (id.startsWith("ORG_") && !orgNodes.has(id)) orgNodes.set(id, id)
    }

    const addEdge = (from: string, to: string, type: string) => {
      addNodeIfMissing(from)
      addNodeIfMissing(to)
      if (from.startsWith("CHAR_")) charEdges.push(`  ${from} -->|${type}| ${to}`)
      if (from.startsWith("ORG_")) orgEdges.push(`  ${from} -->|${type}| ${to}`)
    }

    const parsedAnyRelations = relations.length > 0
    if (parsedAnyRelations) {
      for (const r of relations as any[]) {
        const from = (r?.from ?? r?.a ?? r?.source ?? "").toString().trim()
        const to = (r?.to ?? r?.b ?? r?.target ?? "").toString().trim()
        const type = (r?.type ?? r?.relation ?? "related").toString().trim() || "related"
        if (!from || !to) continue
        addEdge(from, to, type)
      }
    } else {
      // Backward compatibility: relations embedded in characters/factions
      for (const c of characters) {
        const rels = Array.isArray((c as any).relations) ? (c as any).relations : []
        for (const r of rels) {
          const to = r?.to
          const type = (r?.type ?? "related").toString()
          if (typeof to !== "string" || !to) continue
          addEdge(c.id, to, type)
        }
      }
      for (const o of factions) {
        const rels = Array.isArray((o as any).relations) ? (o as any).relations : []
        for (const r of rels) {
          const to = r?.to
          const type = (r?.type ?? "related").toString()
          if (typeof to !== "string" || !to) continue
          addEdge(o.id, to, type)
        }
      }
    }

    const lines: string[] = []
    lines.push("# 关系图")
    lines.push("")
    lines.push("## 人物关系（CHAR）")
    lines.push("```mermaid")
    lines.push("graph LR")
    for (const [id, label] of charNodes) lines.push(`  ${id}[${label}]`)
    lines.push(...charEdges)
    lines.push("```")
    lines.push("")
    lines.push("## 势力关系（ORG）")
    lines.push("```mermaid")
    lines.push("graph TD")
    for (const [id, label] of orgNodes) lines.push(`  ${id}[${label}]`)
    lines.push(...orgEdges)
    lines.push("```")

    return {
      title: "novel.graph.relations",
      output: lines.join("\n"),
      metadata: { characterCount: characters.length, factionCount: factions.length, relationCount: charEdges.length + orgEdges.length },
    }
  },
})
