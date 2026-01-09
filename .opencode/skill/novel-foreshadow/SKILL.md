---
name: novel-foreshadow
description: 伏笔/承诺追踪与回收对账（挖坑-升级-回收）
---

## Skill：伏笔与承诺回收检查（MVP）

### 目标
基于当前章节与 canon 的 foreshadow 表，输出未回收清单与补写点位。

### 输入（契约）
- 本章正文/大纲（可选）
- canon/foreshadow.yml

### 输出（契约）
- 结构化产物（必需）：`schema: novel.foreshadow.v1`（YAML）

### 输出格式（YAML，必须）
```yml
schema: novel.foreshadow.v1
open_foreshadow: []
unresolved: []
suggested_actions:
  - id: FB_0001_X
    action: "escalate"
    where: "SC_CH_01_003_02"
```

