import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { DocConvertTool } from "../../src/tool/doc/convert"
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
      '  if [ "$1" = "-o" ]; then',
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

describe("tool.doc.convert", () => {
  test("converts using pandoc binary", async () => {
    const original = process.env.OPENCODE_PANDOC_BIN
    await using tmp = await tmpdir({
      init: async (dir) => {
        const inputPath = path.join(dir, "input.md")
        const outputPath = path.join(dir, "output.html")
        await fs.writeFile(inputPath, "# Hello")
        const pandocPath = await createPandocStub(dir)
        return { inputPath, outputPath, pandocPath }
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        try {
          process.env.OPENCODE_PANDOC_BIN = tmp.extra.pandocPath
          Pandoc.reset()
          const tool = await DocConvertTool.init()
          const result = await tool.execute(
            { inputPath: tmp.extra.inputPath, outputPath: tmp.extra.outputPath },
            ctx,
          )
          expect(result.output).toContain("converted")
          const output = await Bun.file(tmp.extra.outputPath).text()
          expect(output).toContain("converted")
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
