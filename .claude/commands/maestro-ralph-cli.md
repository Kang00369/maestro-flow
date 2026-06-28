---
name: maestro-ralph-cli
description: CLI-delegated execution orchestrator — ralph flow with maestro delegate as execution engine (default Claude)
argument-hint: "<intent> [-y] [--to <tool>] | status | continue"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
---
<purpose>
CLI-delegated variant of maestro-ralph. Same chain-building logic (state machine, decomposition, decision evaluation) — but execution steps run via `maestro delegate` instead of inline Skill calls.

**Core difference**: after each delegate step completes, ralph-cli reads CLI output + produced artifacts → analyzes results → composes context-rich prompt for the next step's delegate call. This "analyze-compose" loop is the key mechanism.

Session: `.workflow/.maestro/ralph-cli-{YYYYMMDD-HHmmss}/status.json`
Mutual invocation with `/maestro-ralph-cli-execute` forms a delegate-driven work loop.

**Shared with ralph**: chain building (A_RESOLVE_PHASE → A_INFER_POSITION → A_BUILD_STEPS), session schema, decision evaluation (A_DELEGATE_EVALUATE, A_GOAL_AUDIT_EVALUATE). See `/maestro-ralph` for full specification. This file specifies only CLI-specific behavior.
</purpose>

<context>
$ARGUMENTS — same as ralph plus CLI-specific flags.

**Parse:**
```
-y flag        → auto_confirm = true
--to <tool>    → cli_tool_override (claude|codex|opencode|agy); 未指定时默认 claude
--amend / -a   → amend_mode = true
.md/.txt path  → input_doc
status|continue → route keyword
Remaining      → intent
```

**CLI tool selection:**
1. `--to <tool>` 显式指定 → 直接使用
2. 未指定 → 默认 `claude`
3. 校验 `cli-tools.json` 中目标工具 `enabled: true`
4. `enabled: false` → E012，提示可用工具列表

**State files** (same as ralph):
- `.workflow/state.json` — artifact registry
- `.workflow/.maestro/ralph-cli-*/status.json` — session state
</context>

<invariants>
All ralph invariants (1-16) apply. Additionally:

17. **Execution via delegate** — every execution step runs via `maestro delegate "PROMPT" --to <cli_tool> --mode <mode>` with `run_in_background: true`; executor STOPs after dispatch and resumes on callback
18. **Prompt composition between steps** — each step's delegate prompt is composed by A_COMPOSE_STEP_PROMPT, incorporating accumulated context from completed steps
19. **Artifact analysis on callback** — after delegate completes, A_ANALYZE_CLI_OUTPUT reads output + scans artifacts → extracts key signals → updates session.context
20. **CLI tool binding** — `session.cli_tool` 从 `--to` 参数或默认值 `claude` 确定；整个 session 内所有 delegate 调用使用同一 tool
21. **No inline execution** — executor never reads command .md content or executes skill logic in-context; all execution happens in delegate subprocess
</invariants>

<state_machine>

Ralph's full state machine applies (S_PARSE_ROUTE through S_APPLY_VERDICT). The following overrides specify CLI-specific behavior:

<transitions>

S_DISPATCH:
  → END             DO: Skill({ skill: "maestro-ralph-cli-execute" })
  NOTE: dispatches to CLI executor, not ralph-execute

S_DECISION_EVAL:
  (same as ralph — quality-gate / goal-gate / scope-gate / reground-gate / structural)
  NOTE: decision evaluation uses `maestro delegate --role analyze --mode analysis` (same as ralph)
  NOTE: after verdict applied, dispatch goes to maestro-ralph-cli-execute

</transitions>

<actions>

### A_CREATE_SESSION (override)

Same as ralph A_CREATE_SESSION with:
1. `session_id` format: `ralph-cli-{YYYYMMDD-HHmmss}`
2. Additional fields:
   ```json
   {
     "execution_mode": "cli-delegate",
     "cli_tool": "<selected tool, default claude>",
     "cli_tool_config": {
       "primaryModel": "",
       "mode_map": {
         "analyze": "analysis",
         "plan": "write",
         "execute": "write",
         "review": "analysis",
         "test": "write",
         "debug": "write"
       }
     }
   }
   ```
3. Each step additionally has:
   ```json
   {
     "delegate_exec_id": null,
     "delegate_prompt_hash": null,
     "cli_output_summary": null,
     "artifacts_produced": []
   }
   ```

### A_BUILD_STEPS (override)

Same as ralph A_BUILD_STEPS. After standard build:

1. **Mode assignment**: for each execution step, assign `step.delegate_mode` from `cli_tool_config.mode_map[stage]`; default `"write"` for execution steps, `"analysis"` for analysis steps
2. **Role assignment**: `step.delegate_role` mapped from stage:
   | Stage | Role |
   |-------|------|
   | analyze, analyze-macro | analyze |
   | plan | plan |
   | execute | implement |
   | review, business-test | review |
   | test, test-gen | implement |
   | grill, brainstorm | brainstorm |
   | debug | analyze |
3. **Rule assignment**: `step.delegate_rule` mapped from stage (optional):
   | Stage | Rule |
   |-------|------|
   | analyze | `analysis-analyze-code-patterns` |
   | plan | `planning-breakdown-task-steps` |
   | execute | `development-implement-feature` |
   | review | `analysis-review-code-quality` |
   | debug | `analysis-diagnose-bug-root-cause` |

### A_COMPOSE_STEP_PROMPT

Composes the delegate prompt for a step. Called by ralph-cli-execute before each delegate dispatch.

**Input**: step, session (from status.json)
**Output**: formatted delegate prompt string

**Composition algorithm:**

```
1. HEADER — step identity
   PURPOSE: {stage_purpose_map[step.stage]} for "{session.intent}"
   成功标准: {stage_success_criteria[step.stage]}

2. SESSION_CONTEXT — from session fields
   CONTEXT:
     Intent: {session.intent}
     Phase: {session.phase}
     Lifecycle: {session.lifecycle_position}
     Milestone: {session.milestone}

3. BOUNDARY — from session.boundary_contract (if present)
     Boundary:
       In scope: {in_scope joined}
       Out of scope: {out_of_scope joined}
       Constraints: {constraints joined}
       Definition of done: {definition_of_done}

4. ACTIVE_GOALS — from session.task_decomposition (if present)
     Active Goals:
       {for g in task_decomposition WHERE status=="pending":}
       - {g.id}: {g.goal} — done when: {g.done_when}
       {end}

5. EXECUTION_HISTORY — sliding window of last 5 completed steps
     Execution History (recent {N} steps):
       {for s in completed_steps.slice(-5):}
       [{s.index}] {s.skill} {s.args} → {s.completion_summary}
         Decisions: {s.completion_decisions ?? "—"}
         Caveats: {s.completion_caveats ?? "—"}
       {end}

6. ACCUMULATED_SIGNALS — aggregated from ALL completed steps
     Accumulated Signals:
       Caveats: {all completion_caveats, deduplicated}
       Deferred: {all completion_deferred, deduplicated}

7. ARTIFACT_CONTEXT — stage-specific artifact injection
   See: Stage-Specific Artifact Injection table

8. TASK — the actual task
   TASK: 执行 /{step.skill} {resolved_args}
     {stage_task_detail[step.stage]}

9. EXPECTED — output format
   EXPECTED: {stage_expected[step.stage]}

10. CONSTRAINTS
    CONSTRAINTS:
      - Stay within boundary_contract.in_scope
      - {execution_criteria joined by ' | '}
      - 每步只做 step 范围内的事，不越权
```

**Stage Purpose Map:**

| Stage | Purpose |
|-------|---------|
| grill | 压力测试意图和假设，找出潜在问题 |
| brainstorm | 多角度探索方案空间，产出分析报告 |
| blueprint | 生成正式规格文档（Product Brief / PRD / Architecture） |
| init | 初始化项目工作流结构 |
| analyze-macro | 宏观分析项目范围，产出 scope_verdict |
| analyze | 分析当前 phase 的代码和需求 |
| roadmap | 生成里程碑/phase 结构的路线图 |
| plan | 生成可执行的任务分解计划 |
| execute | 实现计划中的代码变更 |
| review | 审查代码质量，发现问题 |
| test | 运行测试套件，验证实现 |
| test-gen | 生成测试用例覆盖缺口 |
| business-test | 运行业务场景自动化测试 |
| debug | 诊断和修复失败测试/已知 bug |

**Stage-Specific Artifact Injection:**

| Stage | What to inject | Source |
|-------|---------------|--------|
| plan | analyze conclusions + scope_verdict | `session.context.analysis_dir` / `conclusions.json` |
| execute | plan tasks + task list | `session.context.plan_dir` / `TASK-*.json` |
| review | execution results + modified files | `session.context.scratch_dir` / `verification.json` |
| test | review findings + execution artifacts | `review.json` if exists |
| debug | previous step's error/gap details | preceding step's `completion_evidence` |
| brainstorm | grill report (if grill ran) | `session.context.grill_id` |

**Stage Expected Output:**

| Stage | Expected |
|-------|----------|
| analyze | conclusions.json with scope_verdict + key findings |
| plan | TASK-*.json files with implementation steps |
| execute | modified source files + verification.json |
| review | review.json with verdict + findings |
| test | test-results.json + uat.md |
| debug | root cause analysis + fix applied |

</actions>

</state_machine>

<appendix>

### Session Schema (extends ralph)

Ralph session schema plus:
```json
{
  "execution_mode": "cli-delegate",
  "cli_tool": "claude",
  "cli_tool_config": {
    "primaryModel": "claude-opus-4-6",
    "mode_map": { "analyze": "analysis", "plan": "write", "execute": "write", "review": "analysis", "test": "write", "debug": "write" }
  },
  "steps": [{
    "delegate_exec_id": null,
    "delegate_prompt_hash": null,
    "cli_output_summary": null,
    "artifacts_produced": [],
    "delegate_mode": "write|analysis",
    "delegate_role": "analyze|plan|implement|review|brainstorm",
    "delegate_rule": null
  }]
}
```

### Prompt Composition Example

```
PURPOSE: 生成可执行的任务分解计划 for "重构认证模块"
成功标准: 产出 TASK-*.json 文件，每个 task 有明确的文件列表和实现步骤

SESSION:
  Intent: 重构认证模块，提取 JWT 验证为独立中间件
  Phase: 2
  Lifecycle: plan
  Milestone: MS-002

BOUNDARY:
  In scope: src/auth/, src/middleware/
  Out of scope: src/database/, tests/e2e/
  Constraints: 向后兼容现有 API；不改公共接口签名
  Definition of done: 所有现有测试通过 + JWT 中间件独立可测

ACTIVE GOALS:
  - G1: 提取 JWT 验证逻辑 — done when: src/middleware/jwt.ts 独立存在且通过单元测试
  - G2: 统一错误处理 — done when: 所有 auth 错误走统一 ErrorHandler

EXECUTION HISTORY (recent 2 steps):
  [0] maestro-analyze 2 → 分析认证模块依赖图，发现 5 处 JWT 内联验证
    Decisions: 选择提取为中间件而非工具函数
    Caveats: session 存储层与 JWT 有隐式耦合

ACCUMULATED SIGNALS:
  Caveats: session 存储层与 JWT 有隐式耦合
  Deferred: —

TASK: 执行 /maestro-plan 2 --from analyze:ANL-20260628-143025
  基于 analyze 产出的依赖图和 scope，生成任务分解计划

EXPECTED: TASK-*.json 文件，每个包含 file_list + implementation_steps + done_when

CONSTRAINTS:
  - Stay within src/auth/, src/middleware/
  - 向后兼容 | scope-freeze | 增量提交
  - 每步只做 plan 范围内的事，不越权
```

### Error Codes

Same as ralph plus:

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| E011 | error | Delegate execution failed (non-zero exit) | Retry once, then BLOCKED |
| E012 | error | CLI tool not enabled in cli-tools.json | Switch tool or enable |
| E013 | error | Delegate output parse failed | Use raw output, mark LOW CONFIDENCE |

### Success Criteria

All ralph success criteria apply. Additionally:

- [ ] Session has `execution_mode: "cli-delegate"` + `cli_tool` + `cli_tool_config`
- [ ] Each step has `delegate_mode` + `delegate_role` + `delegate_rule` assigned by A_BUILD_STEPS
- [ ] A_COMPOSE_STEP_PROMPT produces structured delegate prompts with all 10 sections
- [ ] Prompt includes sliding window of last 5 completed steps' summaries
- [ ] Prompt includes accumulated caveats/deferred signals
- [ ] Stage-specific artifact injection resolves correct artifacts
- [ ] Boundary contract injected into every prompt (when present)
- [ ] Active goals injected into every prompt (when present)
- [ ] Dispatch goes to `maestro-ralph-cli-execute` (not `maestro-ralph-execute`)
- [ ] CLI tool selected from cli-tools.json or overridden by `--to` flag
- [ ] Decision evaluation uses same delegate pattern as ralph (unchanged)

</appendix>
</output>
