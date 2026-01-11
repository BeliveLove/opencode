type DocStyleHints = {
  toc?: boolean
  tocDepth?: number
  referenceDocx?: string
  pandocArgs?: string[]
  fontBody?: string
  fontHeading?: string
  fontMono?: string
  diagramStyle?: string
}

type DocStyleExtract = {
  styledMarkdown: string
  hints: DocStyleHints
}

const STYLE_SCHEMA = "doc.style.v1"

function stripQuotes(value: string) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseBoolean(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  return undefined
}

function parseNumber(value: string) {
  const num = Number(value.trim())
  return Number.isFinite(num) ? num : undefined
}

function parseArray(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item))
  } catch {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(",")
      .map((item) => stripQuotes(item))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}

function normalizeIndent(lines: string[]) {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^(\s*)/)?.[1]?.length ?? 0)
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0
  if (minIndent === 0) return lines
  return lines.map((line) => (line.length >= minIndent ? line.slice(minIndent) : line))
}

function extractValue(lines: string[], key: string) {
  const matcher = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`)
  for (const line of lines) {
    const match = matcher.exec(line)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function buildHints(lines: string[]): DocStyleHints {
  const hints: DocStyleHints = {}
  const tocValue = extractValue(lines, "toc")
  if (tocValue !== undefined) hints.toc = parseBoolean(tocValue)
  const tocDepthValue = extractValue(lines, "toc_depth")
  if (tocDepthValue !== undefined) hints.tocDepth = parseNumber(tocDepthValue)
  const referenceDocxValue = extractValue(lines, "reference_docx")
  if (referenceDocxValue !== undefined) hints.referenceDocx = stripQuotes(referenceDocxValue)
  const pandocArgsValue = extractValue(lines, "pandoc_args")
  if (pandocArgsValue !== undefined) hints.pandocArgs = parseArray(pandocArgsValue)
  const fontBodyValue = extractValue(lines, "font_body")
  if (fontBodyValue !== undefined) hints.fontBody = stripQuotes(fontBodyValue)
  const fontHeadingValue = extractValue(lines, "font_heading")
  if (fontHeadingValue !== undefined) hints.fontHeading = stripQuotes(fontHeadingValue)
  const fontMonoValue = extractValue(lines, "font_mono")
  if (fontMonoValue !== undefined) hints.fontMono = stripQuotes(fontMonoValue)
  const diagramStyleValue = extractValue(lines, "diagram_style")
  if (diagramStyleValue !== undefined) hints.diagramStyle = stripQuotes(diagramStyleValue)
  return hints
}

export function extractDocStylePayload(raw: string): DocStyleExtract | null {
  const lines = raw.split(/\r?\n/)
  const schemaIndex = lines.findIndex((line) => line.includes(STYLE_SCHEMA))
  if (schemaIndex === -1) return null
  const markerIndex = lines.findIndex((line) => line.trim().startsWith("styled_markdown:"))
  if (markerIndex === -1) return null

  const preamble = lines.slice(0, markerIndex)
  const styledLines = normalizeIndent(lines.slice(markerIndex + 1))
  const styledMarkdown = styledLines.join("\n").replace(/^\n+/, "")

  return {
    styledMarkdown,
    hints: buildHints(preamble),
  }
}

export type { DocStyleHints, DocStyleExtract }
