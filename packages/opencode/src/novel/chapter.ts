import matter from "gray-matter"

export type ChapterFrontmatter = Record<string, any> & {
  id?: string
  title?: string
  participants?: string[]
  locations?: string[]
  refs?: {
    rules?: string[]
    foreshadow?: string[]
    timeline?: string[]
    glossary?: string[]
    factions?: string[]
    characters?: string[]
  }
}

export function parseChapterMarkdown(content: string): { frontmatter: ChapterFrontmatter; body: string } {
  const parsed = matter(content)
  return {
    frontmatter: (parsed.data ?? {}) as ChapterFrontmatter,
    body: parsed.content ?? "",
  }
}

export function extractRefIds(input: { frontmatter: ChapterFrontmatter; body: string }) {
  const ids = new Set<string>()

  const addMany = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const v of value) {
      if (typeof v === "string" && v.trim()) ids.add(v.trim())
    }
  }

  addMany(input.frontmatter.participants)
  addMany(input.frontmatter.locations)

  const refs = input.frontmatter.refs ?? {}
  addMany(refs.rules)
  addMany(refs.foreshadow)
  addMany(refs.timeline)
  addMany(refs.glossary)
  addMany(refs.factions)
  addMany(refs.characters)

  const refTag = /\[REF:\s*([^\]]+)\]/g
  for (const match of input.body.matchAll(refTag)) {
    const raw = (match[1] ?? "").trim()
    if (!raw) continue
    for (const part of raw.split(",")) {
      const id = part.trim()
      if (id) ids.add(id)
    }
  }

  return Array.from(ids)
}

export function extractIdCandidates(text: string) {
  const candidates = new Set<string>()
  const idLike = /\b(CHAR|ORG|RULE|EVT|FB|LOC|ITEM)_[A-Z0-9_]+\b/g
  for (const match of text.matchAll(idLike)) {
    const id = match[0]
    if (id) candidates.add(id)
  }
  return Array.from(candidates)
}

