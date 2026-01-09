---
name: novel-idea
description: 生成题材/设定草案（结构化 + 可写回）
---

## Skill：点子/设定生成（MVP）

### 目标
基于题材约束生成可落地的小说设定草案，并产出可写回 canon 的结构化条目草案。

### 输入（契约）
- 用户给出的题材/一句话梗概/关键禁忌/目标受众
- 可选：现有 `novel/canon/*.yml`（若有，优先对齐而非重造同名设定）

### 输出（契约）
- 结构化产物（必需）：`schema: novel.idea.v1`（YAML）
- 自然语言说明（可选）

### 步骤
1) 提炼题材约束（世界观类型、主冲突、情绪基调、禁用项）。
2) 生成 1 个明确 premise + 3 条核心卖点。
3) 给出最小可跑通 canon 草案：人物/势力/规则/事件/伏笔/术语（允许空数组）。
4) 给出写作风险与降级建议（最多 5 条）。

### 输出格式（YAML，必须）
```yml
schema: novel.idea.v1
premise: "一句话前提"
tone: ["关键词1", "关键词2"]
taboo: ["禁忌1", "禁忌2"]
selling_points:
  - "卖点1"
canon_drafts:
  characters: []
  factions: []
  rules: []
  timeline: []
  foreshadow: []
  glossary: []
```

### 自检清单（必须逐条回答）
- [ ] 是否引入新设定/新人物？若是，是否在 `canon_drafts` 中给出条目草案？
- [ ] 是否有任何内容违反 taboo？若有，已删除或替换？
- [ ] 是否能在不新增模块的前提下写出第一章？若不能，列出最小补齐提问（≤3）？

