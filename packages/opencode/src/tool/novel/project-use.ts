import fs from "fs/promises"
import path from "path"
import z from "zod"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./project-use.txt"
import { novelsRoot } from "../../novel/paths"
import { askEdit, askReadPattern } from "./util"

export const NovelProjectUseTool = Tool.define("novel_project_use", {
  description: DESCRIPTION,
  parameters: z.object({
    novelId: z.string().min(1).describe("Novel id (directory under novels/<novelId>/)"),
  }),
  async execute(params, ctx) {
    await askReadPattern(ctx, "novels/*/config.yml", { scope: "novels" })

    const novelId = params.novelId.trim()
    const dir = path.join(novelsRoot(), novelId)
    const exists = await fs
      .access(dir)
      .then(() => true)
      .catch(() => false)

    if (!exists) {
      return {
        title: "novel_project_use",
        output: YAML.stringify({ ok: false, error: `novels/${novelId} 涓嶅瓨鍦紝璇峰厛杩愯 novel-init ${novelId}` }).trimEnd(),
        metadata: { ok: false, novelId },
      }
    }

    const activeFile = path.join(novelsRoot(), ".active")
    await fs.mkdir(path.dirname(activeFile), { recursive: true })
    await askEdit(ctx, activeFile, { filepath: activeFile, novelId })
    await fs.writeFile(activeFile, `${novelId}\n`, "utf8")

    return {
      title: "novel_project_use",
      output: YAML.stringify({ ok: true, active: novelId }).trimEnd(),
      metadata: { ok: true, novelId },
    }
  },
})


