---
name: novel-flaw-finder
description: 缺点诊断（逻辑/节奏/动机/视角）并给可执行修复方案
---

## Skill：缺点诊断（MVP）

### 目标
找出章节在结构、逻辑、人物动机、节奏、视角、信息分配方面的问题，并给出最小可执行修复方案。

### 输入（契约）
- 章节正文或章节大纲
- 可选：目标风格/读者预期

### 输出（契约）
- 结构化产物（必需）：`schema: novel.flaws.v1`（YAML）

### 输出格式（YAML，必须）
```yml
schema: novel.flaws.v1
issues:
  - type: "节奏"
    severity: "high"
    evidence: "指出具体段落/场景"
    fix: "最小改动：删/并/改一句/补一段"
```

