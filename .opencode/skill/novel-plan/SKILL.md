---
name: novel-plan
description: 生成章纲与场景卡（结构正确、可对账）
---

## Skill：大纲与节拍（MVP）

### 目标
为指定章节产出章纲与场景卡，明确目标/阻碍/转折/信息投放与伏笔 ID。

### 输入（契约）
- 目标章节 id（CH_*）
- 现有 canon（人物/规则/时间线/伏笔/术语）
- 可选：上一章摘要或上一次对账结论

### 输出（契约）
- 结构化产物（必需）：`schema: novel.plan.v1`（YAML）

### 步骤
1) 明确本章目标与结尾钩子（cliffhanger）。
2) 拆成 3～7 个场景卡，保证“推进 + 信息投放 + 状态变化”至少各 1 次。
3) 每个场景卡必须标注 refs（RULE_/FB_/CHAR_/ORG_/LOC_/ITEM_）。

### 输出格式（YAML，必须）
```yml
schema: novel.plan.v1
chapter_outline:
  - chapter: CH_01_001
    chapter_goal: "本章要达成什么"
    turn: "关键转折"
    cliffhanger: "结尾钩子"
scene_cards:
  - id: SC_CH_01_001_01
    goal: "场景目标"
    obstacle: "主要阻碍"
    turn: "场景转折"
    info_drop: ["RULE_X", "FB_0001_X"]
    state_change:
      - target: CHAR_X
        set: { mood: "..." }
```

### 自检清单（必须逐条回答）
- [ ] 是否每个场景都有明确 goal/obstacle/turn？
- [ ] 是否至少投放 1 条 RULE_ 与 1 条 FB_（可复用已有）？
- [ ] 是否存在“读者必需信息缺失”？若有，指出应在哪个场景补上。

