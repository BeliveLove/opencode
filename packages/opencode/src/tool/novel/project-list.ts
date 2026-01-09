import fs from "fs/promises"
import path from "path"
import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./project-list.txt"
import { legacyNovelRoot, listNovelIds, novelsRoot } from "../../novel/paths"
import { askReadPattern } from "./util"

async function safeParseYaml(content: string) {
  try {
    return { ok: true as const, value: YAML.parse(content) }
  } catch (err) {
    return { ok: false as const, error: (err as any)?.message?.toString?.() || "YAML parse error" }
  }
}

export const NovelProjectListTool = Tool.define("novel.project.list", {
  description: DESCRIPTION,
  parameters: z.object({}),
  async execute(_params, ctx) {
    await askReadPattern(ctx, "novels/.active", { scope: "novels" })
    await askReadPattern(ctx, "novels/*/config.yml", { scope: "novels" })

    const active = await fs.readFile(path.join(novelsRoot(), ".active"), "utf8").catch(() => "")
    const activeId = active.trim() || null

    const ids = await listNovelIds()
    const novels = await Promise.all(
      ids.map(async (novelId) => {
        const configPath = path.join(novelsRoot(), novelId, "config.yml")
        const raw = await fs.readFile(configPath, "utf8").catch(() => "")
        const parsed = raw.trim() ? await safeParseYaml(raw) : { ok: true as const, value: null }
        const title = parsed.ok ? (parsed.value?.project?.title ?? "").toString() : ""
        return {
          novelId,
          title: title || null,
          configPath: path.posix.join("novels", novelId, "config.yml"),
          configOk: parsed.ok,
          ...(parsed.ok ? {} : { configError: parsed.error }),
        }
      }),
    )

    const legacyExists = await fs
      .access(legacyNovelRoot())
      .then(() => true)
      .catch(() => false)

    return {
      title: "novel.project.list",
      output: YAML.stringify({ active: activeId, novels, legacy: legacyExists }).trimEnd(),
      metadata: { active: activeId, count: novels.length, legacy: legacyExists },
    }
  },
})

