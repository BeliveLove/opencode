import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "../tool"
import DESCRIPTION from "./template-render.txt"
import { Pandoc } from "@/file/pandoc"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"

async function ensureReadableFile(ctx: Tool.Context, filePath: string) {
  if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filePath)) {
    const parentDir = path.dirname(filePath)
    await ctx.ask({
      permission: "external_directory",
      patterns: [parentDir],
      always: [parentDir + "/*"],
      metadata: { filePath, parentDir },
    })
  }

  await ctx.ask({
    permission: "read",
    patterns: [filePath],
    always: ["*"],
    metadata: {},
  })
}

async function ensureWritableFile(ctx: Tool.Context, filePath: string) {
  if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filePath)) {
    const parentDir = path.dirname(filePath)
    await ctx.ask({
      permission: "external_directory",
      patterns: [parentDir],
      always: [parentDir + "/*"],
      metadata: { filePath, parentDir },
    })
  }

  await ctx.ask({
    permission: "edit",
    patterns: [filePath],
    always: ["*"],
    metadata: { filePath },
  })
}

type Template = {
  id: string
  version: string
  title: string
  body: string
}

const TEMPLATES: Template[] = [
  {
    id: "doc.default",
    version: "1.0.0",
    title: "Document Template",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Status: {{status}}",
      "- Version: {{version}}",
      "",
      "## Summary",
      "",
      "## Background",
      "",
      "## Goals / Non-goals",
      "",
      "## Scope",
      "",
      "## Details",
      "",
      "## Decisions",
      "",
      "## Risks & Open questions",
      "",
    ].join("\n"),
  },
  {
    id: "tech.prd",
    version: "1.0.0",
    title: "Product Requirements Document (PRD)",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Status: {{status}}",
      "- Version: {{version}}",
      "",
      "## 1. Background",
      "",
      "## 2. Goals / Non-goals",
      "",
      "## 3. Users & Use cases",
      "",
      "## 4. Requirements",
      "",
      "### 4.1 Functional requirements",
      "",
      "### 4.2 Non-functional requirements",
      "",
      "## 5. Success metrics",
      "",
      "## 6. Risks & Open questions",
      "",
    ].join("\n"),
  },
  {
    id: "tech.tdd",
    version: "1.0.0",
    title: "Technical Design Document (TDD)",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Status: {{status}}",
      "- Related PRD: {{related_prd}}",
      "",
      "## 1. Overview",
      "",
      "## 2. Architecture",
      "",
      "## 3. Data model",
      "",
      "## 4. API / Interfaces",
      "",
      "## 5. Failure modes & Recovery",
      "",
      "## 6. Security & Compliance",
      "",
      "## 7. Rollout plan",
      "",
    ].join("\n"),
  },
  {
    id: "tech.sdd",
    version: "1.0.0",
    title: "Software Design Document (SDD)",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Status: {{status}}",
      "- Related PRD/Reqs: {{related_reqs}}",
      "",
      "## 1. Purpose & Scope",
      "",
      "## 2. Requirements summary",
      "",
      "## 3. Architecture overview",
      "",
      "### 3.1 Context diagram (placeholder)",
      "",
      "### 3.2 Component diagram (placeholder)",
      "",
      "## 4. Data flow",
      "",
      "### 4.1 DFD / pipeline steps (placeholder)",
      "",
      "## 5. Component design",
      "",
      "## 6. Interfaces / APIs",
      "",
      "## 7. Data model",
      "",
      "## 8. Interaction diagrams",
      "",
      "### 8.1 Sequence / state transitions (placeholder)",
      "",
      "## 9. Deployment & configuration",
      "",
      "## 10. Non-functional requirements",
      "",
      "### 10.1 Performance",
      "",
      "### 10.2 Reliability",
      "",
      "### 10.3 Security",
      "",
      "## 11. Testing strategy",
      "",
      "## 12. Risks & Open questions",
      "",
    ].join("\n"),
  },
  {
    id: "eng.requirements_analysis",
    version: "1.0.0",
    title: "Requirements Analysis",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Stakeholders: {{stakeholders}}",
      "",
      "## 1. Background & Problem statement",
      "",
      "## 2. Goals / Non-goals",
      "",
      "## 3. Users & Use cases",
      "",
      "## 4. Functional requirements",
      "",
      "## 5. Non-functional requirements",
      "",
      "## 6. Constraints & Assumptions",
      "",
      "## 7. Out of scope",
      "",
      "## 8. Acceptance criteria",
      "",
      "## 9. Traceability (req -> design/test)",
      "",
      "## 10. Open questions",
      "",
    ].join("\n"),
  },
  {
    id: "eng.feasibility_study",
    version: "1.0.0",
    title: "Feasibility Study",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Decision deadline: {{deadline}}",
      "",
      "## 1. Objective & Scope",
      "",
      "## 2. Options considered",
      "",
      "## 3. Technical feasibility",
      "",
      "## 4. Operational feasibility",
      "",
      "## 5. Schedule feasibility",
      "",
      "## 6. Cost & ROI",
      "",
      "## 7. Risks",
      "",
      "## 8. Recommendation",
      "",
    ].join("\n"),
  },
  {
    id: "qa.test_plan",
    version: "1.0.0",
    title: "Test Plan",
    body: [
      "# {{title}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Scope: {{scope}}",
      "",
      "## 1. Objectives",
      "",
      "## 2. Test strategy",
      "",
      "## 3. Test cases (high level)",
      "",
      "## 4. Environments",
      "",
      "## 5. Entry / Exit criteria",
      "",
      "## 6. Risks",
      "",
    ].join("\n"),
  },
  {
    id: "eng.release_notes",
    version: "1.0.0",
    title: "Release Notes",
    body: [
      "# Release Notes — {{product}} {{version}}",
      "",
      "- Date: {{date}}",
      "- Owners: {{owner}}",
      "",
      "## Highlights",
      "",
      "## Changes",
      "",
      "## Fixes",
      "",
      "## Known issues",
      "",
      "## Rollback plan",
      "",
    ].join("\n"),
  },
  {
    id: "ops.runbook",
    version: "1.0.0",
    title: "Operations Runbook",
    body: [
      "# {{service}} — Runbook",
      "",
      "- Owner: {{owner}}",
      "- Oncall: {{oncall}}",
      "",
      "## 1. Service overview",
      "",
      "## 2. Dashboards / Alerts",
      "",
      "## 3. Common operations",
      "",
      "## 4. Incident response checklist",
      "",
      "## 5. Escalation & Contacts",
      "",
    ].join("\n"),
  },
  {
    id: "ops.postmortem",
    version: "1.0.0",
    title: "Incident Postmortem",
    body: [
      "# Postmortem: {{incident_title}}",
      "",
      "- Date: {{date}}",
      "- Severity: {{severity}}",
      "- Owner: {{owner}}",
      "",
      "## Summary",
      "",
      "## Impact",
      "",
      "## Timeline",
      "",
      "## Root cause",
      "",
      "## What went well / What went wrong",
      "",
      "## Action items",
      "",
    ].join("\n"),
  },
  {
    id: "mgmt.meeting_minutes",
    version: "1.0.0",
    title: "Meeting Minutes",
    body: [
      "# Meeting Minutes — {{title}}",
      "",
      "- Date: {{date}}",
      "- Attendees: {{attendees}}",
      "- Facilitator: {{facilitator}}",
      "",
      "## Agenda",
      "",
      "## Notes",
      "",
      "## Decisions",
      "",
      "## Action items",
      "",
    ].join("\n"),
  },
  {
    id: "mgmt.weekly_report",
    version: "1.0.0",
    title: "Weekly Report",
    body: [
      "# Weekly Report — {{team}} — Week of {{date}}",
      "",
      "- Owner: {{owner}}",
      "",
      "## 1. Summary",
      "",
      "## 2. Progress",
      "",
      "## 3. Risks / Blockers",
      "",
      "## 4. Next week plan",
      "",
    ].join("\n"),
  },
  {
    id: "security.threat_model",
    version: "1.0.0",
    title: "Threat Model",
    body: [
      "# Threat Model — {{system}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "",
      "## 1. System overview",
      "",
      "## 2. Assets",
      "",
      "## 3. Trust boundaries",
      "",
      "## 4. Threats (STRIDE)",
      "",
      "## 5. Mitigations",
      "",
      "## 6. Residual risk",
      "",
    ].join("\n"),
  },
  {
    id: "legal.contract_review_notes",
    version: "1.0.0",
    title: "Contract Review Notes",
    body: [
      "# Contract Review — {{counterparty}}",
      "",
      "- Owner: {{owner}}",
      "- Date: {{date}}",
      "- Contract: {{contract_name}}",
      "",
      "## Summary",
      "",
      "## Key terms",
      "",
      "## Risks / Unacceptable terms",
      "",
      "## Required changes",
      "",
      "## Questions for counterparty",
      "",
    ].join("\n"),
  },
] as const

const templateById = new Map<string, Template>(TEMPLATES.map((t) => [t.id, t]))

const TEMPLATE_ALIASES = new Map<string, string>([
  ["prd", "tech.prd"],
  ["tdd", "tech.tdd"],
  ["sdd", "tech.sdd"],
  ["requirements", "eng.requirements_analysis"],
  ["requirements_analysis", "eng.requirements_analysis"],
  ["feasibility", "eng.feasibility_study"],
  ["feasibility_study", "eng.feasibility_study"],
  ["release_notes", "eng.release_notes"],
  ["test_plan", "qa.test_plan"],
  ["testplan", "qa.test_plan"],
  ["runbook", "ops.runbook"],
  ["postmortem", "ops.postmortem"],
  ["threat_model", "security.threat_model"],
  ["meeting_minutes", "mgmt.meeting_minutes"],
  ["minutes", "mgmt.meeting_minutes"],
  ["weekly_report", "mgmt.weekly_report"],
  ["contract_review", "legal.contract_review_notes"],
  ["contract_review_notes", "legal.contract_review_notes"],
])

type InferredTemplateInfo = {
  inferred: boolean
  inferredFrom?: {
    domain: string
    docType: string
    baseTemplateId?: string
  }
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function splitTemplateId(templateId: string) {
  const parts = templateId.split(".").filter(Boolean)
  if (parts.length <= 1) {
    return {
      domain: "general",
      docType: parts[0] ?? templateId,
    }
  }
  return {
    domain: parts[0],
    docType: parts.slice(1).join("."),
  }
}

type Section = {
  heading: string
  subheadings?: string[]
}

function addSections(target: Section[], incoming: Section[]) {
  const existing = new Map<string, Section>()
  for (const section of target) {
    existing.set(section.heading.toLowerCase(), section)
  }
  for (const section of incoming) {
    const key = section.heading.toLowerCase()
    const current = existing.get(key)
    if (!current) {
      target.push({ heading: section.heading, subheadings: section.subheadings ? [...section.subheadings] : undefined })
      existing.set(key, target[target.length - 1])
      continue
    }
    if (!section.subheadings?.length) continue
    if (!current.subheadings) current.subheadings = []
    for (const sub of section.subheadings) {
      if (!current.subheadings.includes(sub)) current.subheadings.push(sub)
    }
  }
}

function inferSections(domain: string, docType: string): Section[] {
  const sections: Section[] = []
  const domainKey = normalizeKey(domain)
  const docTypeKey = normalizeKey(docType)
  const includesAny = (value: string, candidates: string[]) => candidates.some((c) => value.includes(c))

  if (includesAny(docTypeKey, ["architecture", "arch"])) {
    addSections(sections, [
      { heading: "Overview" },
      { heading: "Goals / Non-goals" },
      { heading: "Architecture overview", subheadings: ["Context diagram (placeholder)", "Component diagram (placeholder)"] },
      { heading: "Data flow", subheadings: ["DFD / pipeline steps (placeholder)"] },
      { heading: "Interfaces / APIs" },
      { heading: "Data model" },
      { heading: "Deployment & configuration" },
      { heading: "Security & Compliance" },
      { heading: "Observability & Monitoring" },
      { heading: "Risks & Open questions" },
    ])
  }

  if (includesAny(docTypeKey, ["design", "sdd"])) {
    addSections(sections, [
      { heading: "Purpose & Scope" },
      { heading: "Requirements summary" },
      { heading: "Architecture overview", subheadings: ["Context diagram (placeholder)", "Component diagram (placeholder)"] },
      { heading: "Data flow", subheadings: ["DFD / pipeline steps (placeholder)"] },
      { heading: "Component design" },
      { heading: "Interfaces / APIs" },
      { heading: "Data model" },
      { heading: "Interaction diagrams", subheadings: ["Sequence / state transitions (placeholder)"] },
      { heading: "Deployment & configuration" },
      { heading: "Non-functional requirements", subheadings: ["Performance", "Reliability", "Security"] },
      { heading: "Testing strategy" },
      { heading: "Risks & Open questions" },
    ])
  }

  if (includesAny(docTypeKey, ["requirements", "analysis"])) {
    addSections(sections, [
      { heading: "Background & Problem statement" },
      { heading: "Goals / Non-goals" },
      { heading: "Users & Use cases" },
      { heading: "Functional requirements" },
      { heading: "Non-functional requirements" },
      { heading: "Constraints & Assumptions" },
      { heading: "Out of scope" },
      { heading: "Acceptance criteria" },
      { heading: "Traceability (req -> design/test)" },
      { heading: "Open questions" },
    ])
  }

  if (includesAny(docTypeKey, ["test", "qa"])) {
    addSections(sections, [
      { heading: "Objectives" },
      { heading: "Test strategy" },
      { heading: "Test cases (high level)" },
      { heading: "Environments" },
      { heading: "Entry / Exit criteria" },
      { heading: "Risks" },
    ])
  }

  if (includesAny(docTypeKey, ["runbook", "ops"])) {
    addSections(sections, [
      { heading: "Service overview" },
      { heading: "Dashboards / Alerts" },
      { heading: "Common operations" },
      { heading: "Incident response checklist" },
      { heading: "Escalation & Contacts" },
    ])
  }

  if (includesAny(docTypeKey, ["postmortem", "incident"])) {
    addSections(sections, [
      { heading: "Summary" },
      { heading: "Impact" },
      { heading: "Timeline" },
      { heading: "Root cause" },
      { heading: "What went well / What went wrong" },
      { heading: "Action items" },
    ])
  }

  if (includesAny(docTypeKey, ["threat", "security"])) {
    addSections(sections, [
      { heading: "System overview" },
      { heading: "Assets" },
      { heading: "Trust boundaries" },
      { heading: "Threats (STRIDE)" },
      { heading: "Mitigations" },
      { heading: "Residual risk" },
    ])
  }

  if (includesAny(docTypeKey, ["release", "notes"])) {
    addSections(sections, [
      { heading: "Highlights" },
      { heading: "Changes" },
      { heading: "Fixes" },
      { heading: "Known issues" },
      { heading: "Rollback plan" },
    ])
  }

  if (includesAny(docTypeKey, ["meeting", "minutes"])) {
    addSections(sections, [
      { heading: "Agenda" },
      { heading: "Notes" },
      { heading: "Decisions" },
      { heading: "Action items" },
    ])
  }

  if (includesAny(docTypeKey, ["weekly", "report"])) {
    addSections(sections, [
      { heading: "Summary" },
      { heading: "Progress" },
      { heading: "Risks / Blockers" },
      { heading: "Next week plan" },
    ])
  }

  if (includesAny(docTypeKey, ["contract", "legal"])) {
    addSections(sections, [
      { heading: "Summary" },
      { heading: "Key terms" },
      { heading: "Risks / Unacceptable terms" },
      { heading: "Required changes" },
      { heading: "Questions for counterparty" },
    ])
  }

  switch (domainKey) {
    case "tech":
      addSections(sections, [
        { heading: "Overview" },
        { heading: "Architecture" },
        { heading: "Data model" },
        { heading: "Interfaces / APIs" },
        { heading: "Deployment & configuration" },
        { heading: "Security & Compliance" },
        { heading: "Observability & Monitoring" },
        { heading: "Risks & Open questions" },
      ])
      break
    case "eng":
      addSections(sections, [
        { heading: "Background & Problem statement" },
        { heading: "Goals / Non-goals" },
        { heading: "Requirements" },
        { heading: "Constraints & Assumptions" },
        { heading: "Risks & Open questions" },
      ])
      break
    case "ops":
      addSections(sections, [
        { heading: "Service overview" },
        { heading: "Dashboards / Alerts" },
        { heading: "Common operations" },
        { heading: "Incident response checklist" },
        { heading: "Escalation & Contacts" },
      ])
      break
    case "mgmt":
      addSections(sections, [
        { heading: "Summary" },
        { heading: "Decisions" },
        { heading: "Action items" },
        { heading: "Risks / Blockers" },
        { heading: "Next steps" },
      ])
      break
    case "security":
      addSections(sections, [
        { heading: "System overview" },
        { heading: "Assets" },
        { heading: "Trust boundaries" },
        { heading: "Threats (STRIDE)" },
        { heading: "Mitigations" },
        { heading: "Residual risk" },
      ])
      break
    case "legal":
      addSections(sections, [
        { heading: "Summary" },
        { heading: "Key terms" },
        { heading: "Risks / Unacceptable terms" },
        { heading: "Required changes" },
        { heading: "Questions for counterparty" },
      ])
      break
    default:
      addSections(sections, [
        { heading: "Summary" },
        { heading: "Background" },
        { heading: "Goals / Non-goals" },
        { heading: "Scope" },
        { heading: "Details" },
        { heading: "Decisions" },
        { heading: "Risks & Open questions" },
      ])
      break
  }

  if (sections.length === 0) {
    addSections(sections, [
      { heading: "Summary" },
      { heading: "Background" },
      { heading: "Goals / Non-goals" },
      { heading: "Scope" },
      { heading: "Details" },
      { heading: "Decisions" },
      { heading: "Risks & Open questions" },
    ])
  }

  return sections
}

function titleize(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function buildAutoTemplateBody(domain: string, docType: string) {
  const sections = inferSections(domain, docType)
  const lines: string[] = [
    "# {{title}}",
    "",
    "- Owner: {{owner}}",
    "- Date: {{date}}",
    "- Status: {{status}}",
    "- Version: {{version}}",
    "",
  ]

  for (const section of sections) {
    lines.push(`## ${section.heading}`, "")
    if (section.subheadings?.length) {
      for (const sub of section.subheadings) {
        lines.push(`### ${sub}`, "")
      }
    }
  }

  return lines.join("\n")
}

function resolveTemplate(templateId: string): { template: Template; info: InferredTemplateInfo } {
  const known = templateById.get(templateId)
  if (known) {
    return { template: known, info: { inferred: false } }
  }

  const { domain, docType } = splitTemplateId(templateId)
  const docTypeKey = normalizeKey(docType)
  const docTypeParts = docTypeKey.split("_").filter(Boolean)
  const alias = TEMPLATE_ALIASES.get(docTypeKey) ?? TEMPLATE_ALIASES.get(docTypeParts[0] ?? "")
  if (alias) {
    const base = templateById.get(alias)
    if (base) {
      return {
        template: { ...base, id: templateId },
        info: { inferred: true, inferredFrom: { domain: normalizeKey(domain), docType: docTypeKey, baseTemplateId: alias } },
      }
    }
  }

  const body = buildAutoTemplateBody(domain, docType)
  const title = `Auto Template: ${titleize(docType)}`
  return {
    template: {
      id: templateId,
      version: "1.0.0-auto",
      title,
      body,
    },
    info: { inferred: true, inferredFrom: { domain: normalizeKey(domain), docType: docTypeKey } },
  }
}

function renderTemplateBody(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
    const v = variables[String(key)]
    return v === undefined ? match : v
  })
}

export const DocTemplateRenderTool = Tool.define("doc_template_render", {
  description: DESCRIPTION,
  parameters: z.object({
    templateId: z.string().describe("Template id (e.g., 'tech.prd', 'tech.tdd', 'qa.test_plan')"),
    variables: z
      .record(z.string(), z.string())
      .optional()
      .describe("Optional variable map to substitute in the template"),
    outputPath: z.string().optional().describe("Optional path to write the rendered Markdown template"),
    referenceDocxPath: z
      .string()
      .optional()
      .describe("Optional path to write a reference .docx generated from the rendered template via pandoc"),
    pandocArgs: z.array(z.string()).optional().describe("Optional extra pandoc arguments for reference docx generation"),
  }),
  async execute(params, ctx) {
    const resolved = resolveTemplate(params.templateId)
    const t = resolved.template

    const output = renderTemplateBody(t.body, params.variables ?? {})
    let outputPath: string | undefined
    let referenceDocxPath: string | undefined
    let pandocStdout = ""
    let pandocStderr = ""
    let pandocExitCode: number | undefined

    if (params.outputPath) {
      outputPath = params.outputPath
      if (!path.isAbsolute(outputPath)) outputPath = path.join(process.cwd(), outputPath)
      outputPath = path.resolve(outputPath)

      await ensureWritableFile(ctx, outputPath)
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, output, "utf8")
    }

    if (params.referenceDocxPath) {
      if (!outputPath) {
        throw new Error("referenceDocxPath requires outputPath so the rendered template can be converted to docx.")
      }
      referenceDocxPath = params.referenceDocxPath
      if (!path.isAbsolute(referenceDocxPath)) referenceDocxPath = path.join(process.cwd(), referenceDocxPath)
      referenceDocxPath = path.resolve(referenceDocxPath)

      await ensureReadableFile(ctx, outputPath)
      await ensureWritableFile(ctx, referenceDocxPath)
      await fs.mkdir(path.dirname(referenceDocxPath), { recursive: true })

      const pandocPath = await Pandoc.filepath()
      const args = [outputPath, "-o", referenceDocxPath]
      if (params.pandocArgs?.length) args.push(...params.pandocArgs)
      const proc = Bun.spawn([pandocPath, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: Instance.directory,
        env: { ...process.env },
      })
      await proc.exited
      pandocStdout = (await Bun.readableStreamToText(proc.stdout)).trim()
      pandocStderr = (await Bun.readableStreamToText(proc.stderr)).trim()
      pandocExitCode = proc.exitCode ?? undefined
      if (proc.exitCode !== 0) {
        const details = [pandocStderr, pandocStdout].filter(Boolean).join("\n")
        throw new Error(`pandoc conversion failed (exit ${proc.exitCode})${details ? `:\n${details}` : ""}`)
      }
    }

    return {
      title: t.title,
      output,
      metadata: {
        templateId: t.id,
        version: t.version,
        inferred: resolved.info.inferred,
        inferredFrom: resolved.info.inferredFrom,
        outputPath,
        referenceDocxPath,
        pandocExitCode,
        pandocStdout,
        pandocStderr,
      },
    }
  },
})

