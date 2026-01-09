import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./graph-relations.txt"
import { CanonKind, readCanon } from "../../novel/canon"
import { askReadPattern } from "./util"

function labelNode(id: string, name?: string) {
  return name ? `${id} ${name}` : id
}

export const NovelGraphRelationsTool = Tool.define("novel.graph.relations", {
  description: DESCRIPTION,
  parameters: z.object({}),
  async execute(_params, ctx) {
    await askReadPattern(ctx, "novel/canon/*", { scope: "novel/canon" })

    const characters = await readCanon(CanonKind.characters)
    const factions = await readCanon(CanonKind.factions)

    const charNodes = new Map<string, string>()
    for (const c of characters) charNodes.set(c.id, labelNode(c.id, c.name))

    const orgNodes = new Map<string, string>()
    for (const o of factions) orgNodes.set(o.id, labelNode(o.id, o.name))

    const charEdges: string[] = []
    for (const c of characters) {
      const rels = Array.isArray((c as any).relations) ? (c as any).relations : []
      for (const r of rels) {
        const to = r?.to
        const type = r?.type ?? "related"
        if (typeof to !== "string" || !to) continue
        charEdges.push(`  ${c.id} -->|${type}| ${to}`)
      }
    }

    const orgEdges: string[] = []
    for (const o of factions) {
      const rels = Array.isArray((o as any).relations) ? (o as any).relations : []
      for (const r of rels) {
        const to = r?.to
        const type = r?.type ?? "related"
        if (typeof to !== "string" || !to) continue
        orgEdges.push(`  ${o.id} -->|${type}| ${to}`)
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
      metadata: { characterCount: characters.length, factionCount: factions.length },
    }
  },
})
