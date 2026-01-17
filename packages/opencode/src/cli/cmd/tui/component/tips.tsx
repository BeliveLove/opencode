import { createMemo, createSignal, For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"

const themeCount = Object.keys(DEFAULT_THEMES).length
const themeTip = `使用 {highlight}/theme{/highlight} 或 {highlight}Ctrl+X T{/highlight} 在 ${themeCount} 个内置主题间切换`

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

export function Tips() {
  const theme = useTheme().theme
  const parts = parse(TIPS[Math.floor(Math.random() * TIPS.length)])

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        提示：
      </text>
      <text flexShrink={1}>
        <For each={parts}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS = [
  "输入 {highlight}@{/highlight} 后跟文件名可模糊搜索并附加文件",
  "以 {highlight}!{/highlight} 开头可直接运行 Shell 命令（如 {highlight}!ls -la{/highlight}）",
  "按 {highlight}Tab{/highlight} 在 构建 与 计划 智能体之间切换",
  "使用 {highlight}/undo{/highlight} 撤销上一条消息及文件更改",
  "使用 {highlight}/redo{/highlight} 恢复已撤销的消息和文件更改",
  "运行 {highlight}/share{/highlight} 在 opencode.ai 上生成会话公开链接",
  "将图片拖放到终端以作为上下文",
  "按 {highlight}Ctrl+V{/highlight} 将剪贴板图片粘贴到提示中",
  "按 {highlight}Ctrl+X E{/highlight} 或 {highlight}/editor{/highlight} 在外部编辑器中撰写消息",
  "运行 {highlight}/init{/highlight} 根据代码库自动生成项目规则",
  "运行 {highlight}/models{/highlight} 或 {highlight}Ctrl+X M{/highlight} 查看并切换可用模型",
  themeTip,
  "按 {highlight}Ctrl+X N{/highlight} 或 {highlight}/new{/highlight} 开始新的会话",
  "使用 {highlight}/sessions{/highlight} 或 {highlight}Ctrl+X L{/highlight} 列出并继续之前的会话",
  "运行 {highlight}/compact{/highlight} 在接近上下文上限时压缩长会话",
  "按 {highlight}Ctrl+X X{/highlight} 或 {highlight}/export{/highlight} 将会话保存为 Markdown",
  "按 {highlight}Ctrl+X Y{/highlight} 复制助手的最后一条消息到剪贴板",
  "按 {highlight}Ctrl+P{/highlight} 查看所有可用操作和命令",
  "运行 {highlight}/connect{/highlight} 添加 75+ 支持的 LLM 提供商 API 密钥",
  "前导键为 {highlight}Ctrl+X{/highlight}；与其他键组合可快速操作",
  "按 {highlight}F2{/highlight} 快速切换最近使用的模型",
  "按 {highlight}Ctrl+X B{/highlight} 显示/隐藏侧边栏",
  "使用 {highlight}PageUp{/highlight}/{highlight}PageDown{/highlight} 浏览会话历史",
  "按 {highlight}Ctrl+G{/highlight} 或 {highlight}Home{/highlight} 跳到会话开头",
  "按 {highlight}Ctrl+Alt+G{/highlight} 或 {highlight}End{/highlight} 跳到最新消息",
  "按 {highlight}Shift+Enter{/highlight} 或 {highlight}Ctrl+J{/highlight} 在输入中换行",
  "输入时按 {highlight}Ctrl+C{/highlight} 清空输入框",
  "按 {highlight}Escape{/highlight} 可在 AI 回复中途停止",
  "切换到 {highlight}计划{/highlight} 智能体获取建议而不实际修改",
  "在输入中使用 {highlight}@agent-name{/highlight} 调用专用子智能体",
  "按 {highlight}Ctrl+X Right/Left{/highlight} 在父/子会话间切换",
  "在项目根目录创建 {highlight}opencode.json{/highlight} 以设置项目级配置",
  "将设置放在 {highlight}~/.config/opencode/opencode.json{/highlight} 用于全局配置",
  "在配置中添加 {highlight}$schema{/highlight} 以获得编辑器自动补全",
  "在配置中设置 {highlight}model{/highlight} 以指定默认模型",
  "在配置的 {highlight}keybinds{/highlight} 部分覆盖任意快捷键",
  "将任何快捷键设为 {highlight}none{/highlight} 可完全禁用",
  "在 {highlight}mcp{/highlight} 配置部分设置本地或远程 MCP 服务器",
  "OpenCode 会自动处理需要认证的远程 MCP 服务器 OAuth",
  "将 {highlight}.md{/highlight} 文件放入 {highlight}.opencode/command/{/highlight} 以定义可复用自定义提示",
  "在自定义命令中使用 {highlight}$ARGUMENTS{/highlight}、{highlight}$1{/highlight}、{highlight}$2{/highlight} 传入动态参数",
  "在命令中使用反引号注入 Shell 输出（如 {highlight}`git status`{/highlight}）",
  "将 {highlight}.md{/highlight} 文件放入 {highlight}.opencode/agent/{/highlight} 以定义专用 AI 角色",
  "为每个智能体配置 {highlight}edit{/highlight}、{highlight}bash{/highlight} 和 {highlight}webfetch{/highlight} 工具权限",
  '使用 {highlight}"git *": "allow"{/highlight} 之类模式精细控制 bash 权限',
  '将 {highlight}"rm -rf *": "deny"{/highlight} 用于阻止危险命令',
  '将 {highlight}"git push": "ask"{/highlight} 设为推送前需确认',
  "OpenCode 会使用 prettier、gofmt、ruff 等自动格式化文件",
  '在配置中设 {highlight}"formatter": false{/highlight} 以禁用所有自动格式化',
  "在配置中按文件扩展名定义自定义格式化命令",
  "OpenCode 使用 LSP 服务器进行智能代码分析",
  "在 {highlight}.opencode/tool/{/highlight} 中创建 {highlight}.ts{/highlight} 文件以定义新的 LLM 工具",
  "工具定义可调用 Python、Go 等脚本",
  "将 {highlight}.ts{/highlight} 文件放入 {highlight}.opencode/plugin/{/highlight} 以添加事件钩子",
  "使用插件在会话完成时发送系统通知",
  "创建插件以防止 OpenCode 读取敏感文件",
  "使用 {highlight}opencode run{/highlight} 进行非交互式脚本运行",
  "使用 {highlight}opencode run --continue{/highlight} 继续上一会话",
  "使用 {highlight}opencode run -f file.ts{/highlight} 通过 CLI 附加文件",
  "在脚本中使用 {highlight}--format json{/highlight} 输出机器可读结果",
  "运行 {highlight}opencode serve{/highlight} 以无界面方式访问 OpenCode API",
  "使用 {highlight}opencode run --attach{/highlight} 连接到正在运行的服务器",
  "运行 {highlight}opencode upgrade{/highlight} 升级到最新版本",
  "运行 {highlight}opencode auth list{/highlight} 查看已配置的提供商",
  "运行 {highlight}opencode agent create{/highlight} 进行向导式智能体创建",
  "在 GitHub issue/PR 中使用 {highlight}/opencode{/highlight} 触发 AI 操作",
  "运行 {highlight}opencode github install{/highlight} 配置 GitHub 工作流",
  "在 issue 中评论 {highlight}/opencode fix this{/highlight} 自动创建 PR",
  "在 PR 代码行评论 {highlight}/oc{/highlight} 进行定向代码审查",
  '将 {highlight}"theme": "system"{/highlight} 设为匹配终端颜色',
  "在 {highlight}.opencode/themes/{/highlight} 目录创建 JSON 主题文件",
  "主题支持深色/浅色两种模式",
  "在自定义主题中引用 ANSI 0-255 色值",
  "在配置中使用 {highlight}{env:VAR_NAME}{/highlight} 引用环境变量",
  "使用 {highlight}{file:path}{/highlight} 在配置中引入文件内容",
  "在配置中使用 {highlight}instructions{/highlight} 加载额外规则文件",
  "设置智能体 {highlight}temperature{/highlight}，范围 0.0（专注）到 1.0（创意）",
  "配置 {highlight}maxSteps{/highlight} 限制每次请求的代理迭代次数",
  '设置 {highlight}"tools": {"bash": false}{/highlight} 以禁用特定工具',
  '设置 {highlight}"mcp_*": false{/highlight} 以禁用某个 MCP 服务器的全部工具',
  "在智能体配置中覆盖全局工具设置",
  '设置 {highlight}"share": "auto"{/highlight} 自动分享所有会话',
  '设置 {highlight}"share": "disabled"{/highlight} 禁止任何会话分享',
  "运行 {highlight}/unshare{/highlight} 取消会话公开访问",
  "权限 {highlight}doom_loop{/highlight} 防止工具调用死循环",
  "权限 {highlight}external_directory{/highlight} 保护项目外文件",
  "运行 {highlight}opencode debug config{/highlight} 排查配置问题",
  "使用 {highlight}--print-logs{/highlight} 在 stderr 查看详细日志",
  "按 {highlight}Ctrl+X G{/highlight} 或 {highlight}/timeline{/highlight} 跳转到指定消息",
  "按 {highlight}Ctrl+X H{/highlight} 切换消息中代码块显示",
  "按 {highlight}Ctrl+X S{/highlight} 或 {highlight}/status{/highlight} 查看系统状态",
  "启用 {highlight}tui.scroll_acceleration{/highlight} 获得类似 macOS 的平滑滚动",
  "通过命令面板（{highlight}Ctrl+P{/highlight}）切换聊天中用户名显示",
  "运行 {highlight}docker run -it --rm ghcr.io/anomalyco/opencode{/highlight} 以容器方式使用",
  "使用 {highlight}/connect{/highlight} 连接 OpenCode Zen 获取精选模型",
  "将项目的 {highlight}AGENTS.md{/highlight} 提交到 Git 供团队共享",
  "使用 {highlight}/review{/highlight} 评审未提交的更改、分支或 PR",
  "运行 {highlight}/help{/highlight} 或 {highlight}Ctrl+X H{/highlight} 显示帮助对话框",
  "使用 {highlight}/details{/highlight} 切换工具执行详情显示",
  "使用 {highlight}/rename{/highlight} 重命名当前会话",
  "按 {highlight}Ctrl+Z{/highlight} 挂起终端并返回 Shell",
]

