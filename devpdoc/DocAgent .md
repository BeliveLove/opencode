# Doc Agent（企业内文档工程助手）产品与落地规范（Skills & Tools & Agent）

本文档的目标不是描述一个“能跑的 demo / MVP”，而是从**产品完整性**出发，定义企业内“文档工程助手（Doc Agent）”需要具备的能力模型、数据模型、交互与治理要求，并明确在本仓库（`opencode`）里如何落地为可组合的 `Tool / Skill / Agent`。

原则：
- **宁可把能力写全**，并明确“已实现 / 部分实现 / 计划中”，也不要用“先做 MVP”忽略产品必须项（合规、安全、审计、版本、协作、可追溯、可恢复）。
- **不允许凭空编造文档内容**：涉及导入的真实材料，必须先导入再分析（尤其是 `.docx/.pptx/.xlsx/.pdf`）。

---

## 0. 现状对齐（以本仓库为准，保证“正确性”）

### 0.1 当前已存在的能力（opencode）
- `doc` agent：`packages/opencode/src/agent/prompt/doc.txt`（当前更像“写 README 的文档助手”，缺少文档工程化的治理与工具编排）
- 文档工具：`doc_import` / `doc_convert` / `doc_template_render` / `doc_redact` / `doc_diagram_render` / `doc_version_diff` / `doc_ocr`
- 通用工具：`read/write/edit/patch/grep/glob/bash/...`
  - `read` 支持**图片与 PDF 作为附件**读取，但会将 `.doc/.docx/.xls/.xlsx/.ppt/.pptx` 等视为二进制并拒绝直接读取文本

### 0.2 与“企业文档工程助手”目标的关键差距（Gap）
从产品视角，现状主要缺少：
1. **二进制文档导入与可读抽取**已实现基础版，但仍缺样式保真、批注/修订深度绑定与复杂表格结构化
2. **企业文档模板体系**（PRD/TDD/测试计划/发布说明/会议纪要/制度/合同要点……）与可参数化渲染
3. **文档版本语义**（发布/归档/回滚/差异摘要）与变更可追溯
4. **审阅流程与合规检查**（敏感信息、必填条款、格式规范、风险提示）
5. **安全与治理**（权限边界、审计留痕、脱敏策略、数据边界：哪些可出网、哪些不可）
6. **跨文档联动**（需求→设计→测试→上线）与引用/溯源关系
7. **可观测性与成本**（产出质量指标、调用成本、SLA/失败原因归因）

本文档后续内容将补齐上述产品必须项，并给出在 `opencode` 内可落地的工具/技能/代理接口规范。

---

## 1. 产品定义

### 1.1 产品定位
Doc Agent 是企业内部的**文档工程助手**：把文档生产从“手工写作”升级为可管理的工程流程，核心价值是：
- **可复用**：模板、结构、术语、格式、流程可复用
- **可追溯**：每处变更能定位来源与责任人（至少可产出变更摘要与引用证据）
- **可审计**：关键动作（对外导出/发布/归档/脱敏）可审计
- **可恢复**：可回滚到任意版本（依赖 git 或未来的文档版本工具）
- **合规安全**：敏感信息防泄漏、权限边界明确

### 1.2 目标用户与角色
- 作者：研发 / 产品 / 测试 / 运维 / 行政 / 法务 / HR
- 审核者：技术负责人 / 测试负责人 / 法务 / 合规官
- 管理者：项目经理 / 部门负责人（关注进度、质量、风险）
- 系统管理员：维护模板、规范、权限、留存策略

### 1.3 端到端用户旅程（核心链路）
1) 导入/创建：从模板创建或从 Word/Excel/PPT/PDF 导入  
2) 结构化：生成大纲/章节树/关键字段（需要引用来源）  
3) 生成与编辑：按模板填充内容，保证术语一致与证据可追溯  
4) 质量与合规：敏感信息检查/必填项检查/格式规范化  
5) 审阅与发布：多角色审阅，输出变更摘要，按流程发布/归档  
6) 搜索与复用：可搜索、可复用、可关联上下游文档  

---

## 2. 对象模型（产品数据视角）

> 本仓库当前未实现“文档数据库”，但对象模型用于定义产品语义与未来扩展接口。

- Document：一份文档（源文件/Markdown/导出件）
  - `docId`：稳定标识（建议 ULID/UUID）
  - `title/type/status/confidentiality/owner`
  - `sources[]`：导入来源（文件路径/版本/时间）
- Template：模板
  - `templateId/version/body/variablesSchema`
- Redaction：脱敏结果（用于审计）
  - `kinds/strategy/counts/samples`
- Review：审阅
  - `reviewId/reviewers/checklist/findings/decision`
- Link：跨文档链接
  - `fromDocId/toDocId/type/anchor`

---

## 3. 能力清单（产品必须项）

### 3.1 内容生产能力
- 文档导入：支持 `.md/.txt/.docx/.pptx/.xlsx/.pdf`
- OCR：支持图片/PDF 的 OCR 提取（作为补充输入）
- 结构化与规范化：大纲、章节、表格/列表的最小可用抽取（允许不保真，但要有明确告警）
- 模板库：常用企业文档模板（≥10 类）
- 参数化渲染：基于变量生成可编辑的 Markdown 草稿

### 3.2 治理与安全能力
- 权限边界：读取外部目录必须 ask；对外导出/发布前必须脱敏检查
- 审计与证据：输出报告（命中规则、数量、样例）以便复核
- 不确定性管理：遇到缺信息必须提问，不允许编造

### 3.3 协作与生命周期（接口先行）
- 版本差异摘要（已实现基础）：`doc_version_diff`
- 审阅流转（计划）：`doc.review.*`
- 跨文档关联（计划）：`doc.link.*`
- 导出（计划）：`doc.export`（HTML/PDF/DOCX 等）

---

## 4. 工具规范（Tool Contracts）

### 4.1 `doc_import`（导入与可读抽取）
目标：把“二进制文档”纳入工作流，输出可读文本或附件。

- 输入：
  - `filePath`：文件路径（相对/绝对）
  - `outputFormat`：`text|markdown`
  - `includeSlideNotes`：是否包含 PPTX 讲者备注（可选）
  - `pdfExtract`：是否尝试提取 PDF 文本（可选，失败则回退附件）
  - `pdfMaxPages`：PDF 最大抽取页数（可选）
  - `docxIncludeComments`：是否追加 DOCX 批注（可选）
  - `docxTrackChanges`：是否输出修订标记（可选）
  - `xlsxIncludeFormulas`：是否保留公式文本（可选）
  - `maxChars`：最大输出字符数（用于截断）
- 输出：
  - `output`：提取文本或提示信息
  - `metadata`：`{ type, extractedChars, truncated, warnings[], attached }`
  - `attachments`：仅在 PDF 等场景返回文件附件
- 支持：
  - `.md/.txt`：直接读取文本
  - `.docx`：支持 Markdown 抽取 + 可选批注/修订标记（best-effort）
  - `.pptx`：支持结构化段落/列表抽取（可选讲者备注）
  - `.xlsx`：支持结构化表格抽取（可选公式文本）
  - `.pdf`：默认作为附件返回；可启用 `pdfExtract` 做文本抽取（best-effort）
- 不支持：
  - `.doc/.xls/.ppt`：提示转换为现代格式

状态：**已实现（基础）**（见 `packages/opencode/src/tool/doc/import.ts`）

### 4.2 `doc.redact`（脱敏）
目标：对文本/Markdown 做确定性脱敏，并输出结构化报告以便审计与复核。

- 输入：
  - `text`
  - `kinds`：`email|phone|cn_id|bank_card`
  - `strategy`：`mask|remove`
- 输出：
  - 脱敏后的文本 + YAML 报告（命中数量与样例）

状态：**已实现（基础）**（见 `packages/opencode/src/tool/doc/redact.ts`）
### 4.3 `doc_ocr`（OCR）
目标：对图片或 PDF 做 OCR 提取，作为导入材料补充。

- 输入：
  - `inputPath`
  - `language`：OCR 语言（默认 eng）
  - `languagePath`：自定义语言包路径/URL（可选）
  - `pdfMaxPages` / `pdfScale`：PDF OCR 控制参数
- 输出：
  - YAML 报告 + 提取文本（Markdown 或 plain text）

状态：**已实现（基础）**（见 `packages/opencode/src/tool/doc/ocr.ts`）

### 4.4 `doc.template.render`（模板渲染）
目标：输出企业文档模板（Markdown）供后续编辑/导出，并支持最小的变量替换。

- 输入：
  - `templateId`：如 `tech.prd` / `tech.tdd` / `qa.test_plan`
  - `variables`：键值对（可选）
- 输出：
  - `output`：模板 Markdown
  - `metadata`：`{ templateId, version }`

状态：**已实现（基础）**（见 `packages/opencode/src/tool/doc/template-render.ts`）

### 4.5 计划中的工具（接口定义先行）
- `doc_version_diff`：结构化 diff（按章节/字段），输出变更摘要（已实现基础）
- `doc.review.create|submit|resolve`：审阅流转与意见管理
- `doc.link.upsert|search`：引用关系与溯源
- `doc.export`：导出 HTML/PDF/DOCX（可依赖外部转换器/平台服务）

---

## 5. Skills（方法论/工作流建议）

Skills 是“可复用工作流契约”，由 Agent 编排并调用 Tools：
- `doc-outline`：生成大纲（必须说明信息来源/缺口）
- `doc-fill`：按模板填充正文（要求引用来源或标注待确认）
- `doc-review`：质量/合规检查（输出阻断项/警告项/建议项）
- `doc-diff-summary`：对比两版文档输出变更摘要
- `doc-translate`：术语约束翻译
- `doc-redaction-plan`：对外发布前的脱敏与风险计划

---

## 6. Doc Agent 行为规范（产品级）

Doc Agent 必须做到：
- 默认先问清：文档类型、受众、保密级别、交付格式、截止时间、是否可出网
- 遇到 `.docx/.pptx/.xlsx/.pdf`：必须先调用 `doc_import`，不允许凭空猜测内容
- 遇到扫描件/图片型 PDF：必须先调用 `doc_ocr` 获取文本，再进入写作/审阅
- 对外分享/发布：必须先调用 `doc.redact`，并给出可审计的脱敏摘要
- 输出必须包含：
  - 交付物路径建议（放哪、命名、版本号）
  - 变更摘要（做了什么、为什么）
  - 风险与下一步（需要人工确认的点）

---

## 7. 验收标准（产品正确性与完备性）

- 能导入 `.docx/.pptx/.xlsx` 并抽取可读文本（允许不还原排版，但必须有告警）
- 能对图片/PDF 做 OCR 并输出文本（best-effort）
- 能对文本脱敏并输出报告（命中规则与数量）
- 能输出 ≥10 类常用企业文档模板（可编辑 Markdown）
- Agent 能按规范调用工具（导入优先、脱敏优先、不给编造内容）

---

## 8. 本仓库实现映射（便于开发/测试）

- doc agent prompt：`packages/opencode/src/agent/prompt/doc.txt`
- doc tools：`packages/opencode/src/tool/doc/*`
- tool 注册：`packages/opencode/src/tool/registry.ts`
- tests：`packages/opencode/test/tool/*`
