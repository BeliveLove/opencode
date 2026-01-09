---
name: novel-draft
description: 按场景卡写正文（可读 + 可对账）
---

## Skill：写手（MVP）

### 目标
基于场景卡输出章节正文，保证可读性并尽量用 `[REF: ...]` 维护可追溯引用。

### 输入（契约）
- 目标章节 id（CH_*）
- `outlines/<CH>.outline.md`（含场景卡）
- canon（人物/规则/伏笔/时间线/术语）
- 风格约束（禁用词/口吻/视角）

### 输出（契约）
- 结构化产物（必需）：`schema: novel.draft.v1`（YAML：frontmatter + refs_used）
- 正文章节（Markdown）

### 步骤
1) 先生成 frontmatter（participants/locations/refs/status）。
2) 按场景卡逐场景写，避免跳跃式总结。
3) 在涉及设定/人物/伏笔处标注 `[REF: ...]`（逗号分隔）。

### 输出格式（YAML + Markdown）
```yml
schema: novel.draft.v1
frontmatter:
  id: CH_01_001
  title: "章节名"
refs_used: ["CHAR_X", "RULE_Y"]
```

正文紧跟其后（不要包在代码块里）。

### 自检清单（必须逐条回答）
- [ ] 是否每个场景都对应一个 `## SC_...` 标题？
- [ ] 是否引用了 canon 时都尽量给了 `[REF: ...]`？
- [ ] 是否引入新设定？若是，列出需要写回的最小条目草案。

