import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./graph-timeline.txt"
import { CanonKind, readCanon } from "../../novel/canon"
import { resolveNovelDir } from "../../novel/paths"
import { askReadPattern } from "./util"

export const NovelGraphTimelineTool = Tool.define("novel.graph.timeline", {
  description: DESCRIPTION,
  parameters: z.object({
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    const dir = await resolveNovelDir({ novelId: params.novelId })
    await askReadPattern(ctx, `${dir.relToProjectPosix}/canon/*`, { scope: `${dir.relToProjectPosix}/canon` })
    const events = await readCanon(CanonKind.timeline, { novelId: params.novelId })
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
    return {
      title: "novel.graph.timeline",
      output: lines.join("\n"),
      metadata: { eventCount: sorted.length },
    }
  },
})
