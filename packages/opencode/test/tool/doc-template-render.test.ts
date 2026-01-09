import { describe, expect, test } from "bun:test"
import { DocTemplateRenderTool } from "../../src/tool/doc/template-render"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

describe("tool.doc.template.render", () => {
  test("renders a known template and substitutes variables", async () => {
    const tool = await DocTemplateRenderTool.init()
    const result = await tool.execute(
      { templateId: "tech.prd", variables: { title: "My PRD", owner: "Alice", date: "2026-01-09", status: "Draft", version: "v1" } },
      ctx,
    )
    expect(result.output).toContain("# My PRD")
    expect(result.output).toContain("Owner: Alice")
    expect(result.metadata.templateId).toBe("tech.prd")
  })

  test("throws on unknown templateId", async () => {
    const tool = await DocTemplateRenderTool.init()
    await expect(tool.execute({ templateId: "unknown.template", variables: {} }, ctx)).rejects.toThrow("Available:")
  })
})

