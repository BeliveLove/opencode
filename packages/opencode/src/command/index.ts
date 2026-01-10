import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"
import PROMPT_NOVEL_INIT from "./template/novel-init.txt"
import PROMPT_NOVEL_LIST from "./template/novel-list.txt"
import PROMPT_NOVEL_USE from "./template/novel-use.txt"
import PROMPT_NOVEL_PLAN from "./template/novel-plan.txt"
import PROMPT_NOVEL_DRAFT from "./template/novel-draft.txt"
import PROMPT_NOVEL_CHECK from "./template/novel-check.txt"
import PROMPT_NOVEL_IDEA from "./template/novel-idea.txt"
import PROMPT_NOVEL_POLISH from "./template/novel-polish.txt"
import PROMPT_NOVEL_EXPORT from "./template/novel-export.txt"
import PROMPT_DOC_OUTLINE from "./template/doc-outline.txt"
import PROMPT_DOC_FILL from "./template/doc-fill.txt"
import PROMPT_DOC_REVIEW from "./template/doc-review.txt"
import PROMPT_DOC_DIFF_SUMMARY from "./template/doc-diff-summary.txt"
import PROMPT_DOC_TRANSLATE from "./template/doc-translate.txt"
import PROMPT_DOC_REDACTION_PLAN from "./template/doc-redaction-plan.txt"
import PROMPT_DOC_CONVERT from "./template/doc-convert.txt"
import { MCP } from "../mcp"

export namespace Command {
  export const Event = {
    Executed: BusEvent.define(
      "command.executed",
      z.object({
        name: z.string(),
        sessionID: Identifier.schema("session"),
        arguments: z.string(),
        messageID: Identifier.schema("message"),
      }),
    ),
  }

  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      agent: z.string().optional(),
      model: z.string().optional(),
      mcp: z.boolean().optional(),
      // workaround for zod not supporting async functions natively so we use getters
      // https://zod.dev/v4/changelog?id=zfunction
      template: z.promise(z.string()).or(z.string()),
      subtask: z.boolean().optional(),
      hints: z.array(z.string()),
    })
    .meta({
      ref: "Command",
    })

  // for some reason zod is inferring `string` for z.promise(z.string()).or(z.string()) so we have to manually override it
  export type Info = Omit<z.infer<typeof Info>, "template"> & { template: Promise<string> | string }

  export function hints(template: string): string[] {
    const result: string[] = []
    const numbered = template.match(/\$\d+/g)
    if (numbered) {
      for (const match of [...new Set(numbered)].sort()) result.push(match)
    }
    if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
    return result
  }

  export const Default = {
    INIT: "init",
    REVIEW: "review",
    DOC_OUTLINE: "doc-outline",
    DOC_FILL: "doc-fill",
    DOC_REVIEW: "doc-review",
    DOC_DIFF_SUMMARY: "doc-diff-summary",
    DOC_TRANSLATE: "doc-translate",
    DOC_REDACTION_PLAN: "doc-redaction-plan",
    DOC_CONVERT: "doc-convert",
    NOVEL_INIT: "novel-init",
    NOVEL_LIST: "novel-list",
    NOVEL_USE: "novel-use",
    NOVEL_PLAN: "novel-plan",
    NOVEL_DRAFT: "novel-draft",
    NOVEL_CHECK: "novel-check",
    NOVEL_IDEA: "novel-idea",
    NOVEL_POLISH: "novel-polish",
    NOVEL_EXPORT: "novel-export",
  } as const

  const state = Instance.state(async () => {
    const cfg = await Config.get()

    const result: Record<string, Info> = {
      [Default.INIT]: {
        name: Default.INIT,
        description: "create/update AGENTS.md",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", Instance.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      },
      [Default.REVIEW]: {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        get template() {
          return PROMPT_REVIEW.replace("${path}", Instance.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      },
      [Default.DOC_OUTLINE]: {
        name: Default.DOC_OUTLINE,
        description: "生成文档大纲（含来源/缺口）",
        agent: "doc",
        get template() {
          return PROMPT_DOC_OUTLINE
        },
        hints: hints(PROMPT_DOC_OUTLINE),
      },
      [Default.DOC_FILL]: {
        name: Default.DOC_FILL,
        description: "按模板填充正文（不编造）",
        agent: "doc",
        get template() {
          return PROMPT_DOC_FILL
        },
        hints: hints(PROMPT_DOC_FILL),
      },
      [Default.DOC_REVIEW]: {
        name: Default.DOC_REVIEW,
        description: "文档审阅（阻塞项/修复建议）",
        agent: "doc",
        get template() {
          return PROMPT_DOC_REVIEW
        },
        hints: hints(PROMPT_DOC_REVIEW),
      },
      [Default.DOC_DIFF_SUMMARY]: {
        name: Default.DOC_DIFF_SUMMARY,
        description: "对比两版文档并生成变更摘要",
        agent: "doc",
        get template() {
          return PROMPT_DOC_DIFF_SUMMARY
        },
        hints: hints(PROMPT_DOC_DIFF_SUMMARY),
      },
      [Default.DOC_TRANSLATE]: {
        name: Default.DOC_TRANSLATE,
        description: "翻译文档（术语一致）",
        agent: "doc",
        get template() {
          return PROMPT_DOC_TRANSLATE
        },
        hints: hints(PROMPT_DOC_TRANSLATE),
      },
      [Default.DOC_REDACTION_PLAN]: {
        name: Default.DOC_REDACTION_PLAN,
        description: "对外发布前脱敏计划（含 doc.redact 参数）",
        agent: "doc",
        get template() {
          return PROMPT_DOC_REDACTION_PLAN
        },
        hints: hints(PROMPT_DOC_REDACTION_PLAN),
      },
      [Default.DOC_CONVERT]: {
        name: Default.DOC_CONVERT,
        description: "文档格式转换（pandoc）",
        agent: "doc",
        get template() {
          return PROMPT_DOC_CONVERT
        },
        hints: hints(PROMPT_DOC_CONVERT),
      },
      [Default.NOVEL_INIT]: {
        name: Default.NOVEL_INIT,
        description: "初始化小说工程目录（novels/<novel_id>/）",
        get template() {
          return PROMPT_NOVEL_INIT
        },
        hints: hints(PROMPT_NOVEL_INIT),
      },
      [Default.NOVEL_LIST]: {
        name: Default.NOVEL_LIST,
        description: "列出小说工程并显示当前 active",
        get template() {
          return PROMPT_NOVEL_LIST
        },
        hints: hints(PROMPT_NOVEL_LIST),
      },
      [Default.NOVEL_USE]: {
        name: Default.NOVEL_USE,
        description: "切换当前 active 小说（写入 novels/.active）",
        get template() {
          return PROMPT_NOVEL_USE
        },
        hints: hints(PROMPT_NOVEL_USE),
      },
      [Default.NOVEL_PLAN]: {
        name: Default.NOVEL_PLAN,
        description: "生成章纲+场景卡并写入 outlines/",
        get template() {
          return PROMPT_NOVEL_PLAN
        },
        hints: hints(PROMPT_NOVEL_PLAN),
      },
      [Default.NOVEL_DRAFT]: {
        name: Default.NOVEL_DRAFT,
        description: "按场景卡产出正文并写入 chapters/",
        get template() {
          return PROMPT_NOVEL_DRAFT
        },
        hints: hints(PROMPT_NOVEL_DRAFT),
      },
      [Default.NOVEL_CHECK]: {
        name: Default.NOVEL_CHECK,
        description: "对账 canon/时间线/伏笔，输出问题清单与最小修复方案",
        get template() {
          return PROMPT_NOVEL_CHECK
        },
        hints: hints(PROMPT_NOVEL_CHECK),
      },
      [Default.NOVEL_IDEA]: {
        name: Default.NOVEL_IDEA,
        description: "生成题材/设定草案并写入 notes/ideas.md",
        get template() {
          return PROMPT_NOVEL_IDEA
        },
        hints: hints(PROMPT_NOVEL_IDEA),
      },
      [Default.NOVEL_POLISH]: {
        name: Default.NOVEL_POLISH,
        description: "润色/节奏调整（保守/重写两档）",
        get template() {
          return PROMPT_NOVEL_POLISH
        },
        hints: hints(PROMPT_NOVEL_POLISH),
      },
      [Default.NOVEL_EXPORT]: {
        name: Default.NOVEL_EXPORT,
        description: "导出单章/全书（Markdown 拼接）",
        get template() {
          return PROMPT_NOVEL_EXPORT
        },
        hints: hints(PROMPT_NOVEL_EXPORT),
      },
    }

    for (const [name, command] of Object.entries(cfg.command ?? {})) {
      result[name] = {
        name,
        agent: command.agent,
        model: command.model,
        description: command.description,
        get template() {
          return command.template
        },
        subtask: command.subtask,
        hints: hints(command.template),
      }
    }
    for (const [name, prompt] of Object.entries(await MCP.prompts())) {
      result[name] = {
        name,
        mcp: true,
        description: prompt.description,
        get template() {
          // since a getter can't be async we need to manually return a promise here
          return new Promise<string>(async (resolve, reject) => {
            const template = await MCP.getPrompt(
              prompt.client,
              prompt.name,
              prompt.arguments
                ? // substitute each argument with $1, $2, etc.
                  Object.fromEntries(prompt.arguments?.map((argument, i) => [argument.name, `$${i + 1}`]))
                : {},
            ).catch(reject)
            resolve(
              template?.messages
                .map((message) => (message.content.type === "text" ? message.content.text : ""))
                .join("\n") || "",
            )
          })
        },
        hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
      }
    }

    return result
  })

  export async function get(name: string) {
    return state().then((x) => x[name])
  }

  export async function list() {
    return state().then((x) => Object.values(x))
  }
}
