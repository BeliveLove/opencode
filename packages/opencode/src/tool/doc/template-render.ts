import z from "zod"
import { Tool } from "../tool"
import DESCRIPTION from "./template-render.txt"

type Template = {
  id: string
  version: string
  title: string
  body: string
}

const TEMPLATES: Template[] = [
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
  }),
  async execute(params) {
    const t = templateById.get(params.templateId)
    if (!t) {
      const available = Array.from(templateById.keys()).sort().join(", ")
      throw new Error(`Unknown templateId: ${params.templateId}\n\nAvailable: ${available}`)
    }

    const output = renderTemplateBody(t.body, params.variables ?? {})
    return {
      title: t.title,
      output,
      metadata: {
        templateId: t.id,
        version: t.version,
      },
    }
  },
})
