---
name: novel-summary
description: 章节摘要与卖点提炼（无剧透/含剧透）
---

## Skill：摘要与文案（MVP）

### 目标
为章节或全书输出无剧透/含剧透两版摘要，并提炼卖点 bullets。

### 输入（契约）
- 章节正文或章节列表
- 可选：目标受众、平台风格

### 输出（契约）
- 结构化产物（必需）：`schema: novel.summary.v1`（YAML）

### 输出格式（YAML，必须）
```yml
schema: novel.summary.v1
no_spoiler: "…"
with_spoiler: "…"
selling_points:
  - "…"
```

