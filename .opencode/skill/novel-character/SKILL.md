---
name: novel-character
description: 人物卡与动机/关系梳理（含口吻约束）
---

## Skill：人物卡与动机（MVP）

### 目标
基于现有文本/设定生成或校正人物卡，并产出可写回 canon 的条目草案与关系边。

### 输入（契约）
- 当前章节/大纲/设定（至少其一）
- 可选：已有 canon/characters.yml

### 输出（契约）
- 结构化产物（必需）：`schema: novel.character.v1`（YAML）

### 输出格式（YAML，必须）
```yml
schema: novel.character.v1
characters: []
relations: []
voice_rules:
  - id: CHAR_X
    catchphrases: []
    taboo: []
```

