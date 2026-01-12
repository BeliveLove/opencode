import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import YAML from "yaml"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { DocVersionDiffTool } from "../../src/tool/doc/version-diff"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

describe("tool.doc_version_diff", () => {
  test("reports added/modified sections", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(
          path.join(dir, "old.md"),
          ["# Title", "", "## Overview", "Alpha", "", "## Notes", "Old note"].join("\n"),
        )
        await fs.writeFile(
          path.join(dir, "new.md"),
          ["# Title", "", "## Overview", "Alpha updated", "", "## Risks", "New risk"].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await DocVersionDiffTool.init()
        const result = await tool.execute(
          { oldPath: path.join(tmp.path, "old.md"), newPath: path.join(tmp.path, "new.md") },
          ctx,
        )
        const yaml = result.output.replace(/^```yml\s*/i, "").replace(/```$/, "").trim()
        const parsed = YAML.parse(yaml)
        expect(parsed.schema).toBe("doc.version.diff.v1")
        expect(parsed.summary.modified_sections.length).toBeGreaterThan(0)
        expect(parsed.summary.added_sections.length).toBeGreaterThan(0)
        expect(parsed.summary.removed_sections.length).toBeGreaterThan(0)
      },
    })
  })
})
