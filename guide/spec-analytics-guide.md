# Spec 分析系统指南

Maestro Spec 分析系统记录每一次 spec 注入调用、关键词匹配、hook 执行和 CLI 端点使用，提供命中率统计、关键词热力分布和 hook 调用频次等数据，用于持续改进 spec 注入效果。

---

## 目录

- [概览](#概览)
- [日志数据模型](#日志数据模型)
- [采集点](#采集点)
- [CLI 使用](#cli-使用)
- [TUI 面板](#tui-面板)
- [配置](#配置)
- [使用场景](#使用场景)
- [参考](#参考)

---

## 概览

### 解决什么问题

Spec 注入系统在 agent 创建和 prompt 转换时自动注入项目规范，但此前缺乏运行时可观测性：

- 哪些 spec 被命中？哪些从未使用？
- 关键词匹配的准确率如何？是否有大量无效匹配？
- context budget 是否频繁触发降级？
- 哪些 agent type 的注入成功率最低？
- CLI 命令中 `spec load` vs `spec add` 的使用频率如何？
- workflow hook 的调用分布如何？

### 架构

```
┌─────────────────────────────────────────────────┐
│              Spec Analytics Pipeline             │
├─────────────────────────────────────────────────┤
│                                                  │
│  采集层（同步、不抛异常）                          │
│  ┌───────────────┐ ┌──────────────────────┐      │
│  │ spec-injector │ │ keyword-spec-injector│      │
│  │ (PreToolUse)  │ │ (UserPromptSubmit)   │      │
│  └──────┬────────┘ └──────────┬───────────┘      │
│         │                     │                  │
│  ┌──────┴────────┐ ┌──────────┴───────────┐      │
│  │ spec-injection│ │ SpecAnalyticsPlugin   │      │
│  │ -plugin       │ │ (9 workflow hooks)    │      │
│  │ (coordinator) │ │                       │      │
│  └──────┬────────┘ └──────────┬───────────┘      │
│         │                     │                  │
│  ┌──────┴─────────────────────┴───────────┐      │
│  │  CLI 端点追踪 (spec load/list/add/...) │      │
│  └──────────────────┬─────────────────────┘      │
│                     │                            │
│  存储层             ▼                            │
│  ┌──────────────────────────────────────┐        │
│  │ .workflow/analytics/spec-analytics   │        │
│  │ .jsonl (JSONL append-only, 5MB 轮转) │        │
│  └──────────────────┬───────────────────┘        │
│                     │                            │
│  消费层             ▼                            │
│  ┌─────────┐ ┌───────────┐ ┌────────────┐       │
│  │ CLI     │ │ TUI Panel │ │ computeStats│       │
│  │ summary │ │ 5 views   │ │ (pure fn)  │       │
│  └─────────┘ └───────────┘ └────────────┘       │
└─────────────────────────────────────────────────┘
```

### 设计原则

| 原则 | 说明 |
|------|------|
| 同步写入 | 使用 `appendFileSync`，与 hook 热路径兼容 |
| 永不抛异常 | 所有日志函数 try/catch 包裹，分析功能不影响核心注入 |
| 默认开启 | 无需配置即可工作，`analytics.enabled` 默认 `true` |
| Config 缓存 | 30 秒 TTL 缓存，避免每次注入都读配置文件 |
| 自动轮转 | 每 50 次写入检查一次文件大小，超过 5MB 归档 |

---

## 日志数据模型

日志文件 `.workflow/analytics/spec-analytics.jsonl` 包含三种条目类型：

### 注入事件 (`type: "injection"`)

记录每一次 spec 注入调用的完整信息：

```json
{
  "type": "injection",
  "id": "SINJ-1715788800000-1",
  "timestamp": "2026-05-15T12:00:00.000Z",
  "source": "spec-injector",
  "agentType": "code-developer",
  "promptSnippet": "Implement the user authentication...",
  "categories": ["coding", "learning", "ui"],
  "specCount": 12,
  "budgetAction": "full",
  "contentLength": 4520,
  "inject": true,
  "reason": null,
  "matchedKeywords": ["auth", "jwt"],
  "matchedEntryIds": ["entry-001", "entry-002"],
  "matchedEntries": 2,
  "totalPromptKeywords": 15,
  "dedupFilteredCount": 3,
  "inferredCategory": "coding"
}
```

**字段说明：**

| 字段 | 来源 | 用途 |
|------|------|------|
| `source` | 三个注入点之一 | 区分调用来源，分析各系统效率 |
| `agentType` | spec-injector | 分析哪些 agent 触发注入 |
| `promptSnippet` | keyword-injector / plugin | 前 300 字符，用于分析匹配质量 |
| `categories` | 解析结果 | 分析 category 使用分布 |
| `specCount` | 加载结果 | 分析注入量是否合理 |
| `budgetAction` | context-budget | 分析 context 压力 |
| `contentLength` | 注入内容 | 分析注入体积 |
| `inject` | 最终决策 | 计算命中率 |
| `reason` | 失败原因 | 诊断注入失败的根因 |
| `matchedKeywords` | keyword-injector | 分析关键词匹配效果 |
| `matchedEntryIds` | keyword-injector | 追踪具体匹配的 entry |
| `totalPromptKeywords` | keyword-injector | 分析 prompt 关键词提取效率 |
| `dedupFilteredCount` | keyword-injector | 分析 session dedup 效果 |
| `inferredCategory` | spec-injection-plugin | 分析 coordinator 的启发式推断准确率 |

**失败原因 (`reason`) 枚举：**

| reason | 含义 | 改进方向 |
|--------|------|---------|
| `no-categories` | agent type 无 category 映射 | 考虑添加映射到 `AGENT_CATEGORY_MAP` 或 config |
| `no-content` | 所有 category 的 spec 内容为空 | 检查 spec 文件是否有实质内容 |
| `budget-skip` | context budget 不足，跳过注入 | 减少注入量或增加 `maxContentLength` |
| `no-prompt-keywords` | prompt 未提取到有效关键词 | 检查 stop words 配置 |
| `empty-keyword-index` | 项目无 keyword 索引 | 为 spec entry 添加 `keywords` 属性 |
| `no-keyword-match` | 关键词未命中任何 entry | 扩展 entry 的 `keywords` 覆盖面 |
| `all-deduped` | 所有匹配已在本 session 注入过 | 正常现象（session dedup 生效） |

### CLI 事件 (`type: "cli"`)

记录每一次 `maestro spec` 子命令调用：

```json
{
  "type": "cli",
  "id": "CLI-1715788800000-2",
  "timestamp": "2026-05-15T12:00:01.000Z",
  "command": "spec load",
  "args": { "category": "coding", "scope": "project" }
}
```

**追踪的命令：**

`spec load` · `spec list` · `spec init` · `spec status` · `spec add` · `spec injection show` · `spec injection agent` · `spec injection category` · `spec injection always` · `spec injection filter` · `spec injection preview` · `spec analytics`

### Hook 事件 (`type: "hook"`)

记录两类 hook 调用：

**1. 子进程 Hook（Claude Code / Codex）**

每次 `maestro hooks run <name>` 执行时自动记录：

```json
{
  "type": "hook",
  "id": "HOOK-1715788800000-3",
  "timestamp": "2026-05-15T12:00:02.000Z",
  "hookName": "spec-injector",
  "pluginName": "subprocess",
  "outcome": "success",
  "durationMs": 45,
  "data": { "event": "PreToolUse", "matcher": "Agent", "level": "minimal" }
}
```

**追踪的子进程 Hook（11 个）：**

| Hook | 事件 | 级别 |
|------|------|------|
| `spec-injector` | PreToolUse [Agent] | minimal |
| `keyword-spec-injector` | UserPromptSubmit | standard |
| `skill-context` | UserPromptSubmit | standard |
| `session-context` | Notification | standard |
| `delegate-monitor` | PostToolUse [Bash\|Agent] | standard |
| `team-monitor` | Stop | standard |
| `telemetry` | Stop | standard |
| `coordinator-tracker` | Stop | standard |
| `preflight-guard` | PreToolUse [Bash\|Write\|Edit\|Agent] | standard |
| `spec-validator` | PreToolUse [Write\|Edit] | standard |
| `workflow-guard` | PreToolUse [Bash\|Write\|Edit] | full |

**2. Coordinator Hook（进程内插件）**

`maestro coordinate` 运行时由 `SpecAnalyticsPlugin` 记录：

```json
{
  "type": "hook",
  "id": "HOOK-1715788800000-4",
  "timestamp": "2026-05-15T12:00:02.000Z",
  "hookName": "afterCommand",
  "pluginName": "specAnalytics",
  "nodeId": "node-execute-1",
  "outcome": null,
  "durationMs": null,
  "data": { "cmd": "gemini", "success": true }
}
```

**追踪的 Coordinator Hook（9 个）：**

| Hook | 触发时机 | 记录的 data |
|------|---------|-------------|
| `beforeRun` | 工作流启动前 | sessionId, graphId, intent |
| `afterRun` | 工作流完成后 | sessionId, status |
| `beforeNode` | 进入节点前 | nodeType |
| `afterNode` | 离开节点后 | outcome |
| `beforeCommand` | 执行命令前 | cmd |
| `afterCommand` | 命令完成后 | cmd, success |
| `onError` | 发生错误时 | error message |
| `transformPrompt` | prompt 转换时 | promptLength |
| `onDecision` | 决策节点解析时 | target |

---

## 采集点

### 1. spec-injector（PreToolUse:Agent hook）

文件：`src/hooks/spec-injector.ts` → `evaluateSpecInjection()`

在 4 个 return 路径插入 `logInjectionEvent`：

```
evaluateSpecInjection(agentType, projectPath, ...)
  ├─ categories 为空 → log(inject:false, reason:"no-categories")
  ├─ sections 为空   → log(inject:false, reason:"no-content")
  ├─ budget skip     → log(inject:false, reason:"budget-skip")
  └─ 成功注入        → log(inject:true, agentType, categories, specCount, budgetAction)
```

### 2. keyword-spec-injector（UserPromptSubmit hook）

文件：`src/hooks/keyword-spec-injector.ts` → `evaluateKeywordInjection()`

在 5 个 return 路径插入 `logInjectionEvent`，额外记录：
- `promptSnippet`：prompt 前 300 字符
- `matchedKeywords`：命中的关键词列表
- `matchedEntryIds`：命中的 entry ID
- `totalPromptKeywords`：prompt 提取的关键词总数
- `dedupFilteredCount`：session dedup 过滤的数量

### 3. spec-injection-plugin（Coordinator transformPrompt hook）

文件：`src/hooks/plugins/spec-injection-plugin.ts`

在 `transformPrompt` tap handler 中记录：
- `inferredCategory`：启发式推断的 category（用于分析准确率）
- `promptSnippet`：coordinator prompt 前 300 字符

### 4. SpecAnalyticsPlugin（Coordinator 全部 9 hooks）

文件：`src/hooks/plugins/spec-analytics-plugin.ts`

注册为 coordinator 插件（与 TelemetryPlugin、DecisionLogPlugin 并列），追踪所有 workflow hook 的调用信息。

注册位置：`src/commands/coordinate.ts`

### 5. 子进程 Hook 追踪

文件：`src/commands/hooks.ts` → `hooks run <name>` action handler

在每个子进程 hook 执行前后自动记录：
- `hookName`：hook 名称（如 `spec-injector`、`workflow-guard`）
- `pluginName`：固定为 `"subprocess"`（区别于 coordinator 的 `"specAnalytics"`）
- `outcome`：`"success"` 或 `"error"`
- `durationMs`：执行耗时
- `data`：hook 定义信息（event, matcher, level）

### 6. CLI 端点追踪

文件：`src/commands/spec.ts`

在每个子命令 action handler 开头调用 `logCliEndpoint`，记录命令名和参数。

---

## CLI 使用

### 查看统计摘要

```bash
maestro spec analytics
```

输出示例：

```
Spec Injection Analytics
========================

  Total injections:    247
  Successful:          198 (80.2%)
  Failed:               49 (19.8%)

  By Source:
    spec-injector                    142 (88.0% hit)
    keyword-spec-injector             67 (70.1% hit)
    spec-injection-plugin             38 (84.2% hit)

  By Agent/Category:
    code-developer                    85 (91.8% hit)
    tdd-developer                     32 (87.5% hit)
    general                           45 (75.6% hit)

  Budget Actions:
    full: 165  reduced: 28  minimal: 5  skip: 0

  Top Keywords:
    typescript (23)  react (18)  testing (15)  auth (12)  api (10)
    Avg matched/prompt: 2.3  Dedup filtered: 47

  Hook Invocations:
    afterCommand: 89  afterNode: 67  beforeCommand: 89  transformPrompt: 38
    Avg duration: 1.2ms

  CLI Endpoints:
    spec load: 89  spec list: 34  spec add: 12  spec status: 8

  Log: 856.3 KB | 498 entries | 2026-05-01 ~ 2026-05-15
```

### 查看最近事件

```bash
# 最近 30 条事件
maestro spec analytics --recent 30

# JSON 格式
maestro spec analytics --recent 30 --json
```

输出示例：

```
Recent Events (last 30):

  12:03:21  ✓ injector           code-developer        12 specs
  12:03:18  ✗ keyword-injector   (unknown)              0 specs (no-keyword-match)
  12:03:15  CLI  spec load                  {"category":"coding","scope":"project"}
  12:02:50  HOOK afterCommand              node:exec-1
  12:02:48  ✓ injection-plugin   coding                 8 specs kw:[react,hooks]
```

### JSON 格式输出

```bash
# 统计摘要 JSON
maestro spec analytics --json

# 最近事件 JSON
maestro spec analytics --recent 50 --json
```

### 归档日志

```bash
# 将当前日志归档到 .workflow/analytics/archive/
maestro spec analytics --clear
```

### 打开 TUI 面板

```bash
maestro spec analytics --tui
# 或
maestro config  # 切到 Analytics tab
```

---

## Hook 专用分析端点

`maestro hooks analytics` 提供独立的 hook 维度分析，支持按 hook 名称过滤：

### 查看 Hook 统计摘要

```bash
maestro hooks analytics
```

输出示例：

```
Hook Analytics
==============

  Total invocations:   342
  Avg duration:        12.3ms

  By Type:
    Subprocess (Claude Code / Codex)     285
    Coordinator (in-process)              57

  By Hook:
    Hook                         Total  Errors   Err%   Avg ms
    ────────────────────────────  ─────  ──────  ─────  ───────
    spec-injector                   89       0   0.0%     45.2
    keyword-spec-injector           67       2   3.0%     18.7
    skill-context                   45       0   0.0%      8.3
    delegate-monitor                34       0   0.0%      5.1
    afterCommand                    28       0   0.0%        —
    beforeCommand                   28       0   0.0%        —
    workflow-guard                  15       1   6.7%     12.4
    coordinator-tracker             12       0   0.0%      3.8
    ...

  Log: 856.3 KB | 2026-05-01 ~ 2026-05-15
```

### 查看最近 Hook 事件

```bash
# 最近 30 条 hook 事件
maestro hooks analytics --recent 30

# 只看特定 hook
maestro hooks analytics --recent 50 --hook spec-injector

# JSON 格式
maestro hooks analytics --recent 30 --json
```

输出示例：

```
Recent Hook Events (last 30):

  12:03:21  success [SUB] spec-injector            45ms {"event":"PreToolUse","matcher":"Agent","level":"minimal"}
  12:03:18  success [SUB] keyword-spec-injector    18ms {"event":"UserPromptSubmit","level":"standard"}
  12:02:50  success [CRD] afterCommand                  node:exec-1 {"cmd":"gemini","success":true}
  12:02:48  error   [SUB] workflow-guard            2ms {"event":"PreToolUse","matcher":"Bash|Write|Edit","level":"full"}
```

说明：`[SUB]` = 子进程 hook，`[CRD]` = coordinator hook

### JSON 格式

```bash
maestro hooks analytics --json
```

返回结构化统计，包含 `byHook`（每个 hook 的 total/errors/errorRate/avgDurationMs）和 `byPlugin`。

### 过滤特定 Hook

```bash
# 只分析 spec-injector 的调用
maestro hooks analytics --hook spec-injector

# 只看 workflow-guard 的最近事件
maestro hooks analytics --recent 20 --hook workflow-guard
```

---

## TUI 面板

通过 `maestro config` → **Analytics** tab 或 `maestro spec analytics --tui` 进入。

### 5 个视图模式

| 按键 | 模式 | 内容 |
|------|------|------|
| `s` | Summary | 总览：命中率、source/category/budget 分布、hook 统计 |
| `r` | Recent | 最近 100 条事件列表，光标导航，`Enter` 展开详情 |
| `k` | Keywords | 关键词命中排行榜（柱状图）、平均匹配数、dedup 统计 |
| `a` | Agents | Agent 类型维度：每种 agent 的注入成功率表格 |
| `h` | Hooks | Hook 调用频次（柱状图）、plugin 分布、平均耗时 |

### 操作方式

| 按键 | 功能 |
|------|------|
| `s` / `r` / `k` / `a` / `h` | 切换视图 |
| `↑` / `↓` | 列表导航 |
| `Enter` | 展开/折叠事件详情 |
| `q` / `Esc` | 返回 |

### Summary 视图

显示聚合统计卡片：
- 总注入数、成功数、失败数、命中率（颜色编码：>=80% 绿色，>=50% 黄色，<50% 红色）
- 按 source 分组的命中率
- Budget action 分布
- Category 使用频次
- Hook 调用总数
- CLI 端点使用频次
- 日志文件大小和时间范围

### Recent 视图

最近事件的滚动列表：
- 注入事件：时间 + ✓/✗ + source + agent + spec 数量 + 关键词
- CLI 事件：时间 + CLI + 命令 + 参数
- Hook 事件：时间 + HOOK + hook 名 + nodeId
- `Enter` 展开详情：完整 ID、promptSnippet、categories、budget、matched entries 等

### Keywords 视图

关键词分析：
- 总匹配数、平均每次 prompt 匹配数、dedup 过滤总量
- Top 20 关键词排行（柱状图可视化）

### Agents 视图

Agent 类型分析表格：

```
Agent/Category              Total   Hit   Miss     Rate
code-developer                 85    78      7   91.8%
tdd-developer                  32    28      4   87.5%
general                        45    34     11   75.6%
workflow-planner               12    12      0  100.0%
```

### Hooks 视图

Hook 调用分析：
- 总调用次数、平均耗时
- 按 hook 名称排序的柱状图
- 按 plugin 分组统计

---

## 配置

配置存储在 `.workflow/config.json` → `specInjection.analytics`：

```json
{
  "specInjection": {
    "analytics": {
      "enabled": true,
      "logPath": ".workflow/analytics/spec-analytics.jsonl",
      "maxFileSize": 5242880,
      "retentionWeeks": 4
    }
  }
}
```

### 字段说明

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `true` | 是否启用分析日志记录 |
| `logPath` | `.workflow/analytics/spec-analytics.jsonl` | 日志文件路径（相对项目根） |
| `maxFileSize` | `5242880` (5MB) | 文件超过此大小时自动归档轮转 |
| `retentionWeeks` | `4` | 归档保留周数 |

### 关闭分析

```json
{
  "specInjection": {
    "analytics": {
      "enabled": false
    }
  }
}
```

设置 `enabled: false` 后，所有 `logInjectionEvent` / `logCliEndpoint` / `logHookInvocation` 调用立即返回，零开销。

### 日志轮转

- 每 50 次写入检查一次文件大小
- 超过 `maxFileSize` 时归档到 `.workflow/analytics/archive/`
- 归档文件名：`spec-analytics-2026W20.jsonl`（ISO 周编号）
- `maestro spec analytics --clear` 手动触发归档

---

## 使用场景

### 场景 1：分析关键词匹配效果

```bash
# 查看关键词统计
maestro spec analytics --json | jq '.keywordStats'

# 或 TUI 中按 k 查看关键词热力图
maestro spec analytics --tui
```

发现 `avgMatchedPerPrompt` 过低（<1.0），说明 spec entry 的 `keywords` 属性覆盖不够，需要扩展。

### 场景 2：诊断注入失败

```bash
# 查看最近的失败事件
maestro spec analytics --recent 50 | grep "✗"
```

常见原因和解决方案：
- `no-categories`：为该 agent type 添加 category 映射
- `no-keyword-match`：扩展 spec entry 的 keywords
- `budget-skip`：减少注入量或增大 `maxContentLength`
- `all-deduped`：正常现象（同一 session 不重复注入）

### 场景 3：评估 inferredCategory 准确率

```bash
# 过滤 coordinator plugin 的事件
maestro spec analytics --recent 100 --json | \
  jq '[.[] | select(.source == "spec-injection-plugin")] | 
      group_by(.inferredCategory) | 
      map({category: .[0].inferredCategory, count: length, hitRate: ([.[] | select(.inject)] | length / length * 100)})'
```

如果某个 category 的命中率持续偏低，考虑调整 `inferCategory()` 的正则模式。

### 场景 4：追踪 CLI 使用习惯

```bash
maestro spec analytics --json | jq '.cliStats'
```

输出：
```json
{
  "spec load": 89,
  "spec list": 34,
  "spec add": 12,
  "spec injection preview": 8,
  "spec analytics": 5
}
```

### 场景 5：监控 hook 系统健康

```bash
# Hook 专用分析
maestro hooks analytics

# 查看 spec-injector 的历史执行耗时
maestro hooks analytics --hook spec-injector --json | jq '.byHook["spec-injector"].avgDurationMs'

# 查看错误率高的 hook
maestro hooks analytics --json | jq '[.byHook | to_entries[] | select(.value.errorRate > 0)] | sort_by(-.value.errorRate)'

# TUI 中按 h 查看 hook 分布
maestro spec analytics --tui
```

如果 `onError` / `workflow-guard` 错误率频繁，说明工作流执行出错较多，需要排查。

### 场景 6：分析 Hook 执行性能

```bash
# 最近 50 条 hook 事件，含耗时
maestro hooks analytics --recent 50

# 只看耗时较长的 hook（>100ms）
maestro hooks analytics --recent 200 --json | \
  jq '[.[] | select(.durationMs > 100)] | sort_by(-.durationMs) | .[:10]'
```

---

## 参考

| 文件 | 作用 |
|------|------|
| `src/hooks/spec-analytics.ts` | 核心模块：类型定义、日志写入、统计聚合 |
| `src/hooks/plugins/spec-analytics-plugin.ts` | Coordinator hook 追踪插件（9 hooks） |
| `src/hooks/spec-injector.ts` | 注入埋点：`evaluateSpecInjection()` 4 个 return 路径 |
| `src/hooks/keyword-spec-injector.ts` | 关键词埋点：`evaluateKeywordInjection()` 5 个 return 路径 |
| `src/hooks/plugins/spec-injection-plugin.ts` | Plugin 埋点：`transformPrompt` handler |
| `src/commands/spec.ts` | CLI 追踪 + `spec analytics` 子命令 |
| `src/commands/hooks.ts` | 子进程 hook 追踪 + `hooks analytics` 子命令 |
| `src/commands/coordinate.ts` | Coordinator 插件注册位置 |
| `src/tui/config-ui/SpecAnalyticsPanel.tsx` | TUI 5 视图分析面板 |
| `src/tui/config-ui/ConfigHub.tsx` | Analytics tab 集成 |
| `src/utils/jsonl-log.ts` | 底层 JSONL 读写工具 |
| `src/types/index.ts` | `SpecAnalyticsConfig` 类型定义 |
| `src/config/index.ts` | `loadAnalyticsConfig()` / `saveAnalyticsConfig()` |
| `.workflow/analytics/spec-analytics.jsonl` | 日志文件存储位置 |
