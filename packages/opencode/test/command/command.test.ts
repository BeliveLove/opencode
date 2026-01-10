import { test, expect } from "bun:test"
import { Command } from "../../src/command"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

test("includes built-in novel and doc commands", async () => {
  await using tmp = await tmpdir({ git: true })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const commands = await Command.list()
      const names = new Set(commands.map((c) => c.name))
      expect(names.has("novel-init")).toBe(true)
      expect(names.has("novel-plan")).toBe(true)
      expect(names.has("novel-draft")).toBe(true)
      expect(names.has("novel-check")).toBe(true)
      expect(names.has("novel-idea")).toBe(true)
      expect(names.has("novel-polish")).toBe(true)
      expect(names.has("novel-export")).toBe(true)
      expect(names.has("doc-outline")).toBe(true)
      expect(names.has("doc-fill")).toBe(true)
      expect(names.has("doc-review")).toBe(true)
      expect(names.has("doc-diff-summary")).toBe(true)
      expect(names.has("doc-translate")).toBe(true)
      expect(names.has("doc-redaction-plan")).toBe(true)
      expect(names.has("doc-convert")).toBe(true)
    },
  })
}, 60_000)
