import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { DocTemplateRenderTool } from "../../src/tool/doc/template-render"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Pandoc } from "../../src/file/pandoc"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

async function createPandocStub(dir: string) {
  if (process.platform === "win32") {
    const filePath = path.join(dir, "pandoc-stub.cmd")
    await fs.writeFile(
      filePath,
      [
        "@echo off",
        "set out=",
        ":loop",
        "if \"%1\"==\"\" goto end",
        "if \"%1\"==\"-o\" (",
        "  set out=%2",
        "  shift",
        "  shift",
        "  goto loop",
        ")",
        "shift",
        "goto loop",
        ":end",
        "echo converted> \"%out%\"",
        "exit /b 0",
      ].join("\r\n"),
    )
    return filePath
  }

  const filePath = path.join(dir, "pandoc-stub.sh")
  await fs.writeFile(
    filePath,
    [
      "#!/bin/sh",
      'out=""',
      "while [ $# -gt 0 ]; do",
      '  if [ \"$1\" = \"-o\" ]; then',
      "    out=\"$2\"",
      "    shift 2",
      "    continue",
      "  fi",
      "  shift",
      "done",
      "echo converted > \"$out\"",
      "exit 0",
    ].join("\n"),
  )
  await fs.chmod(filePath, 0o755)
  return filePath
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

  test("auto-infers a template when templateId is unknown", async () => {
    const tool = await DocTemplateRenderTool.init()
    const result = await tool.execute(
      {
        templateId: "tech.architecture",
        variables: { title: "Architecture Overview", owner: "Alice", date: "2026-01-09", status: "Draft", version: "v1" },
      },
      ctx,
    )
    expect(result.output).toContain("# Architecture Overview")
    expect(result.output).toContain("## Architecture overview")
    expect(result.metadata.templateId).toBe("tech.architecture")
    expect(result.metadata.inferred).toBe(true)
  })

  test("writes template markdown and generates reference docx", async () => {
    const original = process.env.OPENCODE_PANDOC_BIN
    await using tmp = await tmpdir({
      init: async (dir) => {
        const outputPath = path.join(dir, "template.md")
        const referenceDocxPath = path.join(dir, "reference.docx")
        const pandocPath = await createPandocStub(dir)
        return { outputPath, referenceDocxPath, pandocPath }
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        try {
          process.env.OPENCODE_PANDOC_BIN = tmp.extra.pandocPath
          Pandoc.reset()
          const tool = await DocTemplateRenderTool.init()
          const result = await tool.execute(
            {
              templateId: "doc.default",
              variables: { title: "Spec", owner: "Alice", date: "2026-01-10", status: "Draft", version: "v1" },
              outputPath: tmp.extra.outputPath,
              referenceDocxPath: tmp.extra.referenceDocxPath,
            },
            ctx,
          )
          const markdown = await fs.readFile(tmp.extra.outputPath, "utf8")
          expect(markdown).toContain("# Spec")
          const docx = await fs.readFile(tmp.extra.referenceDocxPath, "utf8")
          expect(docx).toContain("converted")
          expect(result.metadata.outputPath).toBe(path.resolve(tmp.extra.outputPath))
          expect(result.metadata.referenceDocxPath).toBe(path.resolve(tmp.extra.referenceDocxPath))
        } finally {
          if (original === undefined) {
            delete process.env.OPENCODE_PANDOC_BIN
          } else {
            process.env.OPENCODE_PANDOC_BIN = original
          }
          Pandoc.reset()
        }
      },
    })
  })
})
