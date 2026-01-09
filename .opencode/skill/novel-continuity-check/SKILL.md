---
name: novel-continuity-check
description: 一致性对账（人物/时间线/设定/伏笔）并给最小修复方案
---

## Skill：Continuity / Canon 对账（MVP）

### 目标
发现设定冲突、时间线冲突、人物动机漂移、伏笔状态机问题，并输出最小可执行修复方案。

### 输入（契约）
- 目标章节正文（含 frontmatter 与 `[REF: ...]`）
- canon（characters/rules/timeline/foreshadow）

### 输出（契约）
- 结构化产物（必需）：`schema: novel.check.v1`（YAML：issues + fixes）

### 步骤
1) 校验引用：所有 `[REF: ...]` 必须可在 canon 中找到。
2) 校验时间线：同一时间锚点不处于互斥地点/状态。
3) 校验人物：口癖/禁用词/动机是否明显冲突。
4) 伏笔状态：planted → escalated → paid_off，不允许跳跃。
5) 产出“最小修复方案”：改哪一句/补哪段/延期到哪章（必须可执行）。

### 输出格式（YAML，必须）
```yml
schema: novel.check.v1
issues:
  - code: MISSING_REF
    severity: error
    message: "引用不存在：RULE_X"
fixes:
  - issue: MISSING_REF
    minimal_change: "在 canon/rules.yml 新增 RULE_X 条目草案；或删掉正文引用并改写该段。"
```

