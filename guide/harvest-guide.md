# 知识回收指南

Maestro 知识回收系统将执行过程中产生的知识碎片从"会话临时文件"转化为"持久可检索的项目资产"。

---

## 一、概述

### 知识闭环

知识回收是 Maestro 知识闭环的核心环节：

```
执行产物 → harvest 提取 → 路由分发 → 持久存储 → 下游消费
   ↑                                                  ↓
   └──────────── 反哺新一轮执行 ←──────────────────────┘
```

闭环的三个阶段：

| 阶段 | 动作 | 对应命令 |
|------|------|----------|
| **Extract** | 从 workflow 产物中提取知识碎片 | `/manage-harvest` |
| **Route** | 按分类自动路由到 wiki / spec / issue | harvest 内部分类引擎 |
| **Persist** | 写入持久存储，供后续命令消费 | wiki / spec / issue 基础设施 |

### 三大知识存储

| 存储 | 路径 | 存什么 | 谁消费 |
|------|------|--------|--------|
| **Wiki** | `.workflow/wiki/` | 观察发现、通用洞察、知识图谱 | `/wiki-connect`、`/wiki-digest` |
| **Spec** | `.workflow/specs/` | 编码规范、架构决策、模式规则 | `/spec-load`、Hook 自动注入 |
| **Issue** | `.workflow/issues/issues.jsonl` | 未解决的 bug、风险、待办 | `/manage-issue`、`/maestro-analyze --gaps` |

### 与 knowhow 的关系

Harvest 提取的碎片路由到 wiki/spec/issue。Knowhow（`.workflow/knowhow/`）是独立的完整知识文档系统，由 `/manage-knowhow-capture` 主动创建，二者互补：

- **Harvest**：被动回收——从已有产物中自动提取
- **Knowhow**：主动捕获——人工或 agent 按需录入

---

## 二、manage-harvest 详解

### 命令语法

```bash
/manage-harvest                                      # 扫描所有产物，交互选择
/manage-harvest <session-id>                         # 回收指定会话
/manage-harvest <path>                               # 回收指定目录
/manage-harvest --recent 7                           # 只看最近 7 天
/manage-harvest --source analysis                    # 只回收分析产物
/manage-harvest <target> --to wiki                   # 强制全部路由到 wiki
/manage-harvest <target> --dry-run                   # 预览，不写入
```

### 三种模式

| 模式 | 触发条件 | 行为 |
|------|----------|------|
| **scan** | 无参数 | 扫描全部 Source Registry，列出可回收产物，交互选择 |
| **session** | 传入 session ID（如 `ANL-auth-20260410`、`WFS-xxx`） | 精确定位指定会话的产物 |
| **path** | 传入文件路径（如 `.workflow/.analysis/ANL-auth-20260410/`） | 从指定目录加载并提取 |

### Source Registry

Harvest 扫描以下 8 类产物源：

| Source Type | 扫描路径 | 关键文件 | ID 模式 |
|-------------|----------|----------|---------|
| `analysis` | `.workflow/.analysis/ANL-*/` | `conclusions.json`、`*.md` | `ANL-*` |
| `brainstorm` | `.workflow/scratch/brainstorm-*/` | `guidance-specification.md` | 目录名 |
| `lite-plan` | `.workflow/.lite-plan/*/` | `plan.json`、`plan-overview.md` | 目录名 |
| `lite-fix` | `.workflow/.lite-fix/*/` | `fix-plan.json` | 目录名 |
| `debug` | `.workflow/.debug/*/` | `debug-log.md`、`hypothesis-*.md` | 目录名 |
| `scratchpad` | `.workflow/.scratchpad/` | `*.md`、`*.json` | 文件名 |
| `session` | `.workflow/active/WFS-*/` | `workflow-session.json` | `WFS-*` |
| `knowhow` | `.workflow/knowhow/` | `*.md`、`digest-*.md` | 文件名 |

用 `--source <type>` 限制只扫描某一类，`--source all` 扫描全部（默认）。

### 提取与分类

每种产物源有专门的提取模式：

| 产物源 | 提取什么 |
|--------|----------|
| analysis | findings（发现）、recommendations（建议）、risks（风险） |
| brainstorm | options（方案）、decision（决策）、trade-offs（权衡）、action items（待办） |
| lite-plan | tasks 的 rationale（决策）、dependencies（约束）、risks（风险） |
| lite-fix | root_cause（根因）、fix_strategy（修复策略）、verification（验证方式） |
| debug | 最终诊断、已验证假设、被否决假设及理由 |
| scratchpad | markdown 章节、带说明的代码块 |
| session | completed_tasks、key_decisions、deferred_items |

每个碎片被打上 category 标签，并赋予 confidence 分数（0.0-1.0）。`--min-confidence N`（默认 0.5）过滤低质量碎片。

### 路由分类规则

| Category | 默认路由 | 理由 |
|----------|----------|------|
| `finding` | wiki (note) | 观察发现归入知识图谱 |
| `decision` | wiki (spec) 或 spec (decision) | 架构决策 → spec ADR 或 wiki spec 条目 |
| `pattern` | spec (pattern) | 可复用代码模式 → 编码规范 |
| `bug` | issue 或 spec (bug) | 活跃 bug → issue；已修复 bug → spec 经验 |
| `risk` | issue | 未缓解风险 → 可追踪 issue |
| `task` | issue | 未完成工作 → 可追踪 issue |
| `knowhow` | wiki (knowhow) | 可泛化洞察 → wiki 知识 |
| `recommendation` | wiki (note) 或 issue | 可执行建议 → issue；信息性建议 → wiki |

用 `--to wiki|spec|issue` 强制覆盖自动分类。`--to auto`（默认）使用上述规则。

### 去重逻辑

写入前检查四级去重，保证幂等性：

1. **harvest-log.jsonl**：按 `fragment_id`（`HRV-{8 hex}`）查重
2. **wiki**：按标题搜索
3. **issues.jsonl**：按标题/描述匹配
4. **specs/learnings.md**：按内容匹配

重复碎片标记 `[SKIP-DUP]` 并记入 harvest report。

### 产物

| 产物 | 路径 | 说明 |
|------|------|------|
| harvest log | `.workflow/harvest/harvest-log.jsonl` | 每个路由项的溯源记录 |
| harvest report | `.workflow/harvest/harvest-report-{date}.md` | 本次回收的完整报告 |
| wiki entries | `.workflow/wiki/` | 路由到 wiki 的条目 |
| spec entries | `.workflow/specs/` | 路由到 spec 的条目 |
| issue entries | `.workflow/issues/issues.jsonl` | 路由到 issue 的条目 |

### 使用场景

**场景 1：阶段性知识回收**

一个里程碑完成，回收所有分析、调试、规划产物中的知识：

```bash
/manage-harvest --recent 14            # 回收最近两周产物
/manage-harvest --to wiki --dry-run    # 先预览全部路由到 wiki 的效果
```

**场景 2：精确回收某个分析会话**

```bash
/manage-harvest ANL-auth-20260410      # 回收指定分析会话
```

**场景 3：回收调试产物中的 bug 模式**

```bash
/manage-harvest --source debug         # 只回收调试产物
```

### 后续动作

回收完成后，命令会提示后续路由：

```bash
# 查看 wiki 条目
maestro wiki list --type note

# 连接知识图谱
/wiki-connect --fix

# 分类 issue
/manage-issue list --source harvest

# 查看 spec
/spec-load --role implement
```

---

## 三、manage-knowhow 详解

### 命令语法

```bash
/manage-knowhow                                  # 列出全部（默认）
/manage-knowhow list                             # 列出全部
/manage-knowhow search "认证流程"                  # 全文搜索
/manage-knowhow view KNW-20260510-1430           # 查看指定条目
/manage-knowhow edit MEMORY.md                   # 编辑系统记忆
/manage-knowhow delete TIP-20260510-0900         # 删除（需确认）
/manage-knowhow prune --tag deprecated --before 2026-04-01  # 批量清理
```

### 双存储架构

| 存储 | 路径 | 格式 | 索引 |
|------|------|------|------|
| **workflow** | `.workflow/knowhow/` | `{PREFIX}-*.md` | `.workflow/wiki-index.json`（WikiIndexer） |
| **system** | `~/.claude/projects/{project}/memory/` | `MEMORY.md` + topic `.md` 文件 | 无（平铺文件） |

Workflow 存储面向项目内知识，system 存储面向跨会话持久记忆。命令自动根据 ID 前缀（`KNW-*`、`TIP-*` 等）或文件名判断操作哪个存储。

### 子命令

| 子命令 | 用途 | 备注 |
|--------|------|------|
| `list` | 列出两个存储的所有条目 | 支持 `--tag`、`--type`、`--store` 过滤 |
| `search <query>` | 全文搜索，两个存储一起搜 | 按相关度排序 |
| `view <id\|file>` | 查看条目全文 | 自动识别存储 |
| `edit <file>` | 编辑系统记忆文件 | 只能编辑 system 存储 |
| `delete <id\|file>` | 删除条目（需确认） | `MEMORY.md` 受保护，不可删除 |
| `prune` | 批量清理 workflow 条目 | 需要至少一个过滤条件 |

### 过滤标志

| 标志 | 用途 |
|------|------|
| `--store workflow\|system\|all` | 目标存储（默认 `all`） |
| `--tag <tag>` | 按标签过滤 |
| `--type compact\|tip` | 按条目类型过滤 |
| `--before <YYYY-MM-DD>` | 日期上限 |
| `--after <YYYY-MM-DD>` | 日期下限 |
| `--dry-run` | 预览破坏性操作 |
| `--confirm` | 跳过确认提示 |

### 9 种 Knowhow 类型

| Type | Prefix | 用途 | 典型场景 |
|------|--------|------|----------|
| `session` | `KNW-` | 会话状态恢复 | 复杂任务结束、上下文切换前保存进度 |
| `template` | `TPL-` | 代码/配置模板 | 提取通用代码模式、保存样板代码 |
| `recipe` | `RCP-` | 分步操作指南 | 文档化操作流程、onboarding |
| `reference` | `REF-` | 外部文档摘要 | 导入 API 文档、保存 URL 总结 |
| `decision` | `DCS-` | 架构决策记录 | 非平凡的设计选择 |
| `tip` | `TIP-` | 快速提示 | 灵光一现、调试技巧 |
| `asset` | `AST-` | 代码资产 | API 契约、数据模型、prompt |
| `blueprint` | `BLP-` | 架构蓝图 | 模块架构设计 |
| `document` | `DOC-` | 通用文档 | 通用兜底类型 |

所有类型共享 `WikiNodeType = 'knowhow'`，通过 `type` 字段区分子类型。

---

## 四、manage-knowhow-capture 详解

### 命令语法

```bash
/manage-knowhow-capture compact "认证模块开发进度"       # 会话压缩
/manage-knowhow-capture template                       # 交互式录入模板
/manage-knowhow-capture recipe "部署流程"                # 操作配方
/manage-knowhow-capture reference --source https://...  # 外部文档摘要
/manage-knowhow-capture decision                       # 架构决策记录
/manage-knowhow-capture tip "TypeScript 泛型推断陷阱"    # 快速提示
/manage-knowhow-capture                                # 交互选择（9 种类型）
```

### 捕获时机和触发条件

| 时机 | 推荐类型 | 说明 |
|------|----------|------|
| 复杂任务结束 | `compact` / `session` | 保存完整上下文，下次可恢复 |
| 发现可复用代码模式 | `template` | 提取为模板，避免重复编写 |
| 完成一个操作流程 | `recipe` | 记录步骤，团队成员可复用 |
| 查阅重要外部文档 | `reference` | 保存摘要，避免反复查原文 |
| 做出架构决策 | `decision` | 记录背景、方案对比、理由 |
| 闪现灵感或技巧 | `tip` | 随手记，避免遗忘 |
| 定义接口契约 | `asset` | 保存 API 契约、数据模型 |
| 设计模块架构 | `blueprint` | 记录架构设计和关联代码路径 |

### 产物路径和命名规则

文件写入 `.workflow/knowhow/`，命名格式：

```
{PREFIX}-{YYYYMMDD}-{HHMM}.md
```

示例：`KNW-20260513-1430.md`、`TPL-20260513-1500.md`

每个文件带 YAML frontmatter：

```yaml
---
title: "描述性标题"
type: template          # 类型
category: coding        # spec category（coding/arch/test/debug/review/learning）
created: "2026-05-13T14:30:00+08:00"
tags: [typescript, auth]
lang: typescript        # 仅 template 需要
source: "https://..."   # 仅 reference 需要
status: accepted        # 仅 decision 需要
---
```

### 类型路由

命令支持中英文 token 自动识别类型：

| Token | 类型 |
|-------|------|
| `compact`、`session`、`压缩`、`保存` | session |
| `template`、`tpl`、`模板` | template |
| `recipe`、`rcp`、`配方`、`步骤` | recipe |
| `reference`、`ref`、`参考`、`引用` | reference |
| `decision`、`dcs`、`决策`、`adr` | decision |
| `tip`、`note`、`记录`、`快速` | tip |
| `asset`、`ast`、`资产`、`契约` | asset |
| `blueprint`、`blp`、`蓝图` | blueprint |
| `document`、`doc`、`文档` | document |

### 各类型内容结构

**session（KNW-）**：从当前对话自动提取——会话 ID、目标、执行计划（verbatim）、工作文件、决策表、约束、依赖、已知问题、变更列表、待办。

**template（TPL-）**：需要语言标记、参数表、代码块（copy-paste ready）、依赖列表。

**recipe（RCP-）**：目标、前置条件、编号步骤、预期结果、常见陷阱。

**reference（REF-）**：来源 URL、关键要点、适用场景、快速示例。支持 `--source` 直接从 URL 提取。

**decision（DCS-）**：背景、方案对比表（至少 2 个被否决方案）、理由、后果（正面和负面）。

**tip（TIP-）**：最简结构——标题 + 内容 + 自动检测上下文。

---

## 五、知识流转全景

### 完整流程

```
┌─────────────────────────────────────────────────────────┐
│                     执行阶段                             │
│  maestro-analyze → maestro-plan → maestro-execute       │
│       ↓              ↓                ↓                 │
│   ANL-xxx/       plan-xxx/       code changes           │
│   brainstorm/    lite-plan/      debug-log/             │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                  知识回收                                │
│  /manage-harvest                                        │
│  ├── Stage 1-2: 发现产物                                │
│  ├── Stage 3:   提取碎片（category + confidence）        │
│  ├── Stage 4:   分类路由（auto / forced）                │
│  ├── Stage 5:   预览确认                                │
│  ├── Stage 6:   写入目标存储 + 去重                      │
│  └── Stage 7-8: 去重检查 + 生成报告                      │
└────┬──────────┬──────────┬──────────────────────────────┘
     │          │          │
     ▼          ▼          ▼
  ┌──────┐  ┌──────┐  ┌────────┐
  │ Wiki │  │ Spec │  │ Issue  │
  └──┬───┘  └──┬───┘  └───┬────┘
     │         │          │
     ▼         ▼          ▼
┌─────────────────────────────────────────────────────────┐
│                   下游消费                                │
│  wiki-connect / wiki-digest / spec-load / manage-issue   │
│  Hook 自动注入 / maestro-plan --gaps                     │
└─────────────────────────────────────────────────────────┘
```

### 主动知识捕获并行路径

```
执行过程 → /manage-knowhow-capture → .workflow/knowhow/ → wiki-index.json → 检索复用
                                              ↓
                              maestro knowhow search "关键词"
                              /manage-knowhow search "关键词"
```

### 与 learn-* 命令的协作

`learn-*` 系列命令是知识闭环的另一个入口，它们在回顾和反思阶段产生学习洞察：

| 命令 | 产出 | 路由到 |
|------|------|--------|
| `/learn-retro` | git 活动回顾、决策回顾 | `specs/learnings.md`（`<spec-entry>`） |
| `/learn-decompose` | 任务分解经验 | knowhow（recipe） |
| `/learn-investigate` | 调查过程记录 | knowhow（reference / tip） |
| `/learn-follow` | 跟进学习记录 | knowhow（reference） |
| `/learn-second-opinion` | 多视角分析结果 | wiki / spec |

`quality-retrospective` 也会将 Phase 回顾中的洞察写入 `specs/learnings.md`，这些条目后续可被 harvest 再次发现并路由。

### 推荐工作流

**日常开发**

```
/maestro-execute → 完成后随手记 → /manage-knowhow-capture tip "发现的技巧"
```

**里程碑结束**

```
/manage-harvest --recent 30          # 回收所有产物
/manage-knowhow-capture compact      # 保存当前会话状态
/wiki-connect --fix                  # 连接知识图谱
```

**项目交接**

```
/manage-knowhow list                 # 查看全部知识条目
/manage-knowhow search "核心概念"     # 搜索关键知识
/spec-load --role implement          # 加载实现规范
```
