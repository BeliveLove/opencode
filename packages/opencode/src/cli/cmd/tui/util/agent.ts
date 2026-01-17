import { Locale } from "@/util/locale"

const BUILTIN_AGENT_LABELS: Record<string, string> = {
  build: "构建",
  plan: "计划",
  general: "通用",
  explore: "探索",
}

export function displayAgentName(name: string) {
  return BUILTIN_AGENT_LABELS[name] ?? Locale.titlecase(name)
}
