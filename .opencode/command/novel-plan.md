---
description: 生成章纲+场景卡并写入 outlines/
---

先调用 `skill` 工具加载 `novel-plan`，并严格按技能契约输出。

目标章节（必须是 CH_*）：

$ARGUMENTS

执行步骤：

1) 读取 `canon/` 相关文件作为上下文（用 `novel.fs.read`）。
2) 按技能要求输出结构化 `chapter_outline` 与 `scene_cards`（YAML）。
3) 将结果写入 `outlines/<CH>.outline.md`（用 `novel.fs.write`，`mode=overwrite`）。

约束：

- 场景卡必须使用 `SC_<章节ID>_<序号>`。
- 必须明确列出每个场景的信息投放（refs：RULE_/FB_/CHAR_/ORG_/LOC_/ITEM_）。

