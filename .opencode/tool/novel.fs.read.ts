/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.fs.read.txt"
import fs from "fs/promises"
import { resolveNovelPath } from "../novel/paths"

export default tool({
  description: DESCRIPTION,
  args: {
    path: tool.schema.string().describe("Path relative to novel/ (e.g. chapters/CH_01_001.md)"),
  },
  async execute(args) {
    const resolved = resolveNovelPath(args.path)
    return fs.readFile(resolved.abs, "utf8")
  },
})

