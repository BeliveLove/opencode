import fs from "fs/promises"
import path from "path"
import YAML from "yaml"
import { resolveNovelPath } from "./paths"

export const CanonKind = {
  characters: "characters",
  factions: "factions",
  relations: "relations",
  arcs: "arcs",
  rules: "rules",
  timeline: "timeline",
  foreshadow: "foreshadow",
  glossary: "glossary",
} as const

export type CanonKind = (typeof CanonKind)[keyof typeof CanonKind]

export const CANON_KINDS: CanonKind[] = [
  CanonKind.characters,
  CanonKind.factions,
  CanonKind.relations,
  CanonKind.arcs,
  CanonKind.rules,
  CanonKind.timeline,
  CanonKind.foreshadow,
  CanonKind.glossary,
]

export async function canonFile(kind: CanonKind, options: { novelId?: string } = {}) {
  return resolveNovelPath(path.posix.join("canon", `${kind}.yml`), options)
}

export type CanonItem = Record<string, any> & { id: string }

function ensureYamlList(value: unknown, kind: CanonKind): CanonItem[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`canon/${kind}.yml 必须是 YAML 数组（list）`)
  const items = value.filter(Boolean) as any[]
  for (const item of items) {
    if (!item || typeof item !== "object") throw new Error(`canon/${kind}.yml 中存在非对象条目`)
    if (typeof (item as any).id !== "string" || !(item as any).id.trim()) {
      throw new Error(`canon/${kind}.yml 中存在缺少 id 的条目`)
    }
  }
  return items as CanonItem[]
}

export async function readCanon(kind: CanonKind, options: { novelId?: string } = {}): Promise<CanonItem[]> {
  const file = await canonFile(kind, options)
  const content = await fs.readFile(file.abs, "utf8").catch((err) => {
    if ((err as any)?.code === "ENOENT") return ""
    throw err
  })
  if (!content.trim()) return []
  const parsed = YAML.parse(content)
  return ensureYamlList(parsed, kind)
}

export async function writeCanon(kind: CanonKind, items: CanonItem[], options: { novelId?: string } = {}) {
  const file = await canonFile(kind, options)
  await fs.mkdir(path.dirname(file.abs), { recursive: true })
  const yaml = YAML.stringify(items).trimEnd() + "\n"
  await fs.writeFile(file.abs, yaml, "utf8")
}

export function canonIdPrefix(kind: CanonKind) {
  switch (kind) {
    case CanonKind.characters:
      return "CHAR_"
    case CanonKind.factions:
      return "ORG_"
    case CanonKind.relations:
      return "" // allow flexible schemas/ids for now
    case CanonKind.arcs:
      return "" // allow flexible schemas/ids for now
    case CanonKind.rules:
      return "RULE_"
    case CanonKind.timeline:
      return "EVT_"
    case CanonKind.foreshadow:
      return "FB_"
    case CanonKind.glossary:
      return "" // glossary is a catch-all; allow any prefix
  }
}

export async function readAllCanon(options: { novelId?: string } = {}): Promise<Record<CanonKind, CanonItem[]>> {
  const entries = await Promise.all(CANON_KINDS.map(async (k) => [k, await readCanon(k, options)] as const))
  return Object.fromEntries(entries) as Record<CanonKind, CanonItem[]>
}
