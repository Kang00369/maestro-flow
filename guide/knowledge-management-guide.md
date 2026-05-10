# 知识沉淀管理系统

## 设计理念

知识分两种：**约束**和**积累**。约束是编码规范、架构决策、质量规则——规定"不能做什么"。积累是操作步骤、设计资产、调试经验——记录"怎么做过"。前者需要强制加载，后者需要按需检索。

系统建立在三个原则上：

1. **Index-Detail 分离** —— 索引层（Spec）短小精悍、自动注入到 agent 上下文；详情层（Knowhow）完整独立、按需加载。避免上下文膨胀又不丢失细节。
2. **Role-Based 分发** —— 知识按角色（implement、plan、review、test、analyze）标记和分发。plan agent 只看架构约束，implement agent 只看编码规范。各取所需，零噪声。
3. **闭环流转** —— 执行产生知识碎片 → harvest 提取 → 路由到 spec/wiki/issue → 下游命令消费 → 反哺执行。知识不停留在会话里消亡。

---

## 产物结构

```
.workflow/
├── specs/                          # 约束层：角色绑定的规则索引
│   ├── coding-conventions.md       # → implement
│   ├── architecture-constraints.md # → plan
│   ├── quality-rules.md            # → review
│   ├── debug-notes.md              # → analyze
│   ├── test-conventions.md         # → test
│   ├── review-standards.md         # → review
│   ├── learnings.md                # → implement（经验教训）
│   └── tools.md                    # → per-entry（可执行流程定义）
├── knowhow/                        # 积累层：完整知识文档
│   ├── KNW-*.md                    # 会话压缩记录
│   ├── RCP-*.md                    # 操作配方（步骤指南）
│   ├── TPL-*.md                    # 代码/配置模板
│   ├── REF-*.md                    # 外部文档摘要
│   ├── DCS-*.md                    # 架构决策记录
│   ├── TIP-*.md                    # 快速提示
│   ├── AST-*.md                    # 代码资产（API 契约、数据模型）
│   ├── BLP-*.md                    # 架构蓝图
│   └── DOC-*.md                    # 长文档（通用兜底）
└── wiki-index.json                 # 统一索引（WikiIndexer 自动生成）
```

每个 spec 文件对应一个主角色。`spec load --role` 加载主文件全文 + 跨文件中标记了该 role 的条目。

Knowhow 按文件名前缀区分类型，所有类型共享统一的 YAML frontmatter 格式和 WikiEntry 索引体系。

---

## Spec 与 Knowhow 的关系

**Spec 是索引和规则，Knowhow 是详情和过程。** 二者通过 `ref` 属性桥接。

```
Spec（短条目，自动加载）              Knowhow（完整文档，按需加载）
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ <spec-entry ref="...">       │───→│ RCP-oauth-pkce-flow.md       │
│   ### OAuth PKCE Flow        │    │ (20+ steps, code examples)   │
│   Use when implementing      │    └──────────────────────────────┘
│   OAuth for SPA clients.     │
└──────────────────────────────┘
```

### 分工原则

| 层 | 定位 | 内容特征 | 加载方式 |
|---|---|---|---|
| Spec (`specs/`) | 索引 + 规则 | 短条目，<200 字摘要 | 自动注入（hook） |
| Knowhow (`knowhow/`) | 详情文档 | 完整步骤、代码示例 | 按需加载（`wiki load`） |
| ref | 桥接 | spec-entry 指向 knowhow 文件 | spec 展示摘要 + 加载命令 |

### 条目格式

所有 spec 条目使用 `<spec-entry>` 闭合标签：

```markdown
<spec-entry roles="implement,test" keywords="auth,token,rotation" date="2026-04-21">

### Token rotation needs email carried through refresh flow

Revoked column must be set rather than deleting tokens.

</spec-entry>
```

所有 knowhow 文档使用 YAML frontmatter + 可选 `<knowhow-entry>` 容器：

```markdown
---
title: OAuth PKCE Authorization Flow
type: recipe
summary: "Use when implementing OAuth 2.0 login for public clients."
tags: [oauth, pkce, auth]
roles: [implement]
---

## Steps
1. Generate code_verifier ...
```

### 统一索引

WikiIndexer 将 `<spec-entry>` 和 `<knowhow-entry>` 都解析为独立的 WikiEntry 节点，共享 BM25 搜索、backlink 图分析和健康度评分。Sub-entry 继承容器的 roles，entry 级 roles 可覆盖。

---

## 相关命令

### 写入类

| 命令 | 职责 |
|------|------|
| `/spec-add` | 向 specs 文件追加 `<spec-entry>` 条目，支持 inline 和 ref 两种模式 |
| `/manage-knowhow-capture` | 捕获 6 种类型知识文档到 knowhow/（compact、template、recipe、reference、decision、tip） |
| `/maestro-tools-register` | 将可复用业务流程编码为 tool spec（inline 或 ref + knowhow） |
| `/manage-learn` | 捕获原子洞察到 `learnings.md`（pattern、gotcha、technique、tip） |
| `/manage-harvest` | 从工作流产物中提取知识碎片，路由到 wiki/spec/issue 三个存储 |

### 读取类

| 命令 | 职责 |
|------|------|
| `/spec-load` | 按 role 加载主文档 + 跨文件匹配条目；按 keyword 精确过滤 |
| `/maestro-tools-execute` | 加载 tool spec 并逐步执行 |
| `/manage-knowhow` | 跨 workflow knowhow 和 system memory 两个存储做 list/search/view/edit/delete |
| `/manage-wiki` | Wiki 图健康度、搜索、清理、统计 |

### 分析类

| 命令 | 职责 |
|------|------|
| `/wiki-digest` | 语义主题聚类 + 知识覆盖热力图 + gap 分析 |
| `/wiki-connect` | 发现孤立节点和缺失连接，修复图联通性 |
| `/learn-decompose` | 从代码中提取设计模式，写入 spec 和 wiki |
| `/learn-follow` | 引导式阅读代码/wiki，提取 pattern 并构建理解 |

### 初始化

| 命令 | 职责 |
|------|------|
| `/spec-setup` | 扫描项目结构，初始化 specs 骨架文件（8 个种子文件含 `tools.md`） |

---

## Tool Spec 注册与使用时机

Tool Spec 是一种特殊的 spec-entry，存储在 `tools.md` 中，定义**可执行的业务流程**。与普通 spec 条目（被动约束）不同，tool spec 是主动执行的步骤序列。

### 注册时机

通过 `/maestro-tools-register` 注册：

| 阶段 | 场景示例 |
|------|------|
| 规划期间 | 标准化业务流程（支付对账流程、OAuth 集成步骤） |
| 执行之后 | 捕获经过验证的操作步骤（数据库迁移回滚、部署流程） |
| 测试之前 | 注册验证方法给 test agent（E2E 结算流程、API 幂等性验证） |
| 复盘/收割时 | 从产物中提取可复用的流程知识 |

三种注册模式：
- **Extract** —— 从已有代码/文档中提取流程定义
- **Generate** —— 根据描述生成新的流程定义
- **Optimize** —— 改进已存在的 tool spec

### 使用时机

通过 `/maestro-tools-execute` 执行：

- 按名称直接执行：`/maestro-tools-execute integration-test`
- 按角色发现：`/maestro-tools-execute --role test`
- Agent 自动发现：`spec load --role implement` 输出中包含 tools.md 条目

### 格式要求

条目描述首行必须是 **"Use when ..."** 声明使用时机。这是 agent 通过 `spec load` 自动发现时唯一可见的摘要（200 字截断）。

```markdown
<spec-entry roles="implement,test" keywords="payment,idempotency" date="2026-05-10">

### Payment Gateway Idempotency Verification

Use when testing payment integration endpoints for retry safety.

1. Generate idempotency key (UUID v4)
2. Submit charge request with key
3. Retry same request — assert identical response
4. Submit different amount with same key — assert 409
5. Verify webhook delivers exactly once

</spec-entry>
```

---

## Tool Spec 在业务测试中的策略

Tool spec 在测试流程中扮演**验证方法的知识载体**角色。它将业务验证逻辑从测试代码中抽离为可复用的流程定义，使 test agent 无需理解完整业务背景就能执行正确的验证步骤。

### 核心策略

```
业务需求 ──→ 规划阶段注册 tool spec ──→ test agent 自动发现 ──→ 执行验证
                   ↑                                              │
                   └──── 执行后优化 ←── 发现新 edge case ←────────┘
```

**1. 规划阶段预注册验证方法**

在 `/maestro-plan` 阶段，将关键业务流程注册为 tool spec 并标记 `roles="test"`：

```bash
/maestro-tools-register generate E2E checkout flow with payment gateway mock setup --roles test
/maestro-tools-register generate User registration email verification --roles test,implement
```

这使 test agent 在后续 `/quality-auto-test` 执行时，通过 `spec load --role test` 自动获得验证步骤，无需从零推导业务逻辑。

**2. 分层验证覆盖**

不同 role 标记的 tool spec 在测试金字塔的不同层级被消费：

| Tool Spec Role | 测试层级 | 消费场景 |
|---|---|---|
| `roles="test"` | L2 集成测试 | `/quality-auto-test` 自动发现并生成测试场景 |
| `roles="implement,test"` | L1 单元 + L2 集成 | 实现时参照、测试时验证 |
| `roles="review,test"` | L3 验收 | review agent 检查覆盖度、UAT 验证 |

**3. 从测试失败中反哺 Tool Spec**

测试执行发现新的边界条件或失败模式时，通过 optimize 模式补充：

```bash
/maestro-tools-register optimize payment-idempotency
# → 追加新发现的 edge case 步骤（如：网络超时后的重试行为）
```

或通过 `/manage-harvest` 从测试会话产物中自动提取并路由到 tools.md。

**4. UAT 场景驱动**

`/quality-test`（会话式 UAT）执行时，tool spec 提供业务验证的 checklist 骨架：

- Agent 加载 `spec load --role test --keyword <feature>`
- 获取已注册的验证步骤
- 按步骤执行 UAT，逐项确认
- 发现 gap 时追加新条目

**5. Tool Spec 与自动化测试的协作**

```
┌─────────────────────────────────────────────────────────────────┐
│                    /quality-auto-test                            │
│                                                                 │
│  spec load --role test   ──→  发现 tool spec 条目               │
│          │                         │                            │
│          ▼                         ▼                            │
│  scenarios.csv 生成    ←──  tool spec 步骤映射为测试场景         │
│          │                                                      │
│          ▼                                                      │
│  并行写测试 (spawn_agents_on_csv)                               │
│          │                                                      │
│          ▼                                                      │
│  执行 → 失败诊断 → 迭代修复                                     │
│          │                                                      │
│          ▼                                                      │
│  新发现 → /maestro-tools-register optimize                      │
└─────────────────────────────────────────────────────────────────┘
```

关键点：tool spec 不是测试代码本身，而是**验证方法的知识表达**。它告诉 agent "验证什么"和"按什么顺序验证"，agent 据此生成具体的测试实现。

---

## 自动注入机制

知识不需要手动加载。两个 hook 在执行前自动注入相关知识：

### spec-injector（PreToolUse:Agent 触发）

检测 agent 类型 → 映射到 role → 加载对应 spec 主文档 + 跨文件条目 + wiki 摘要。

| Agent 类型 | 映射 Role | 加载内容 |
|---|---|---|
| code-developer, tdd-developer | implement | coding-conventions 全文 + 跨文件 implement 条目 |
| workflow-planner | plan | architecture-constraints 全文 + 跨文件 plan 条目 |
| workflow-reviewer | review | review-standards + quality-rules + 跨文件 review 条目 |
| debug-explore-agent | analyze | debug-notes 全文 + 跨文件 analyze 条目 |

同时加载 role 对应的 wiki 知识摘要（title + summary），受 context budget 控制（full/reduced/minimal/skip）。

### keyword-spec-injector（UserPromptSubmit 触发）

从用户 prompt 提取关键词 → 匹配 `<spec-entry>` 的 keywords 属性 → 注入匹配条目（最多 5 条/次）。

Session 级去重：通过临时 bridge 文件 `{tmpdir}/maestro-spec-kw-{sessionId}.json` 记录已注入内容，三个注入点（用户输入、Agent 启动、Coordinator 分发）共享，同一条目不会重复注入。

---

## 知识流转全景

```
执行产物                    提取                      存储                    消费
─────────                  ─────                    ─────                  ─────
分析会话 ─────┐                              ┌─→ specs/     ─→ spec-injector → agent
调试记录 ─────┼──→ /manage-harvest ──────────┼─→ knowhow/   ─→ wiki load → 按需
规划文档 ─────┤    /quality-retrospective    ├─→ issues/    ─→ manage-issue → 追踪
代码变更 ─────┘    /learn-decompose          └─→ learnings  ─→ keyword-injector → 上下文
                                                    ↑
                                     /manage-learn ─┘  (原子洞察直写)
```

知识从执行中产生，经提取路由到对应存储，再通过自动注入或主动查询反哺后续执行。

### Progressive Fill（渐进充实）

Spec 内容由流水线各阶段逐步丰富：

```
maestro-init       → spec-setup（骨架 + 扫描）
maestro-analyze    → 锁定决策 → plan，代码模式 → implement
maestro-plan       → 设计约定 → implement/plan，测试策略 → test
maestro-execute    → 经验教训 → implement，根因 → analyze
maestro-verify     → 质量发现 → review
```

每个阶段执行完毕，产生的知识自动沉淀到对应的 spec 文件中，下一阶段的 agent 即可通过 role 加载获取前序阶段的积累。
