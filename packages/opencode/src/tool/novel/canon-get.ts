import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./canon-get.txt"
import { CANON_KINDS, type CanonKind, readCanon } from "../../novel/canon"

export const NovelCanonGetTool = Tool.define("novel_canon_get", {
  description: DESCRIPTION,
  parameters: z.object({
    kind: z.enum(CANON_KINDS as [CanonKind, ...CanonKind[]]).describe("Canon kind"),
    id: z.string().describe("Canonical id (e.g. CHAR_LIN_QINGHE)"),
    novelId: z.string().optional().describe("Optional novel id override (under novels/<novelId>/)"),
  }),
  async execute(params, _ctx) {
    const items = await readCanon(params.kind, { novelId: params.novelId })
    const found = items.find((x) => x.id === params.id)
    return {
      title: `${params.kind}:${params.id}`,
      output: found ? YAML.stringify([found]).trimEnd() : "not found",
      metadata: { kind: params.kind, id: params.id, found: Boolean(found) },
    }
  },
})

