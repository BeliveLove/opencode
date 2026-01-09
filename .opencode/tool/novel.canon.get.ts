/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.canon.get.txt"
import YAML from "yaml"
import { CANON_KINDS, type CanonKind, readCanon } from "../novel/canon"

export default tool({
  description: DESCRIPTION,
  args: {
    kind: tool.schema.enum(CANON_KINDS as [CanonKind, ...CanonKind[]]).describe("Canon kind"),
    id: tool.schema.string().describe("Canonical id (e.g. CHAR_LIN_QINGHE)"),
  },
  async execute(args) {
    const items = await readCanon(args.kind)
    const found = items.find((x) => x.id === args.id)
    if (!found) return "not found"
    return YAML.stringify([found]).trimEnd()
  },
})

