/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.graph.relations.txt"
import { CanonKind, readCanon } from "../novel/canon"

function labelNode(id: string, name?: string) {
  return name ? `${id} ${name}` : id
}

export default tool({
  description: DESCRIPTION,
  args: {},
  async execute() {
    const characters = await readCanon(CanonKind.characters)
    const factions = await readCanon(CanonKind.factions)

    const charNodes = new Map<string, string>()
    for (const c of characters) charNodes.set(c.id, labelNode(c.id, c.name))

    const orgNodes = new Map<string, string>()
    for (const o of factions) orgNodes.set(o.id, labelNode(o.id, o.name))

    const charEdges: string[] = []
    for (const c of characters) {
      const rels = Array.isArray(c.relations) ? c.relations : []
      for (const r of rels) {
        const to = r?.to
        const type = r?.type ?? "related"
        if (typeof to !== "string" || !to) continue
        charEdges.push(`  ${c.id} -->|${type}| ${to}`)
      }
    }

    const orgEdges: string[] = []
    for (const o of factions) {
      const rels = Array.isArray(o.relations) ? o.relations : []
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

    return lines.join("\n")
  },
})

