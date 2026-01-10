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

function renderTemplateBody(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
    const v = variables[String(key)]
    return v === undefined ? match : v
  })
}

export const DocTemplateRenderTool = Tool.define("doc.template.render", {
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
    const t = templateById.get(params.templateId)
    if (!t) {
      const available = Array.from(templateById.keys()).sort().join(", ")
      throw new Error(`Unknown templateId: ${params.templateId}\n\nAvailable: ${available}`)
    }

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
        outputPath,
        referenceDocxPath,
        pandocExitCode,
        pandocStdout,
        pandocStderr,
      },
    }
  },
})
