# 质量管线指南

Maestro 质量管线的完整参考，覆盖从代码审查到阶段复盘的七条命令及其闭环流转。

---

## 一、概述

质量管线是 Phase 执行后的验证与改进体系。七条命令围绕 **"审查 -> 测试 -> 调试 -> 重构 -> 复盘"** 闭环组织，每条命令都有明确的输入产物、输出产物和下一步路由：

| 命令 | 定位 | 核心问题 | 产物 ID |
|------|------|---------|---------|
| `quality-review` | 分层代码审查 | 代码质量是否达标？ | `REV-{NNN}` |
| `quality-test` | 会话式 UAT | 用户视角是否正常？ | `TST-{NNN}` |
| `quality-auto-test` | 统一自动测试 | 覆盖率和回归是否通过？ | `TST-{NNN}` |
| `quality-debug` | 假设驱动调试 | 根因是什么？ | `DBG-{NNN}` |
| `quality-refactor` | 反思驱动重构 | 技术债是否收敛？ | `WBR-{NNN}` |
| `quality-sync` | 文档同步 | 文档与代码是否一致？ | -- |
| `quality-retrospective` | 阶段复盘 | 可复用的洞察是什么？ | `INS-{8hex}` |

**核心设计原则：**

- **产物驱动**：每条命令在 `.workflow/scratch/` 下生成结构化产物（JSON + Markdown），后续命令可消费前置产物
- **自动路由**：命令完成时根据结果自动推荐下一步命令，形成闭环
- **会话持久**：`quality-test`、`quality-debug`、`quality-auto-test` 的会话状态可跨上下文重置恢复
- **知识回流**：`quality-retrospective` 将洞察路由到 spec、issue、knowhow 系统，避免重复犯错

---

## 二、命令详解

### 2.1 quality-review -- 分层代码审查

多维度代码审查命令，回答"代码质量如何"，与 `maestro-verify`（目标是否达成）和 `quality-test`（用户视角是否正常）互补。

#### 调用方式

```bash
/quality-review <phase> [--level quick|standard|deep] [--dimensions security,architecture,...] [--skip-specs]
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `<phase>` | 必填，Phase 编号或 slug |
| `--level` | 审查级别：`quick`（快速）/ `standard`（标准）/ `deep`（深度），默认自动检测 |
| `--dimensions` | 逗号分隔的审查维度，覆盖级别默认值 |
| `--skip-specs` | 跳过加载项目 spec 作为审查上下文 |

#### 三级审查机制

- **Quick**：少量文件的内联审查，适用于小改动
- **Standard**：中等规模，使用并行 Agent 按维度审查，自动触发 deep-dive
- **Deep**：大规模变更，强制 deep-dive 迭代，多轮聚合

审查级别默认根据变更文件数量自动检测，也可通过 `--level` 显式指定。

#### 产物路径与格式

```
.workflow/scratch/{YYYYMMDD}-review-P{N}-{slug}/
  review.json          # findings, severity distribution, verdict
```

审查结果包含三级裁定（verdict）：

| Verdict | 含义 | 下一步路由 |
|---------|------|-----------|
| `PASS` | 所有维度通过 | `/quality-test {phase}` |
| `WARN` | 存在非关键问题，可继续 | `/quality-test {phase}`（附带警告） |
| `BLOCK` | 存在关键问题，必须修复 | `/maestro-plan {phase} --gaps` |

#### 上下文消费

`quality-review` 自动加载同 Phase 的前置产物：

- **execute** 产物：`.summaries/`、`.task/`、`verification.json`（审查的代码来源）
- **review** 产物：`review.json`（增量比较，避免重复审查）
- **debug** 产物：`understanding.md`、`evidence.ndjson`（已确认的根因，作为审查线索）
- **test** 产物：`uat.md`、`.tests/`（用户侧发现的问题）

#### 注册产物

命令完成后在 `state.json.artifacts[]` 中注册：

```json
{
  "id": "REV-001",
  "type": "review",
  "milestone": "<current>",
  "phase": "<target>",
  "scope": "phase",
  "path": "scratch/{YYYYMMDD}-review-P{N}-{slug}",
  "status": "completed",
  "depends_on": "<execute_artifact_id>"
}
```

---

### 2.2 quality-test -- 会话式 UAT

用户验收测试命令，从验证标准中提取测试场景，以交互式一问一答的方式逐个执行，记录通过/失败结果并自动推断严重性。

#### 调用方式

```bash
/quality-test [phase] [--smoke] [--auto-fix]
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `[phase]` | 可选，Phase 编号 |
| `--smoke` | 在 UAT 前注入基础冒烟测试 |
| `--auto-fix` | 自动触发 gap-fix 循环（verify -> plan --gaps -> execute -> re-verify，最多 2 轮） |

#### 会话式测试流程

1. **场景生成**：从 `verification.json` 提取验证标准，生成测试场景
2. **来源整合**：合并 spec 工具步骤（`source: "tool"`）、review 发现（`source: "review_finding"`）、debug 根因（`source: "debug_root_cause"`）
3. **逐场景交互**：每次展示一个场景的期望行为，用户以自然语言反馈
4. **严重性推断**：从用户的自然语言自动推断为 blocker/major/minor/cosmetic，不会主动询问
5. **自动诊断**：发现问题时，按 gap cluster 派生并行 debug Agent 诊断根因
6. **Gap-fix 闭环**：`--auto-fix` 模式下自动走 plan -> execute -> re-verify 循环
7. **置信度评分**：4 维因子模型评估 UAT 置信度，压力测试（pass rate > 80% 时触发）

#### 产物路径

```
.workflow/scratch/{YYYYMMDD}-test-P{N}-{slug}/
  uat.md               # UAT 会话记录（可跨上下文恢复）
  test-plan.json       # 测试计划
  test-results.json    # 测试结果
  coverage-report.json # 覆盖率报告
```

#### 注册产物

```json
{
  "id": "TST-001",
  "type": "test",
  "status": "issues == 0 ? 'completed' : 'failed'",
  "depends_on": "<execute_artifact_id>"
}
```

#### 下一步路由

| 条件 | 下一步 |
|------|--------|
| 全部通过 | `/maestro-milestone-audit` |
| `--auto-fix` 成功 | `/maestro-verify {phase}` |
| `--auto-fix` 后仍有问题 | `/quality-debug --from-uat {phase}` |
| 手动修复需要 | `/quality-debug --from-uat {phase}` |
| 覆盖率不足 | `/quality-auto-test {phase}` |
| 需要集成测试 | `/quality-auto-test {phase}` |

---

### 2.3 quality-auto-test -- 统一自动测试

自动生成并执行测试的统一管线，智能路由到最佳场景来源（spec/覆盖缺口/代码探索），通过 CSV 并行引擎高效写入和诊断。

#### 调用方式

```bash
/quality-auto-test <phase> [-y] [-c N] [--max-iter <N>] [--layer <L0-L3>] [--strategy <name>] [--dry-run] [--re-run]
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `<phase>` | 必填，Phase 编号 |
| `--max-iter N` | 最大外层迭代次数（默认 5），设为 1 则单次生成 |
| `--layer L` | 指定起始/限制层（L0/L1/L2/L3） |
| `--dry-run` | 只生成测试计划，不执行 |
| `--re-run` | 只重跑之前失败/阻塞的场景 |
| `-y` | 跳过确认 |

#### 智能路由

命令自动检测项目状态，选择最佳场景来源：

| 优先级 | 条件 | 路由 |
|--------|------|------|
| 1 | 存在活跃会话 | 恢复会话 |
| 2 | `--re-run` + 之前有失败 | 重跑失败场景 |
| 3 | 存在 Spec 包（REQ-*.md） | spec 路由 |
| 4 | 存在 Nyquist 覆盖缺口 | gap 路由 |
| 5 | 默认 | code 路由 |

#### 测试层级与并行

- **层级波浪**：L0 -> L1 -> L2 -> L3 顺序执行，关键层 fail-fast
- **CSV 并行写入**：每个 Agent 独立写入一个测试文件（`spawn_agents_on_csv`）
- **CSV 并行诊断**：失败场景通过 CSV 分发到并行 Agent 分类和修复
- **双层迭代引擎**：内层（test_defect 修复，每层最多 3 次）+ 外层（策略调整）

#### 产物路径

```
.workflow/scratch/{YYYYMMDD}-auto-test-P{N}-{slug}/
  test-plan.json       # 测试计划
  scenarios.csv        # 场景管线
  report.json          # 测试报告（含置信度）
  state.json           # 会话状态（可恢复）
  reflection-log.md    # 迭代反思日志
  discoveries.ndjson   # 跨 Agent 共享发现（append-only）
  traceability.md      # 需求追溯矩阵（spec 路由时）
```

#### 下一步路由

| 条件 | 下一步 |
|------|--------|
| 收敛（>=95%） | `/maestro-verify {phase}` |
| 所有需求验证通过（spec 路由） | `/maestro-milestone-audit` |
| 发现 Bug | `/quality-debug --from-uat {phase}` |
| 最大迭代，>80% | `/quality-test {phase}`（手动 UAT） |
| 最大迭代，<80% | `/quality-debug {phase}` |
| 覆盖率仍低 | `/quality-auto-test {phase} --layer {missing}` |
| 单次生成全通过 | `/quality-test {phase}` |

---

### 2.4 quality-debug -- 假设驱动调试

科学方法驱动的调试命令，通过并行假设生成、隔离验证和根因确认来定位问题。支持三种入口模式和结构化证据收集。

#### 调用方式

```bash
/quality-debug [issue description] [--from-uat <phase>] [--parallel]
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `[issue description]` | 独立模式：问题描述 |
| `--from-uat <phase>` | UAT 模式：从 Phase 的 uat.md 读取 gap 作为预填症状 |
| `--parallel` | 并行模式：每个 gap cluster 一个 Agent |

#### 三种入口模式

| 模式 | 触发方式 | 症状来源 |
|------|---------|---------|
| 独立 | 直接提供问题描述 | 交互收集 |
| UAT 衔接 | `--from-uat` | 从 `uat.md` 的 gap 加载 |
| 并行 | `--parallel` | 每个 gap cluster 独立 Agent |

#### 调试循环

```
症状收集 -> 假设生成 -> 隔离验证 -> 根因确认
    ^                                    |
    |          (未确认时继续)              |
    +------------------------------------+
```

- **假设生成**：从 review findings、prior debug 结论中提取调查方向
- **隔离验证**：每个假设在独立 Agent 中验证
- **证据收集**：所有证据以结构化 NDJSON 格式记录
- **多因子置信度**：每个 gap 计算多因子置信度分数（非简单高/中/低）
- **就绪门控**：在声明 ROOT CAUSE 前必须通过就绪门控检查
- **压力测试**：确认假设后执行压力测试

#### 产物路径与格式

```
.workflow/scratch/{YYYYMMDD}-debug-P{N}-{slug}/
  understanding.md      # 逐 cluster 演进的认知追踪
  evidence.ndjson       # 结构化 NDJSON 证据条目
```

`evidence.ndjson` 格式示例：

```json
{"ts": "2026-05-13T14:30:00Z", "hypothesis": "H1", "action": "check_log", "result": "confirmed", "evidence": "Error log shows null ref at line 42"}
{"ts": "2026-05-13T14:31:00Z", "hypothesis": "H1", "action": "trace_code", "result": "confirmed", "evidence": "Input not validated before use"}
```

#### 知识回流

调试完成后，系统会根据情况提议知识持久化：

| 条件 | 提问 | 路由目标 |
|------|------|---------|
| 根因模式重复出现 | "记录到 debug-notes.md？" | `spec-add debug` |
| 修复方案不显然 | "记录为 learning？" | `spec-add learning` |
| 根因 = 架构边界违反 | "更新 architecture-constraints.md？" | `spec-add arch` |

#### 下一步路由

| 条件 | 下一步 |
|------|--------|
| 根因已找到，需要修复 | `/maestro-plan {phase} --gaps` |
| 根因已找到（UAT 衔接），自动修复 | `/quality-test {phase} --auto-fix` |
| 结论不明确 | `/quality-debug {issue}`（恢复会话） |
| 独立模式，修复已应用 | `/maestro-verify {phase}` |

---

### 2.5 quality-refactor -- 反思驱动重构

以反思驱动的方式计划和执行重构，通过分析、规划和迭代三轮保障零回归。每轮重构在 `reflection-log.md` 中记录策略、结果和调整。

#### 调用方式

```bash
/quality-refactor [<scope>]
```

#### 参数说明

| scope | 说明 |
|-------|------|
| 模块路径（`src/auth`） | 指定目录 |
| 功能区域（`authentication`） | 概念范围 |
| `all` | 全量代码库扫描 |
| 不提供 | 提示用户输入 |

#### 反思维度与迭代机制

每轮重构包含三个阶段：

1. **分析**：识别受影响文件和依赖关系，加载 coding spec 和 review spec 作为质量门控
2. **规划**：创建重构计划，用户确认后执行
3. **反思**：每轮修改后运行测试验证，记录策略和结果到 `reflection-log.md`，根据结果调整下一轮策略

**安全保证**：每次修改后立即运行测试，确保零回归。

#### 产物路径

```
.workflow/scratch/{YYYYMMDD}-refactor-{scope}/
  reflection-log.md     # 策略、结果、调整记录
```

#### 下一步路由

| 条件 | 下一步 |
|------|--------|
| 所有测试通过 | `/quality-sync`（更新文档） |
| 测试失败 | `/quality-debug {scope}` |
| 无测试套件 | `/quality-auto-test {phase}` |

---

### 2.6 quality-sync -- 文档同步

代码变更后的文档同步命令，通过 git diff 检测变更，经 `doc-index.json` 追踪影响链路（file -> component -> feature -> requirement），更新受影响的 `.workflow/codebase/` 文档。

#### 调用方式

```bash
/quality-sync [--full] [--since <commit|HEAD~N>] [--dry-run]
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `--full` | 完整重同步所有追踪文件（忽略 git diff，重建所有文档） |
| `--since <commit>` | 从指定 commit 开始 diff（默认：上次同步时间戳） |
| `--dry-run` | 只展示将要更新的内容，不写入 |

#### 同步机制

1. **变更检测**：通过 `git diff` 识别自上次同步以来的变更文件
2. **影响追踪**：经 `doc-index.json` 追踪每个文件的 component -> feature -> requirement 影响链
3. **文档更新**：刷新受影响的 `.workflow/codebase/` 文档
4. **状态同步**：更新 `state.json` 的同步时间戳和 `index.json` 的文件状态

#### 产物路径

无独立产物目录，直接更新以下文件：

- `.workflow/state.json` -- 同步时间戳
- `.workflow/codebase/` -- 受影响的文档
- `.workflow/doc-index.json` -- 文件状态
- `.workflow/project.md` -- Tech Stack 段（如依赖清单变更）

#### 下一步路由

| 条件 | 下一步 |
|------|--------|
| 文档已刷新 | `/manage-status` |
| 检测到重大结构变更 | `/manage-codebase-rebuild`（完整重建） |

---

### 2.7 quality-retrospective -- 阶段复盘

多视角阶段复盘命令，消费现有执行产物（verification.json、review.json、issues.jsonl、plan.json 等），通过 4 个并行 lens 提炼可复用洞察，并自动路由到 spec、issue、knowhow 系统。

#### 调用方式

```bash
/quality-retrospective [phase|N..M] [--lens technical|process|quality|decision] [--all] [--no-route] [--compare N] [-y]
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `[phase]` | 单个 Phase 复盘 |
| `[N..M]` | Phase 范围复盘 |
| `--lens <name>` | 只运行指定 lens（technical/process/quality/decision） |
| `--all` | 复盘所有已完成但未复盘的 Phase |
| `--no-route` | 只分析不路由（不创建 spec/issue/note） |
| `--compare N` | 与指定 Phase 的复盘结果做差异对比 |
| `-y` | 跳过确认 |

#### 四个并行 Lens

| Lens | 视角 | 关注点 |
|------|------|--------|
| **Technical** | 技术实现 | 架构决策、代码质量、性能模式 |
| **Process** | 流程效率 | 执行效率、阻塞因素、协作模式 |
| **Quality** | 质量指标 | Bug 密度、覆盖率、review 发现分布 |
| **Decision** | 决策评估 | 关键决策及其结果、替代方案评估 |

4 个 lens 以并行 Agent 方式运行（每个 lens 一个 Agent），结果汇总后提炼洞察。

#### Insight 路由机制

每个洞察自动路由到最适合的存储：

| 路由目标 | 条件 | 路径 |
|---------|------|------|
| Spec stub | 可复用模式/约束 | `.workflow/specs/{category}.md`（`<spec-entry>` 格式） |
| Issue | 反复出现的 gap | `issues.jsonl`（符合 canonical schema） |
| Knowhow tip | 流程笔记/提醒 | `manage-learn tip` |
| Learnings（始终） | 所有洞察 | `.workflow/knowhow/specs/learnings.md`（`<spec-entry>` 格式） |

**稳定 ID**：每个洞察使用 `INS-{8hex}` 格式（`hash(phase_num + lens + title)`），重跑不会重复创建。

#### 产物路径与格式

```
.workflow/scratch/{YYYYMMDD}-retro-P{N}-{slug}/
  retrospective.json    # 完整复盘数据（metrics, findings_by_lens, distilled_insights, routing_recommendations）
  retrospective.md      # 人类可读报告（指标表格、per-lens 发现、洞察、路由表）
```

#### 与知识闭环的集成

复盘是知识回流的核心入口：

1. **Spec 系统**：可复用的编码模式、架构约束自动追加为 `<spec-entry>`
2. **Issue 系统**：反复出现的质量缺口创建为规范 issue（status: "open"，完整 issue_history）
3. **Knowhow 系统**：流程笔记通过 `manage-learn tip` 写入持久记忆
4. **Learnings 聚合**：所有洞察统一写入 `learnings.md`，支持跨 Phase 查询

#### 下一步路由

| 条件 | 下一步 |
|------|--------|
| 复盘完成 | `/manage-status` 查看状态 |
| 有路由 issue | `/manage-issue list --source retrospective` 分类处理 |
| 浏览知识库 | `/manage-learn list` |

---

## 三、质量闭环

### 命令流转关系

七条命令形成三层闭环：

```
                    ┌──────────────────────────────────────────┐
                    │           Phase 执行完成                  │
                    └──────────────┬───────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────┐
              ┌─────┤        quality-review (审查)              │
              │     └──────────────┬───────────────────────────┘
              │ BLOCK              │ PASS/WARN
              ▼                    ▼
    ┌─────────────────┐  ┌────────────────────────────────────┐
    │ maestro-plan     │  │     quality-test / quality-auto-test │
    │ --gaps (修复)    │  │            (测试)                    │
    └────────┬────────┘  └──────────────┬─────────────────────┘
             │                          │
             │ 执行修复                  │ 发现问题
             ▼                          ▼
    ┌─────────────────┐      ┌──────────────────────┐
    │ maestro-execute  │◄─────┤   quality-debug       │
    └────────┬────────┘ 调试  │   (调试)              │
             │                └──────────┬───────────┘
             │ 根因找到                  │
             ▼                           │
    ┌─────────────────┐                  │
    │ 重跑测试循环     │◄─────────────────┘
    └────────┬────────┘
             │ 全部通过
             ▼
    ┌──────────────────────────────────────────┐
    │  quality-refactor (可选，处理技术债)       │
    │  quality-sync (同步文档)                  │
    │  quality-retrospective (复盘，知识回流)    │
    └──────────────────────────────────────────┘
```

### 何时用哪个命令 -- 决策树

```
代码刚执行完
  ├─ 需要代码质量评估？──> /quality-review <phase>
  │    ├─ PASS/WARN ──> 继续测试
  │    └─ BLOCK ──> /maestro-plan <phase> --gaps
  │
  ├─ 需要用户验收？──> /quality-test <phase>
  │    ├─ 全通过 ──> /maestro-milestone-audit
  │    └─ 有问题 ──> /quality-debug --from-uat <phase>
  │
  ├─ 需要自动化测试？──> /quality-auto-test <phase>
  │    ├─ 收敛 ──> /maestro-verify <phase>
  │    └─ 发现 Bug ──> /quality-debug --from-uat <phase>
  │
  ├─ 有已知 Bug？──> /quality-debug "<issue>"
  │    ├─ 根因明确 ──> /maestro-plan <phase> --gaps
  │    └─ 不确定 ──> 继续调试
  │
  ├─ 需要减少技术债？──> /quality-refactor <scope>
  │    ├─ 测试通过 ──> /quality-sync
  │    └─ 测试失败 ──> /quality-debug <scope>
  │
  ├─ 代码改了文档没更新？──> /quality-sync
  │
  └─ Phase 完成需要复盘？──> /quality-retrospective <phase>
       ├─ 有洞察 ──> 自动路由到 spec/issue/knowhow
       └─ 完成后 ──> /manage-status
```

### 典型使用场景

**场景 1：标准质量流程**

```bash
/quality-review 1 --level standard     # 代码审查
/quality-auto-test 1                   # 自动测试
/quality-test 1                        # 用户验收
/quality-retrospective 1               # 复盘
```

**场景 2：测试失败修复循环**

```bash
/quality-test 1                        # UAT 发现问题
/quality-debug --from-uat 1            # 诊断根因
/maestro-plan 1 --gaps                 # 生成修复计划
/maestro-execute 1                     # 执行修复
/quality-auto-test 1 --re-run          # 重跑失败场景
```

**场景 3：技术债治理**

```bash
/quality-refactor src/auth             # 重构认证模块
/quality-sync                          # 同步文档
/quality-retrospective 1               # 复盘重构效果
```

---

## 四、与 Phase 管线集成

质量命令在 Maestro 的 Phase 管线（`maestro-analyze -> maestro-plan -> maestro-execute -> maestro-verify`）中扮演验证和保障角色。以下是各阶段的集成位置：

### maestro-verify 后置质量流程

`maestro-verify` 确认 Phase 目标达成后，是质量命令的标准入口：

```bash
/maestro-execute 1              # 执行
/maestro-verify 1               # 验证目标达成
# ↓ 以下为质量管线
/quality-review 1               # 代码审查
/quality-auto-test 1            # 自动测试
/quality-test 1                 # 用户验收
/quality-retrospective 1        # 复盘
```

### maestro-plan --gaps 闭环

`--gaps` 参数是质量管线与 Phase 管线的核心桥梁：

| 触发场景 | 命令 |
|---------|------|
| `quality-review` 裁定 BLOCK | `/maestro-plan {phase} --gaps` |
| `quality-debug` 确认根因 | `/maestro-plan {phase} --gaps` |
| `quality-test --auto-fix` | 自动调用 `plan --gaps -> execute -> verify` |

### 各质量命令在 Phase 管线中的位置

```
maestro-analyze → maestro-plan → maestro-execute → maestro-verify
                                                       │
                                       ┌───────────────┼───────────────┐
                                       │               │               │
                                  quality-review   quality-test    quality-auto-test
                                       │               │               │
                                       └───────┬───────┘───────────────┘
                                               │
                                    ┌──────────┼──────────┐
                                    │          │          │
                              quality-debug  quality-refactor  quality-sync
                                    │          │
                                    └────┬─────┘
                                         │
                               quality-retrospective
                                         │
                                    maestro-milestone-audit
```

### 里程碑审计前的质量检查点

`maestro-milestone-audit` 前建议完成以下质量检查：

1. **所有 Phase 已验证**：`maestro-verify` 通过
2. **关键 Phase 已审查**：`quality-review` 完成，无 BLOCK 项
3. **核心功能已测试**：`quality-test` 或 `quality-auto-test` 通过
4. **发现的问题已闭环**：issue 已修复并验证
5. **复盘已完成**：`quality-retrospective` 洞察已路由

### 一键全自动中的质量步骤

`/maestro -y` 的完整生命周期中，质量命令在 verify 之后自动介入：

```bash
/maestro -y "实现用户认证系统"
# 内部执行链：
# analyze → plan → execute → verify → auto-test → test → milestone-audit
```
