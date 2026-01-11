import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./redact.txt"

type RedactionKind = "email" | "phone" | "cn_id" | "bank_card"

const ALL_KINDS: RedactionKind[] = ["email", "phone", "cn_id", "bank_card"]

function maskMiddle(value: string, keepStart: number, keepEnd: number) {
  const v = value.trim()
  if (v.length <= keepStart + keepEnd) return "*".repeat(Math.max(4, v.length))
  return v.slice(0, keepStart) + "*".repeat(v.length - keepStart - keepEnd) + v.slice(v.length - keepEnd)
}

function luhnValid(number: string) {
  const digits = number.replaceAll(/\s+/g, "")
  if (!/^\d{16,19}$/.test(digits)) return false
  let sum = 0
  let doubleIt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (doubleIt) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    doubleIt = !doubleIt
  }
  return sum % 10 === 0
}

function uniqueSamples(samples: string[], limit = 5) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of samples) {
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}

export const DocRedactTool = Tool.define("doc_redact", {
  description: DESCRIPTION,
  parameters: z.object({
    text: z.string().describe("Input text (plain text or Markdown)"),
    kinds: z.array(z.enum(ALL_KINDS)).optional().describe("Kinds to redact (defaults to all supported kinds)"),
    strategy: z.enum(["mask", "remove"]).optional().describe("Redaction strategy (defaults to 'mask')"),
  }),
  async execute(params, _ctx) {
    let output = params.text
    const counts: Record<string, number> = {}
    const samples: Record<string, string[]> = {}

    const apply = (kind: RedactionKind, replacer: (match: string) => string, regex: RegExp) => {
      let n = 0
      const hitSamples: string[] = []
      output = output.replace(regex, (m) => {
        n++
        const replaced = replacer(m)
        // Never include raw sensitive values in the report output.
        if (hitSamples.length < 20) hitSamples.push(replaced)
        return replaced
      })
      counts[kind] = (counts[kind] ?? 0) + n
      samples[kind] = uniqueSamples([...(samples[kind] ?? []), ...hitSamples])
    }

    const strategy = params.strategy ?? "mask"
    const should = new Set<RedactionKind>(params.kinds ?? ALL_KINDS)

    if (should.has("email")) {
      const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
      apply("email", (m) => (strategy === "remove" ? "[REDACTED:email]" : maskMiddle(m, 2, 6)), email)
    }

    if (should.has("phone")) {
      // CN mobile, optionally with +86 or 86 prefix.
      const phone = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g
      apply("phone", (m) => (strategy === "remove" ? "[REDACTED:phone]" : maskMiddle(m.replaceAll(/[-\s]/g, ""), 3, 4)), phone)
    }

    if (should.has("cn_id")) {
      const cnId = /\b\d{17}[\dXx]\b/g
      apply("cn_id", (m) => (strategy === "remove" ? "[REDACTED:cn_id]" : maskMiddle(m, 3, 2)), cnId)
    }

    if (should.has("bank_card")) {
      // Filter with Luhn to reduce false positives.
      const card = /\b\d{16,19}\b/g
      let n = 0
      const hitSamples: string[] = []
      output = output.replace(card, (m) => {
        if (!luhnValid(m)) return m
        n++
        const replaced = strategy === "remove" ? "[REDACTED:bank_card]" : maskMiddle(m, 4, 4)
        // Never include raw sensitive values in the report output.
        if (hitSamples.length < 20) hitSamples.push(replaced)
        return replaced
      })
      counts["bank_card"] = (counts["bank_card"] ?? 0) + n
      samples["bank_card"] = uniqueSamples([...(samples["bank_card"] ?? []), ...hitSamples])
    }

    const report = {
      ok: true,
      strategy,
      kinds: Array.from(should),
      counts,
      samples,
    }

    return {
      title: "doc_redact",
      output: ["```yml", YAML.stringify(report).trimEnd(), "```", "", output.trimEnd()].join("\n"),
      metadata: { counts },
    }
  },
})

