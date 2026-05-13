# 问题发现指南

Maestro Issue 系统的完整使用手册，涵盖问题发现、管理、闭环全流程。

---

## 一、概述

### Issue 系统的定位

Maestro Issue 系统是独立于 Phase 管线的问题追踪机制。Phase 管线（analyze → plan → execute → verify）用于推进预定义的开发任务，而 Issue 系统用于捕获和管理代码库中发现的问题——无论是安全漏洞、性能瓶颈、可靠性缺陷，还是可维护性隐患。

两者可以独立运行，也可以联动：

- **独立运行**：直接发现和管理 Issue，不影响 Phase 进度
- **联动模式**：Issue 通过 `--gaps` 参数注入 Phase 管线，驱动根因分析和修复

### discover 的角色

`/manage-issue-discover` 是 Issue 系统的入口，负责从代码库中自动发现问题。它提供两种发现模式：

- **多视角全扫描**：8 个专业视角并行分析，全面覆盖代码质量维度
- **Prompt 驱动探索**：围绕用户关注点进行深度定向探索

发现的结果自动去重、生成 Issue 记录，进入 Issue 闭环流程。

---

## 二、manage-issue-discover 详解

### 基本用法

```bash
# 交互选择模式
/manage-issue-discover

# 多视角全扫描
/manage-issue-discover multi-perspective

# Prompt 驱动探索
/manage-issue-discover by-prompt "检查 API 错误处理的完整性"

# 自动模式（跳过确认）
/manage-issue-discover multi-perspective -y

# 指定文件范围
/manage-issue-discover multi-perspective --scope=src/auth/**

# 深度探索（by-prompt 模式）
/manage-issue-discover by-prompt "数据库查询性能" --depth=deep
```

### 参数一览

| 参数 | 说明 | 默认值 |
|------|------|--------|
| _(无参数)_ | 交互模式选择 | — |
| `multi-perspective` | 8 视角并行扫描 | — |
| `by-prompt "..."` | Prompt 驱动探索 | — |
| `-y` / `--yes` | 跳过确认提示 | 需确认 |
| `--scope=<pattern>` | 文件扫描范围 | `**/*` |
| `--depth=standard\|deep` | 探索深度（仅 by-prompt） | `standard` |

---

### 8 视角全扫描模式

全扫描模式启动 8 个专业视角的并行分析，每个视角由独立的 Agent 负责扫描：

#### 视角定义

| 视角 | 关注领域 | 核心问题 |
|------|---------|---------|
| **SECURITY** | 认证、授权、输入校验、密钥管理、注入攻击 | 存在哪些安全漏洞或不安全模式？ |
| **PERFORMANCE** | N+1 查询、无限循环、缺失缓存、内存泄漏、大载荷 | 存在哪些性能瓶颈或低效模式？ |
| **RELIABILITY** | 错误处理、重试逻辑、竞态条件、数据完整性、优雅降级 | 哪些故障模式未处理或可能导致数据丢失？ |
| **MAINTAINABILITY** | 代码重复、紧耦合、缺失抽象、命名不清、死代码 | 什么让代码库更难理解或修改？ |
| **SCALABILITY** | 硬编码限制、单线程瓶颈、有状态假设、Schema 僵化 | 随着负载/数据/用户增长，什么会出问题？ |
| **UX** | 流程混乱、缺失反馈、行为不一致、可访问性空白 | 什么给最终用户造成摩擦或困惑？ |
| **ACCESSIBILITY** | 屏幕阅读器、键盘导航、颜色对比、ARIA 标签、焦点管理 | 存在哪些残障用户的使用障碍？ |
| **COMPLIANCE** | 日志缺失、审计追踪、数据保留、隐私控制、法规要求 | 哪些法规或政策要求未满足？ |

#### 执行流程

全扫描按两批并发执行（每批 4 个 Agent）：

```
Batch 1: security, performance, reliability, maintainability
Batch 2: scalability, ux, accessibility, compliance
```

每个视角的 Agent 会：

1. 扫描指定范围内的源文件
2. 识别问题并记录 `file:line` 证据
3. 评估严重程度（critical / high / medium / low）
4. 建议修复方向

#### 结果去重

所有视角的原始发现会合并去重：

- 按 `file:line` 分组
- 描述相似度 > 80% 的条目合并
- 保留较高严重程度的记录

#### 输出示例

```
Discovery Session: DBP-20260513-143022
Mode: multi-perspective
Raw findings: 47
Unique issues: 31

Per-perspective breakdown:
  SECURITY:        8 → 5 unique
  PERFORMANCE:     7 → 5 unique
  RELIABILITY:     6 → 4 unique
  MAINTAINABILITY: 5 → 4 unique
  SCALABILITY:     5 → 4 unique
  UX:              6 → 4 unique
  ACCESSIBILITY:   5 → 3 unique
  COMPLIANCE:      5 → 2 unique

Severity breakdown:
  critical:  3
  high:      8
  medium:   12
  low:       8

Next steps:
  /manage-issue list --severity critical
  /manage-issue list
  /manage-issue-discover by-prompt "..."
```

---

### by-prompt 模式

Prompt 驱动模式围绕用户的关注点进行深度定向探索，适合针对性排查。

#### 执行流程

1. **分解探索维度**：CLI delegate 将用户 Prompt 分解为 3-5 个可搜索的探索维度，每个维度包含搜索模式、文件模式和发现标准
2. **收集代码上下文**：对每个维度进行语义搜索和模式搜索，收集匹配的代码片段
3. **迭代探索循环**（最多 3 轮）：
   - 第 1 轮：分析上下文，识别问题和覆盖空白
   - 第 2 轮：针对空白优化搜索模式，搜索相邻文件，合并发现
   - 第 3 轮：最终扫荡，覆盖未发现的高严重度模式和跨模块交互
4. **生成 Issue**：去重并创建 Issue 记录

#### 适用场景

- 排查特定功能模块的问题（如 "检查支付流程的可靠性"）
- 针对性安全审计（如 "查找 SQL 注入风险"）
- 代码重构前的依赖分析（如 "分析模块间的耦合关系"）
- 用户报告问题的系统性排查

#### 未指定 Prompt 时的选项

如果 `by-prompt` 后未提供文本，系统会提示选择预设方向：

- Error handling gaps（错误处理空白）
- API contract violations（API 契约违规）
- Test coverage gaps（测试覆盖空白）
- Custom（自定义输入）

---

### 产物路径

每次发现会话都会在 `.workflow/issues/discoveries/{SESSION_ID}/` 下创建完整的产物记录：

| 文件 | 说明 |
|------|------|
| `discovery-state.json` | 会话元数据和进度追踪 |
| `discovery-issues.jsonl` | 本次会话创建的 Issue |
| `{PERSPECTIVE}-findings.json` | 各视角的原始发现（全扫描模式） |
| `exploration-plan.json` | 探索维度定义（by-prompt 模式） |
| `{dimension}-context.md` | 各维度收集的代码上下文 |
| `exploration-log.md` | 逐轮探索日志 |

Session ID 格式：`DBP-{YYYYMMDD}-{HHmmss}`，例如 `DBP-20260513-143022`。

---

### 发现结果如何转为 Issue

发现流程自动完成以下转换：

1. 原始发现按严重程度映射优先级：`critical → 1`、`high → 2`、`medium → 3`、`low → 4`
2. 生成 Issue ID（`ISS-YYYYMMDD-NNN` 格式），扫描现有 Issue 避免冲突
3. 构建完整的 Issue 记录（包含 `context.location`、`fix_direction`、`tags` 等）
4. 同时写入两个位置：
   - `.workflow/issues/issues.jsonl`（全局 Issue 列表）
   - `.workflow/issues/discoveries/{SESSION_ID}/discovery-issues.jsonl`（会话记录）
5. Issue 初始状态为 `registered`，来源标记为 `discovery`

---

## 三、manage-issue 详解

`/manage-issue` 负责 Issue 的完整生命周期管理，支持 6 个子命令。

### 基本用法

```bash
# 创建
/manage-issue create --title "内存泄漏" --severity high

# 列表
/manage-issue list
/manage-issue list --severity critical --status open

# 详情
/manage-issue status ISS-20260513-001

# 更新
/manage-issue update ISS-20260513-001 --status in_progress --priority 1

# 关闭
/manage-issue close ISS-20260513-001 --resolution "已修复内存泄漏"

# 关联任务
/manage-issue link ISS-20260513-001 --task TASK-003
```

---

### 子命令详解

#### create — 创建 Issue

```bash
/manage-issue create --title "标题" [选项]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--title TEXT` | Issue 标题（**必填**，缺失时交互提示） | — |
| `--severity VALUE` | critical / high / medium / low | `medium` |
| `--source VALUE` | planned / supplement / bug / review / verification / discovery / manual | `manual` |
| `--phase VALUE` | Phase 引用，如 `01-auth` | — |
| `--milestone VALUE` | Milestone 引用，如 `MVP`（自动从 `state.json` 推导） | — |
| `--description TEXT` | 详细描述 | 交互提示 |
| `--priority NUMBER` | 1-5，越小优先级越高 | `3` |
| `--tags TAG1,TAG2` | 标签列表 | — |

创建后系统会：

1. 自动生成 ID（`ISS-YYYYMMDD-NNN`，按日期递增编号）
2. 提示补充上下文（背景、复现步骤、关联 Issue）
3. 对 `supplement` 类型 Issue 检查跨 Milestone 冲突

#### list — 列出 Issue

```bash
/manage-issue list [过滤选项]
```

| 选项 | 说明 |
|------|------|
| `--status VALUE` | 按状态过滤：open / in_progress / completed / failed / deferred |
| `--phase VALUE` | 按 Phase 引用过滤 |
| `--milestone VALUE` | 按 Milestone 引用过滤 |
| `--severity VALUE` | 按严重程度过滤 |
| `--source VALUE` | 按来源过滤 |
| `--all` | 包含已关闭的 Issue（从 `issue-history.jsonl` 读取） |

输出按优先级升序、严重程度降序排列。

#### status — 查看 Issue 详情

```bash
/manage-issue status ISS-20260513-001
```

展示完整的 Issue 详情：标题、状态、严重程度、优先级、描述、修复方向、上下文、标签、影响组件、历史记录和反馈。

#### update — 更新 Issue

```bash
/manage-issue update ISS-20260513-001 [字段选项]
```

| 选项 | 说明 |
|------|------|
| `--status VALUE` | 新状态：open / in_progress |
| `--priority NUMBER` | 新优先级：1-5 |
| `--severity VALUE` | 新严重程度 |
| `--tags TAG1,TAG2` | 替换标签 |
| `--add-tag TAG` | 追加标签 |
| `--phase VALUE` | 设置 Phase 引用 |
| `--milestone VALUE` | 设置 Milestone 引用 |
| `--fix-direction TEXT` | 设置修复方向 |
| `--description TEXT` | 更新描述 |
| `--note TEXT` | 添加反馈条目 |

状态变更会自动记录到 `issue_history`。

#### close — 关闭 Issue

```bash
/manage-issue close ISS-20260513-001 --resolution "修复说明" [--status completed]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--resolution TEXT` | 解决方案描述（**必填**） | 交互提示 |
| `--status VALUE` | 最终状态：completed / failed / deferred | `completed` |

关闭操作会将 Issue 从活跃列表移入历史列表。

#### link — 关联 Issue 与 Task

```bash
/manage-issue link ISS-20260513-001 --task TASK-003
```

创建双向关联：

- Issue 的 `affected_components` 中添加 Task ID
- Task 的 `issue_refs` 中添加 Issue ID

---

### issues.jsonl 格式

所有 Issue 以 JSONL（每行一个 JSON 对象）存储，格式基于 `issue.json` 模板：

```json
{
  "id": "ISS-20260513-001",
  "title": "Refresh token 未正确轮换",
  "status": "registered",
  "priority": 1,
  "severity": "critical",
  "source": "discovery",
  "phase_ref": "01-auth",
  "milestone_ref": "MVP",
  "gap_ref": null,
  "description": "Refresh token 在并发请求场景下未正确轮换...",
  "fix_direction": "使用数据库锁确保 token 轮换的原子性",
  "context": {
    "location": "src/auth/token.ts:45",
    "suggested_fix": "引入乐观锁机制...",
    "notes": "Discovered by SECURITY in DBP-20260513-143022"
  },
  "tags": ["SECURITY", "auth"],
  "affected_components": ["src/auth/token.ts"],
  "feedback": [],
  "issue_history": [
    {
      "timestamp": "2026-05-13T14:30:22.000Z",
      "from_status": null,
      "to_status": "registered",
      "actor": "discovery-agent",
      "note": "Issue created"
    }
  ],
  "created_at": "2026-05-13T14:30:22.000Z",
  "updated_at": "2026-05-13T14:30:22.000Z",
  "resolved_at": null,
  "resolution": null
}
```

**存储位置**：

| 文件 | 说明 |
|------|------|
| `.workflow/issues/issues.jsonl` | 活跃 Issue（未关闭） |
| `.workflow/issues/issue-history.jsonl` | 已关闭 Issue（归档） |

---

### 状态流转

Issue 的完整状态生命周期：

```
registered → open → in_progress → completed
                                → failed
                                → deferred
```

| 状态 | 说明 | 典型触发 |
|------|------|---------|
| `registered` | 初始状态，由 discover 创建 | 自动发现 |
| `open` | 确认待处理 | 手动创建或确认发现结果 |
| `in_progress` | 正在处理 | 开始修复 |
| `completed` | 已解决 | 修复完成并验证 |
| `failed` | 处理失败 | 修复尝试失败 |
| `deferred` | 延后处理 | 低优先级或依赖未就绪 |

每次状态变更都会在 `issue_history` 中记录时间戳、前后状态、操作者和备注。

---

## 四、Issue 闭环

### 完整流程

Issue 从发现到关闭的标准闭环：

```
discover → create → analyze → plan → execute → verify → close
```

#### 1. 发现问题

```bash
# 全面扫描
/manage-issue-discover multi-perspective

# 或定向探索
/manage-issue-discover by-prompt "检查认证模块安全性"
```

#### 2. 查看发现结果

```bash
# 按严重程度筛选
/manage-issue list --severity critical

# 查看详情
/manage-issue status ISS-20260513-001
```

#### 3. 根因分析

```bash
# 对单个 Issue 进行根因分析
/maestro-analyze --gaps ISS-20260513-001
```

`--gaps` 参数将 Issue 作为分析目标注入 Phase 管线，生成根因报告和 Gap 记录。

#### 4. 方案规划

```bash
# 基于 Gap 生成修复方案
/maestro-plan --gaps
```

#### 5. 执行修复

```bash
/maestro-execute
```

#### 6. 关闭 Issue

```bash
/manage-issue close ISS-20260513-001 --resolution "通过乐观锁确保 token 轮换原子性"
```

### 快捷路径

对于紧急或简单问题，可以使用 `maestro-quick` 跳过部分步骤：

```bash
# 快速修复
/maestro-quick "修复 token 轮换竞态条件"

# 然后关闭
/manage-issue close ISS-20260513-001 --resolution "已通过 maestro-quick 修复"
```

### 与 roadmap/milestone 的集成

Issue 系统与 Roadmap/Milestone 体系深度集成：

#### Milestone 关联

- 创建 Issue 时通过 `--milestone` 指定所属 Milestone
- 未指定时自动从 `.workflow/state.json` 的 `current_milestone` 推导
- `supplement` 类型 Issue 会自动检查跨 Milestone 文件冲突

#### Phase 关联

- Issue 可通过 `--phase` 关联到具体 Phase
- `--gaps` 参数将 Issue 转化为 Gap 注入 Phase 分析流程
- Phase 执行中发现的 Issue 可通过 `link` 命令双向关联到 Task

#### Roadmap 反馈

Issue 的统计信息（数量、严重程度分布、修复率）可为 Roadmap 规划提供参考：

- 高密度 Issue 的 Phase 可能需要拆分或调整优先级
- 跨 Milestone 的 Issue 需要在规划时预留修复时间
- `supplement` 类型 Issue 可作为下一 Milestone 的需求输入

#### Commander Agent 自动推进

Commander Agent 会自动识别未分析的 Issue 并推进处理，无需手动逐步操作。配合 Hook 自动化，可实现从发现到关闭的全自动闭环。
