/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./novel.fs.write.txt"
import fs from "fs/promises"
import path from "path"
import { resolveNovelPath } from "../novel/paths"

export default tool({
  description: DESCRIPTION,
  args: {
    path: tool.schema.string().describe("Path relative to novel/ (e.g. canon/characters.yml)"),
    content: tool.schema.string().describe("File content to write"),
    mode: tool.schema.enum(["create", "overwrite", "append"]).default("overwrite"),
  },
  async execute(args) {
    const resolved = resolveNovelPath(args.path)
    await fs.mkdir(path.dirname(resolved.abs), { recursive: true })

    if (args.mode === "create") {
      const exists = await fs
        .access(resolved.abs)
        .then(() => true)
        .catch(() => false)
      if (exists) return `skipped (already exists): ${resolved.relToProjectPosix}`
      await fs.writeFile(resolved.abs, args.content, "utf8")
      return `created: ${resolved.relToProjectPosix}`
    }

    if (args.mode === "append") {
      await fs.appendFile(resolved.abs, args.content, "utf8")
      return `appended: ${resolved.relToProjectPosix}`
    }

    await fs.writeFile(resolved.abs, args.content, "utf8")
    return `wrote: ${resolved.relToProjectPosix}`
  },
})

