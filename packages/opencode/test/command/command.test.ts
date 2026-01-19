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
      expect(names.has("novel-overview")).toBe(true)
      expect(names.has("novel-relations")).toBe(true)
      expect(names.has("novel-arcs")).toBe(true)
      expect(names.has("novel-sync")).toBe(true)
      expect(names.has("doc-flow")).toBe(true)
    },
  })
}, 60_000)
