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
import PROMPT_NOVEL_OVERVIEW from "./template/novel-overview.txt"
import PROMPT_NOVEL_RELATIONS from "./template/novel-relations.txt"
import PROMPT_NOVEL_ARCS from "./template/novel-arcs.txt"
import PROMPT_NOVEL_SYNC from "./template/novel-sync.txt"
import PROMPT_DOC_FLOW from "./template/doc-flow.txt"
import PROMPT_SKILL_CREATE from "./template/skill-create.txt"
import PROMPT_SKILL_LIST from "./template/skill-list.txt"
import PROMPT_SKILL_SHOW from "./template/skill-show.txt"
import PROMPT_SKILL_INSTALL from "./template/skill-install.txt"
import PROMPT_SKILL_INIT from "./template/skill-init.txt"
import PROMPT_SKILL_UPDATE from "./template/skill-update.txt"
import PROMPT_SKILL_DELETE from "./template/skill-delete.txt"
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
    DOC_FLOW: "doc-flow",
    NOVEL_INIT: "novel-init",
    NOVEL_LIST: "novel-list",
    NOVEL_USE: "novel-use",
    NOVEL_PLAN: "novel-plan",
    NOVEL_DRAFT: "novel-draft",
    NOVEL_CHECK: "novel-check",
    NOVEL_IDEA: "novel-idea",
    NOVEL_POLISH: "novel-polish",
    NOVEL_EXPORT: "novel-export",
    NOVEL_OVERVIEW: "novel-overview",
    NOVEL_RELATIONS: "novel-relations",
    NOVEL_ARCS: "novel-arcs",
    NOVEL_SYNC: "novel-sync",
    SKILL_CREATE: "skill-create",
    SKILL_LIST: "skill-list",
    SKILL_SHOW: "skill-show",
    SKILL_INSTALL: "skill-install",
    SKILL_INIT: "skill-init",
    SKILL_UPDATE: "skill-update",
    SKILL_DELETE: "skill-delete",
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
      [Default.DOC_FLOW]: {
        name: Default.DOC_FLOW,
        description: "Doc workflow using docx/pdf/pptx/xlsx skills",
        agent: "doc",
        get template() {
          return PROMPT_DOC_FLOW
        },
        hints: hints(PROMPT_DOC_FLOW),
      },
      [Default.NOVEL_INIT]: {
        name: Default.NOVEL_INIT,
        description: "Initialize novel project structure",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_INIT
        },
        hints: hints(PROMPT_NOVEL_INIT),
      },
      [Default.NOVEL_LIST]: {
        name: Default.NOVEL_LIST,
        description: "List novel projects and show active",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_LIST
        },
        hints: hints(PROMPT_NOVEL_LIST),
      },
      [Default.NOVEL_USE]: {
        name: Default.NOVEL_USE,
        description: "Switch active novel project",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_USE
        },
        hints: hints(PROMPT_NOVEL_USE),
      },
      [Default.NOVEL_PLAN]: {
        name: Default.NOVEL_PLAN,
        description: "Create chapter outline and scene cards",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_PLAN
        },
        hints: hints(PROMPT_NOVEL_PLAN),
      },
      [Default.NOVEL_DRAFT]: {
        name: Default.NOVEL_DRAFT,
        description: "Draft chapter content from scene cards",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_DRAFT
        },
        hints: hints(PROMPT_NOVEL_DRAFT),
      },
      [Default.NOVEL_CHECK]: {
        name: Default.NOVEL_CHECK,
        description: "Check canon/timeline/foreshadow issues",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_CHECK
        },
        hints: hints(PROMPT_NOVEL_CHECK),
      },
      [Default.NOVEL_IDEA]: {
        name: Default.NOVEL_IDEA,
        description: "Generate novel ideas and write to notes",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_IDEA
        },
        hints: hints(PROMPT_NOVEL_IDEA),
      },
      [Default.NOVEL_POLISH]: {
        name: Default.NOVEL_POLISH,
        description: "Polish chapter text (light + rewrite)",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_POLISH
        },
        hints: hints(PROMPT_NOVEL_POLISH),
      },
      [Default.NOVEL_EXPORT]: {
        name: Default.NOVEL_EXPORT,
        description: "Export chapters/book to Markdown",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_EXPORT
        },
        hints: hints(PROMPT_NOVEL_EXPORT),
      },
      [Default.NOVEL_OVERVIEW]: {
        name: Default.NOVEL_OVERVIEW,
        description: "Generate a novel overview (bible) and write to notes",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_OVERVIEW
        },
        hints: hints(PROMPT_NOVEL_OVERVIEW),
      },
      [Default.NOVEL_RELATIONS]: {
        name: Default.NOVEL_RELATIONS,
        description: "Extract/update character & faction relations (canon + graph)",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_RELATIONS
        },
        hints: hints(PROMPT_NOVEL_RELATIONS),
      },
      [Default.NOVEL_ARCS]: {
        name: Default.NOVEL_ARCS,
        description: "Extract/update character arcs and turning points",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_ARCS
        },
        hints: hints(PROMPT_NOVEL_ARCS),
      },
      [Default.NOVEL_SYNC]: {
        name: Default.NOVEL_SYNC,
        description: "Sync novel bible/relations/arcs to disk (WYSIWYG)",
        agent: "novel",
        get template() {
          return PROMPT_NOVEL_SYNC
        },
        hints: hints(PROMPT_NOVEL_SYNC),
      },
      [Default.SKILL_CREATE]: {
        name: Default.SKILL_CREATE,
        description: "Create a new skill (file-based)",
        get template() {
          return PROMPT_SKILL_CREATE
        },
        hints: hints(PROMPT_SKILL_CREATE),
      },
      [Default.SKILL_LIST]: {
        name: Default.SKILL_LIST,
        description: "List available skills (file-based)",
        get template() {
          return PROMPT_SKILL_LIST
        },
        hints: hints(PROMPT_SKILL_LIST),
      },
      [Default.SKILL_SHOW]: {
        name: Default.SKILL_SHOW,
        description: "Show a skill's content (file-based)",
        get template() {
          return PROMPT_SKILL_SHOW
        },
        hints: hints(PROMPT_SKILL_SHOW),
      },
      [Default.SKILL_INSTALL]: {
        name: Default.SKILL_INSTALL,
        description: "Install skills from npm/pypi/url (file-based)",
        get template() {
          return PROMPT_SKILL_INSTALL
        },
        hints: hints(PROMPT_SKILL_INSTALL),
      },
      [Default.SKILL_INIT]: {
        name: Default.SKILL_INIT,
        description: "Install default skills if missing",
        get template() {
          return PROMPT_SKILL_INIT
        },
        hints: hints(PROMPT_SKILL_INIT),
      },
      [Default.SKILL_UPDATE]: {
        name: Default.SKILL_UPDATE,
        description: "Update skills from npm/pypi/url (file-based)",
        get template() {
          return PROMPT_SKILL_UPDATE
        },
        hints: hints(PROMPT_SKILL_UPDATE),
      },
      [Default.SKILL_DELETE]: {
        name: Default.SKILL_DELETE,
        description: "Delete a skill (file-based)",
        get template() {
          return PROMPT_SKILL_DELETE
        },
        hints: hints(PROMPT_SKILL_DELETE),
      },
    }

    for (const [name, command] of Object.entries(cfg.command ?? {})) {
      result[name] = {
        name,
        agent: command.agent,
        model: command.model,
        description: "Export chapters/book to Markdown",
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
        description: "Export chapters/book to Markdown",
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
