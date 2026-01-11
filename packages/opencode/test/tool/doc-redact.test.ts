import { describe, expect, test } from "bun:test"
import YAML from "yaml"
import { DocRedactTool } from "../../src/tool/doc/redact"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

function parseYamlReport(output: string) {
  const m = /```yml\n([\s\S]*?)\n```/.exec(output)
  expect(m).toBeTruthy()
  return YAML.parse(m![1]!)
}

describe("tool.doc_redact", () => {
  test("masks email/phone/cn_id and valid bank cards; leaves invalid bank cards", async () => {
    const tool = await DocRedactTool.init()
    const input = [
      "email: test@example.com",
      "phone: +8613800138000",
      "cn_id: 11010519491231002X",
      "valid_card: 4242424242424242",
      "invalid_card: 1234567890123456",
    ].join("\n")

    const result = await tool.execute({ text: input, strategy: "mask" }, ctx)
    const report = parseYamlReport(result.output)

    expect(report.strategy).toBe("mask")
    expect(report.counts.email).toBe(1)
    expect(report.counts.phone).toBe(1)
    expect(report.counts.cn_id).toBe(1)
    expect(report.counts.bank_card).toBe(1)

    // Redacted text should not contain raw values
    expect(result.output).not.toContain("test@example.com")
    expect(result.output).not.toContain("11010519491231002X")
    expect(result.output).not.toContain("4242424242424242")

    // Invalid card should remain
    expect(result.output).toContain("1234567890123456")
  })

  test("remove strategy uses explicit placeholders", async () => {
    const tool = await DocRedactTool.init()
    const input = "Contact: test@example.com and 4242424242424242"
    const result = await tool.execute({ text: input, strategy: "remove", kinds: ["email", "bank_card"] }, ctx)
    const report = parseYamlReport(result.output)

    expect(report.strategy).toBe("remove")
    expect(report.counts.email).toBe(1)
    expect(report.counts.bank_card).toBe(1)
    expect(result.output).toContain("[REDACTED:email]")
    expect(result.output).toContain("[REDACTED:bank_card]")
  })
})


