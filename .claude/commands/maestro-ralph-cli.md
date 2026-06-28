---
name: maestro-ralph-cli
description: CLI-delegated lifecycle orchestrator — compose, delegate, analyze, decide in one loop
argument-hint: "<intent> [-y] [--to <tool>] [--amend [change]] [--roadmap] | status | continue"
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
CLI-delegated variant of maestro-ralph. Same chain-building logic — but this command owns the full orchestration loop: compose prompt → delegate to CLI (via ralph-cli-execute wrapper) → STOP → callback → analyze structured result → mark complete → decide next → loop.

Session: `.workflow/.maestro/ralph-cli-{YYYYMMDD-HHmmss}/status.json`

**Shared with ralph**: chain building (A_RESOLVE_PHASE → A_INFER_POSITION → A_BUILD_STEPS), session schema, decomposition (A_DECOMPOSE_TASKS). See `/maestro-ralph` for full specification.
</purpose>

<context>
$ARGUMENTS — same as ralph plus CLI-specific flags.

**Parse:**
```
-y flag        → auto_confirm = true
--to <tool>    → cli_tool (claude|codex|opencode|agy); 默认 claude
--roadmap      → wants_roadmap = true
--amend / -a   → amend_mode = true
.md/.txt path  → input_doc
status|continue → route keyword
Remaining      → intent (amend_mode 时为 change_request)
```

**CLI tool selection:**
1. `--to <tool>` 显式指定 → 直接使用
2. 未指定 → 默认 `claude`
3. 校验 `cli-tools.json` 中目标工具 `enabled: true`
4. `enabled: false` → E012

**State files**:
- `.workflow/state.json` — artifact registry
- `.workflow/.maestro/ralph-cli-*/status.json` — session state
</context>

<invariants>
All ralph invariants (1-16) apply. Additionally:

17. **ralph-cli owns the loop** — compose → delegate → analyze → decide 全部在本命令内完成；ralph-cli-execute 只是被委托端的执行包装器
18. **Delegate via cli-execute** — delegate prompt 首行为 cli-execute 调用，格式由目标工具决定（见 Invocation Notation）
19. **Parse ---RESULT--- block** — delegate 返回后从输出中解析结构化结果块
20. **Decision evaluation inline** — decision 节点不 handoff，直接在本循环内评估（仍用 `maestro delegate --to {session.cli_tool} --mode analysis` 做只读分析）
21. **No inline skill execution** — 本命令不执行 skill 逻辑；执行由委托端 cli-execute 完成
</invariants>

<state_machine>

Ralph's chain-building states apply (S_PARSE_ROUTE through S_CREATE_SESSION). Execution loop states replace S_DISPATCH:

<states>
S_PARSE_ROUTE   — 解析参数、路由入口
S_STATUS        — 显示 session 进度
S_CONTINUE      — 恢复执行
S_RESOLVE_PHASE — (ralph shared)
S_INFER         — (ralph shared)
S_RESOLVE_SCOPE — (ralph shared)
S_QUALITY_MODE  — (ralph shared)
S_PLANNING_MODE — (ralph shared)
S_DECOMPOSE     — (ralph shared)
S_BUILD_CHAIN   — (ralph shared)
S_CREATE_SESSION — 写 status.json
S_CONFIRM       — 用户确认

S_STEP_LOCATE   — 找下一个 pending step                    PERSIST: —
S_STEP_RESOLVE  — 解析占位符 + 丰富参数                    PERSIST: step.args
S_STEP_LOAD     — 加载前序产出 + 发现                      PERSIST: —
S_STEP_COMPOSE  — 根据目标 skill 生成适配 prompt            PERSIST: —
S_STEP_DELEGATE — 调 maestro delegate → STOP              PERSIST: step.delegate_exec_id, step.status
S_STEP_ANALYZE  — 解析 ---RESULT--- 块 + 分析产物          PERSIST: step.cli_output_summary, session.context
S_STEP_COMPLETE — 标记完成                                 PERSIST: step.completion_*
S_DECISION_EVAL — 评估 decision 节点                       PERSIST: —
S_APPLY_VERDICT — 应用裁决                                 PERSIST: session.steps[]
S_SESSION_DONE  — 所有 step 完成                           PERSIST: session.status
S_HANDLE_FAIL   — 处理失败                                 PERSIST: step.status
S_AMEND_GOAL    — 修改 running session 目标                PERSIST: session.task_decomposition, .boundary_contract, .goal_changelog, .steps[]
S_FALLBACK      — 请求用户输入                             PERSIST: —
</states>

<transitions>

S_PARSE_ROUTE:
  → S_STATUS        WHEN: intent == "status"
  → S_CONTINUE      WHEN: intent == "continue"
  → S_AMEND_GOAL    WHEN: amend_mode == true AND running session exists
  → S_FALLBACK      WHEN: amend_mode == true AND no running session
  → S_STEP_LOCATE   WHEN: running session with decision step in "running" status
  → S_RESOLVE_PHASE WHEN: intent is non-empty
  → S_FALLBACK      WHEN: no intent AND no running session

S_STATUS:
  → END             DO: A_SHOW_STATUS

S_CONTINUE:
  → S_STEP_LOCATE   WHEN: running session found
  → S_FALLBACK      WHEN: no running session

S_AMEND_GOAL:
  → S_STEP_LOCATE   WHEN: change applied + user confirmed    DO: A_AMEND_GOAL
  → END             WHEN: user cancels
  GUARD: RISK_LEVEL=high → auto_confirm 无效

S_CREATE_SESSION:
  → S_CONFIRM       WHEN: not auto_confirm
  → S_STEP_LOCATE   WHEN: auto_confirm

S_CONFIRM:
  → S_STEP_LOCATE   WHEN: user confirms
  → S_BUILD_CHAIN   WHEN: user edits
  → END             WHEN: user cancels

S_STEP_LOCATE:
  → S_STEP_RESOLVE  WHEN: pending execution step found
  → S_DECISION_EVAL WHEN: pending decision step found
  → S_SESSION_DONE  WHEN: no pending steps
  → S_FALLBACK      WHEN: no running session

S_STEP_RESOLVE:
  → S_STEP_LOAD     DO: A_RESOLVE_ARGS

S_STEP_LOAD:
  → S_STEP_COMPOSE  DO: A_LOAD_STEP_CONTEXT

S_STEP_COMPOSE:
  → S_STEP_DELEGATE DO: A_COMPOSE_DELEGATION_PROMPT

S_STEP_DELEGATE:
  → END             DO: A_DISPATCH_DELEGATE (STOP after dispatch)

(callback resumes here — re-invocation via continue or automatic)
S_STEP_LOCATE (on re-entry, finds running step with delegate_exec_id):
  → S_STEP_ANALYZE  WHEN: delegate completed
  → S_HANDLE_FAIL   WHEN: delegate failed (status != completed AND status != running)
  → END             WHEN: delegate still running (STOP)

S_STEP_ANALYZE:
  → S_STEP_COMPLETE WHEN: result STATUS == DONE|DONE_WITH_CONCERNS   DO: A_PARSE_RESULT
  → S_HANDLE_FAIL   WHEN: result STATUS == NEEDS_RETRY|BLOCKED       DO: A_PARSE_RESULT

S_STEP_COMPLETE:
  → S_STEP_LOCATE   DO: A_MARK_COMPLETE (loop to next step)

S_DECISION_EVAL:
  → S_APPLY_VERDICT WHEN: quality-gate (post-execute, post-business-test, post-review, post-test, post-frontend-verify)
                     DO: A_DELEGATE_EVALUATE
  → S_APPLY_VERDICT WHEN: goal-gate (post-goal-audit)
                     DO: A_GOAL_AUDIT_EVALUATE
  → S_APPLY_VERDICT WHEN: scope-gate (post-analyze-scope)
                     DO: A_SCOPE_EVALUATE
  → S_APPLY_VERDICT WHEN: reground-gate (post-reground)
                     DO: A_REGROUND_EVALUATE
  → S_APPLY_VERDICT WHEN: structural (post-milestone, post-debug-escalate)
                     DO: A_STRUCTURAL_EVALUATE

S_APPLY_VERDICT:
  → S_STEP_LOCATE   WHEN: verdict == "proceed"              DO: A_APPLY_PROCEED
  → S_STEP_LOCATE   WHEN: post-goal-audit + has_unmet       DO: A_APPLY_GOAL_FIX
  → S_STEP_LOCATE   WHEN: post-goal-audit + all_met + INTENT_ALIGNED=true  DO: A_APPLY_GOAL_DONE
  → END             WHEN: post-goal-audit + all_met + INTENT_ALIGNED=false  DO: A_REGROUND_HALT
  → S_STEP_LOCATE   WHEN: post-analyze-scope                DO: A_APPLY_SCOPE_VERDICT
  → S_STEP_LOCATE   WHEN: verdict == "fix"                  DO: A_APPLY_FIX
  → S_STEP_LOCATE   WHEN: verdict == "escalate"             DO: A_APPLY_ESCALATE
  → S_STEP_LOCATE   WHEN: post-milestone + next milestone   DO: A_ADVANCE_MILESTONE
  → END             WHEN: post-milestone + no next milestone
  → END             WHEN: post-debug-escalate                DO: A_PAUSE_ESCALATE
  → END             WHEN: post-reground + drifted + confidence >= 60  DO: A_REGROUND_HALT
  → S_STEP_LOCATE   WHEN: post-reground + aligned           DO: A_APPLY_PROCEED
  GUARD: retry_count >= max_retries → force escalate
  GUARD: confidence_score < 60 AND proceed → override to fix
  GUARD: auto_confirm → skip user prompt, apply adjusted verdict
  GUARD: post-reground + drifted + confidence >= 60 → A_REGROUND_HALT（auto_confirm 不跳过）

S_HANDLE_FAIL:
  → S_STEP_LOCATE   WHEN: auto + not retried              DO: A_RETRY
  → END             WHEN: auto + retried                   DO: A_PAUSE_SESSION
  → S_STEP_LOCATE   WHEN: interactive + retry
  → S_STEP_LOCATE   WHEN: interactive + skip
  → END             WHEN: interactive + abort

S_SESSION_DONE:
  → END             DO: A_COMPLETE_SESSION

</transitions>

<actions>

### A_CREATE_SESSION (override)

Same as ralph A_CREATE_SESSION with:
1. `session_id` format: `ralph-cli-{YYYYMMDD-HHmmss}`
2. Additional fields: `execution_mode: "cli-delegate"`, `cli_tool: "<selected>"``
3. Each step: `delegate_exec_id: null`, `cli_output_summary: null`, `artifacts_produced: []`
4. Step mode/role/rule assigned per stage (see Stage Mapping table)

### A_RESOLVE_ARGS

Same as ralph-execute A_RESOLVE_ARGS:
- Placeholder substitution: `{phase}`, `{milestone}`, `{intent}`
- `--from` auto-injection for phase-level artifact chaining
- Goal context injection (goal_ref → goal_snippet)
- Write enriched args back to status.json

### A_LOAD_STEP_CONTEXT

主流程加载前序产出和发现，为 prompt 生成准备素材。

1. **Session base** — Read status.json → intent, phase, milestone, boundary_contract
2. **Previous step output** — 前一 step 的 `cli_output_summary` + `completion_caveats` + `artifacts_produced` → 关键发现 + 产物路径
3. **Artifacts** — 按产物路径逐个 Read，提取与当前 step 相关的内容：
   - `conclusions.json` → scope, key_findings, recommendations
   - `TASK-*.json` → task descriptions, dependencies, wave assignments
   - `verification.json` → pass/fail results, gap details
   - `review.json` → findings, severity, fix suggestions
   - `completion_evidence` → error traces, test failures
   - `grill-report.md` → challenged assumptions, risks
4. **Explore if needed** — 产物指向代码位置但缺少上下文 → `maestro explore` 补充（仅 execute/debug/test 且有文件路径引用时）
5. **Accumulated signals** — 遍历 ALL completed steps → 聚合 caveats + deferred

输出：`step_context` 结构，供 A_COMPOSE_DELEGATION_PROMPT 消费。

### A_COMPOSE_DELEGATION_PROMPT

根据 `step_context` + 目标 skill 生成适配的 delegate prompt。

**Invocation Notation** — 由 `session.cli_tool` 决定：

| cli_tool | 首行格式 |
|----------|---------|
| claude | `/maestro-ralph-cli-execute {step.skill} {resolved_args} --session {session_id}` |
| codex | `$maestro-ralph-cli-execute {step.skill} {resolved_args} --session {session_id}` |
| opencode, agy | `/maestro-ralph-cli-execute {step.skill} {resolved_args} --session {session_id}` |

**Skill-adapted prompt** — 根据目标 skill 类型选择性注入 step_context 中的内容：

| 目标 skill 类型 | 注入重点 |
|----------------|---------|
| analyze | intent + scope + boundary |
| plan | analysis findings + scope_verdict + recommendations |
| execute | task list + dependencies + wave + caveats from plan |
| review | changed files + verification results + execution decisions |
| test | review findings + execution artifacts + coverage data |
| debug | error details + failing tests + execution trace |
| brainstorm/grill | challenged assumptions + risks + prior findings |

每段仅在有实际内容时加入，无内容则跳过。

### A_DISPATCH_DELEGATE

1. Build command:
   ```
   maestro delegate "{composed_prompt}"
     --to {session.cli_tool}
     --mode {step.delegate_mode}
     --id {stage_prefix}-{HHmmss}-{rand4}
   ```

2. Write `step.delegate_exec_id`, `step.status = "running"` to status.json

3. `Bash({ command: "maestro delegate ...", run_in_background: true })`

4. Display: `[{index}/{total}] ⟶ {step.skill} → delegate:{exec_id} [{cli_tool}]`

5. **STOP**

### A_PARSE_RESULT

On callback (re-invocation finds running step with delegate_exec_id):

1. `Bash("maestro delegate status {exec_id}")` — still running → STOP
2. `Bash("maestro delegate output {exec_id}")` — get full output
3. Parse `---RESULT---` / `---END---` block:
   ```
   STATUS  → completion_status
   SUMMARY → completion_summary
   ARTIFACTS → artifacts_produced (split by comma)
   DECISIONS → completion_decisions
   CAVEATS → completion_caveats
   DEFERRED → completion_deferred
   SIGNALS → parse key=value pairs → update session.context
   ```
4. If no `---RESULT---` block found → fallback: STATUS=DONE_WITH_CONCERNS, SUMMARY from last 200 chars of output
5. Write parsed data to step in status.json

### A_MARK_COMPLETE

1. `Bash("maestro ralph complete {index} --status {STATUS} --summary \"{SUMMARY}\" [--evidence ...] [--decisions ...] [--caveats ...] [--deferred ...]")`
2. Apply SIGNALS to `session.context`
3. Display: `[{index}/{total}] ✓ {step.skill} → {SUMMARY}`
4. Loop back to S_STEP_LOCATE

### A_SHOW_STATUS

Same as ralph A_SHOW_STATUS: find latest ralph-cli session, display steps + sub-goals progress.

### A_DELEGATE_EVALUATE

Same as ralph: delegate `--to {session.cli_tool} --mode analysis` with quality gate verdict parsing. Runs inline (run_in_background, STOP, callback resume in same loop). Confidence adjustment + decision log to `decisions.ndjson`.

### A_GOAL_AUDIT_EVALUATE

Same as ralph: audit unmet sub-goals against evidence artifacts + done_when criteria. Delegate `--to {session.cli_tool} --mode analysis`. Verdict: `all_met` / `has_unmet`.

### A_SCOPE_EVALUATE

Same as ralph: read `conclusions.json.scope_verdict` from macro analyze artifact. Write to `session.scope_verdict` + `session.analyze_macro_id`.

### A_REGROUND_EVALUATE

Same as ralph: intent fidelity check against accumulated execution. Delegate `--to {session.cli_tool} --mode analysis`. Verdict: `aligned` / `drifted` + `confidence_score`.

### A_STRUCTURAL_EVALUATE

**post-milestone**: read state.json → determine milestone type → standard: next milestone? insert lifecycle steps / complete. Adhoc: always END.
**post-debug-escalate**: always STOP → A_PAUSE_ESCALATE.

### A_APPLY_PROCEED / A_APPLY_FIX / A_APPLY_ESCALATE

Same as ralph: mark decision completed / insert fix-loop steps / insert debug-escalate.

### A_APPLY_SCOPE_VERDICT

Same as ralph: reshape downstream chain based on `scope_verdict` (large+wants_roadmap → keep roadmap; medium/small → collapse to standalone plan).

### A_APPLY_GOAL_FIX / A_APPLY_GOAL_DONE

Same as ralph: insert scoped mini-loops for unmet sub-goals / mark all goals done + `task_decomposition_all_done=true`.

### A_ADVANCE_MILESTONE

Same as ralph: update session milestone/phase, insert full lifecycle steps for next milestone, reindex.

### A_REGROUND_HALT

Same as ralph: set `session.status = "paused"`, display drift warning. auto_confirm 不跳过.

### A_PAUSE_ESCALATE

Set session paused, display "请人工介入", suggest `/maestro-ralph-cli continue`.

### A_AMEND_GOAL

Same as ralph (deferred_reading: `ralph-amend-goal.md`): 5 步流程（快照→解析→mini grill→确认→应用）。RISK_LEVEL=high 时 auto_confirm 无效。

### A_RETRY / A_PAUSE_SESSION / A_COMPLETE_SESSION

Same as ralph equivalents.

</actions>

</state_machine>

<appendix>

### Stage Mapping

| Stage | delegate_mode | delegate_rule |
|-------|---------------|---------------|
| analyze, analyze-macro | analysis | `analysis-analyze-code-patterns` |
| plan | write | `planning-breakdown-task-steps` |
| execute | write | `development-implement-feature` |
| review, business-test | analysis | `analysis-review-code-quality` |
| test, test-gen | write | — |
| grill, brainstorm | write | — |
| debug | write | `analysis-diagnose-bug-root-cause` |

All delegation uses `--to {session.cli_tool}` (not `--role`). The `cli_tool` is resolved from session context.

### Delegate Exec ID Prefix

| Stage | Prefix |
|-------|--------|
| grill | `grl` |
| brainstorm | `brn` |
| analyze-macro | `anm` |
| analyze | `ana` |
| plan | `pln` |
| execute | `exe` |
| review | `rev` |
| test | `tst` |
| debug | `dbg` |

### Session Schema (extends ralph)

Ralph session schema 全量字段（`boundary_contract`, `execution_criteria`, `task_decomposition`, `task_decomposition_all_done`, `goal_changelog`, `scope_verdict`, `wants_roadmap`, `analyze_macro_id`, `blueprint_id` 等）均适用。CLI 新增字段：

```json
{
  "execution_mode": "cli-delegate",
  "cli_tool": "claude",
  "steps": [{
    "delegate_exec_id": null,
    "delegate_mode": "write|analysis",
    "delegate_rule": null,
    "cli_output_summary": null,
    "artifacts_produced": []
  }]
}
```

### Fix-Loop Templates

Same as ralph. All fix-loop templates (post-execute / post-business-test / post-review / post-test / post-frontend-verify / post-goal-audit) apply unchanged. Each inserted step is delegated through the same compose → delegate → analyze cycle.

### Error Codes

Ralph error codes E001–E006, W001–W004 all apply. CLI-specific additions:

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| E011 | error | Delegate execution failed | Retry once, then BLOCKED |
| E012 | error | CLI tool not enabled in cli-tools.json | Switch tool or enable |
| E013 | error | ---RESULT--- block not found in output | Fallback parse, mark LOW CONFIDENCE |

### Success Criteria

All ralph success criteria apply. Additionally:

- [ ] ralph-cli owns full loop: compose → delegate → STOP → callback → parse → complete → next
- [ ] Delegation prompt 首行为 cli-execute 调用（格式由 cli_tool 决定），后接 `<execution_context>`
- [ ] A_PARSE_RESULT extracts STATUS/SUMMARY/ARTIFACTS/DECISIONS/CAVEATS/DEFERRED/SIGNALS from ---RESULT--- block
- [ ] SIGNALS parsed as key=value pairs and applied to session.context
- [ ] Decision evaluation runs inline (no handoff to another command)
- [ ] ralph-cli-execute 仅通过 delegate 会话加载执行，不直接 Skill() 调用
- [ ] Sliding window: last 5 completed steps in execution_context
- [ ] Accumulated caveats/deferred from ALL completed steps
- [ ] Stage-specific artifact injection in execution_context
- [ ] CLI tool defaults to claude, overridden by --to
- [ ] `--roadmap` flag parsed → `wants_roadmap = true`
- [ ] `.md/.txt path → input_doc` parsed
- [ ] S_AMEND_GOAL + A_AMEND_GOAL 完整实现（5 步流程，RISK_LEVEL=high 不跳过）
- [ ] `goal_changelog` 写入路径存在（amend 流程产出）
- [ ] `blueprint_id` session 字段支持 `--from blueprint:{BLP_ID}` 路径
- [ ] A_SHOW_STATUS 显示 task_decomposition 子目标进度
- [ ] A_STRUCTURAL_EVALUATE 处理 post-milestone + post-debug-escalate
- [ ] A_ADVANCE_MILESTONE 插入下一里程碑 lifecycle steps
- [ ] A_REGROUND_HALT 漂移熔断（auto_confirm 不跳过）
- [ ] A_PAUSE_ESCALATE 达到 max_retries 时暂停
- [ ] A_APPLY_SCOPE_VERDICT 三路径重塑（large+roadmap / medium-small / unknown）
- [ ] Fix-loop templates（6 套）通过 compose-delegate cycle 执行
- [ ] re-grounding 3-step 插入规则（build rule 5.5）
- [ ] spec-setup 预检（build rule 0.5）

</appendix>
</output>
