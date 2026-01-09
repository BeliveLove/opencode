import fs from "fs/promises"
import path from "path"
import YAML from "yaml"
import { novelRoot } from "./paths"

export const CanonKind = {
  characters: "characters",
  factions: "factions",
  rules: "rules",
  timeline: "timeline",
  foreshadow: "foreshadow",
  glossary: "glossary",
} as const

export type CanonKind = (typeof CanonKind)[keyof typeof CanonKind]

export const CANON_KINDS: CanonKind[] = [
  CanonKind.characters,
  CanonKind.factions,
  CanonKind.rules,
  CanonKind.timeline,
  CanonKind.foreshadow,
  CanonKind.glossary,
]

export function canonFile(kind: CanonKind) {
  return path.join(novelRoot, "canon", `${kind}.yml`)
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

export async function readCanon(kind: CanonKind): Promise<CanonItem[]> {
  const file = canonFile(kind)
  const content = await fs.readFile(file, "utf8").catch((err) => {
    if ((err as any)?.code === "ENOENT") return ""
    throw err
  })
  if (!content.trim()) return []
  const parsed = YAML.parse(content)
  return ensureYamlList(parsed, kind)
}

export async function writeCanon(kind: CanonKind, items: CanonItem[]) {
  const file = canonFile(kind)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const yaml = YAML.stringify(items).trimEnd() + "\n"
  await fs.writeFile(file, yaml, "utf8")
}

export function canonIdPrefix(kind: CanonKind) {
  switch (kind) {
    case CanonKind.characters:
      return "CHAR_"
    case CanonKind.factions:
      return "ORG_"
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

export async function readAllCanon(): Promise<Record<CanonKind, CanonItem[]>> {
  const entries = await Promise.all(CANON_KINDS.map(async (k) => [k, await readCanon(k)] as const))
  return Object.fromEntries(entries) as Record<CanonKind, CanonItem[]>
}

