/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.graph.timeline.txt"
import { CanonKind, readCanon } from "../novel/canon"

export default tool({
  description: DESCRIPTION,
  args: {},
  async execute() {
    const events = await readCanon(CanonKind.timeline)
    const sorted = [...events].sort(
      (a, b) => (a.at ?? "").toString().localeCompare((b.at ?? "").toString()) || a.id.localeCompare(b.id),
    )

    const lines: string[] = []
    lines.push("# 时间线（Mermaid）")
    lines.push("")
    lines.push("```mermaid")
    lines.push("graph TD")
    for (const e of sorted) {
      const label = [e.id, e.title].filter(Boolean).join(" ")
      lines.push(`  ${e.id}[${label}]`)
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      lines.push(`  ${sorted[i].id} --> ${sorted[i + 1].id}`)
    }
    lines.push("```")
    return lines.join("\n")
  },
})

