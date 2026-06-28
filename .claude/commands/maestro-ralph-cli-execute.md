---
name: maestro-ralph-cli-execute
description: CLI-delegated step executor — compose prompts, delegate to CLI, analyze output, loop
argument-hint: "[-y] [session-id]"
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
Step executor for ralph-cli sessions. Each invocation: locate session → find pending step → compose rich prompt → delegate to CLI → STOP → on callback: analyze output → mark complete → self-invoke.

**Key innovation over ralph-execute**: instead of inline execution via `maestro ralph next`, each step is delegated to an external CLI tool with a composed prompt that carries accumulated context. After CLI completes, the executor analyzes the output and artifacts to compose the next step's context.

Session: `.workflow/.maestro/ralph-cli-*/status.json`
Mutual invocation with `/maestro-ralph-cli` forms a delegate-driven work loop.
</purpose>

<context>
$ARGUMENTS — optional `-y` flag + optional session ID.

**Parse:**
```
-y / --yes → auto = true
Remaining  → session_id (if matches ralph-cli-*)
```
Also read `session.auto_mode` from status.json — if true, treat as `-y`.

**Step kinds:**

| Kind | Identifier | Execution | Flow after |
|------|-----------|-----------|------------|
| decision step | `step.decision` 非空 | `Skill("maestro-ralph-cli")` handoff | Execution ends here |
| execution step | `step.decision == null` | A_COMPOSE → A_DELEGATE → STOP → callback → A_ANALYZE → A_MARK_COMPLETE | Self-invoke next |

HARD RULES:
- **Execution via delegate**: 组装提示词 → `maestro delegate "PROMPT" --to <tool> --mode <mode>` with `run_in_background: true` → STOP
- **Decision via handoff**: `Skill("maestro-ralph-cli")` 回 ralph-cli 评估
- **Callback resume**: delegate 完成通知到达后，读输出 → 分析产物 → `maestro ralph complete N --status <S>` → 自调用下一步
- **Prompt composition**: 每步的 delegate prompt 由 A_COMPOSE_STEP_PROMPT 组装，包含前序步骤的 summary/caveats/decisions
</context>

<invariants>
1. **No inline execution** — 不读 command .md 内容，不在本会话内执行 skill 逻辑；所有执行发生在 delegate subprocess
2. **Delegate always background** — `run_in_background: true`；dispatch 后立即 STOP
3. **Prompt carries context** — 每步的 delegate prompt 包含 accumulated context（boundary + goals + history + signals）
4. **Output analysis on callback** — delegate 完成后 MUST 执行 A_ANALYZE_CLI_OUTPUT 读产物
5. **Completion via CLI** — 每步末尾 `maestro ralph complete N --status <S> --summary "..."` 标记完成
6. **Self-invocation chain** — callback 后 A_MARK_COMPLETE → `Skill("maestro-ralph-cli-execute")` 自调用
7. **status.json 唯一真源** — delegate_exec_id, cli_output_summary, artifacts_produced 写入 step
8. **CLI output 全量读取** — `maestro delegate output <exec-id>` 获取完整输出，不截断
</invariants>

<state_machine>

<states>
S_LOCATE        — 定位 session + 确认 running               PERSIST: —
S_RESOLVE_ARGS  — 解析占位符 + 丰富参数                      PERSIST: step.args (enriched)
S_COMPOSE       — 组装 delegate 提示词                       PERSIST: step.delegate_prompt_hash
S_DELEGATE      — 调 maestro delegate → STOP                PERSIST: step.delegate_exec_id, step.status = "running"
S_CALLBACK      — callback 到达，读 delegate 输出             PERSIST: —
S_ANALYZE       — 分析 CLI 输出 + 扫描产物                   PERSIST: step.cli_output_summary, step.artifacts_produced
S_MARK_COMPLETE — 标记完成 + 传播上下文                       PERSIST: step.completion_*, session.context
S_HANDLE_FAIL   — 处理失败                                   PERSIST: step.status, session.status
S_COMPLETE      — 所有 step 完成                             PERSIST: session.status = "completed"
S_FALLBACK      — 无 session 可执行                          PERSIST: —
</states>

<transitions>

S_LOCATE:
  → S_CALLBACK      WHEN: running step found with delegate_exec_id (resume after callback)
  → S_RESOLVE_ARGS  WHEN: pending step found                DO: A_LOCATE_SESSION
  → S_COMPLETE      WHEN: no pending steps
  → S_FALLBACK      WHEN: no running session

S_RESOLVE_ARGS:
  → S_COMPOSE       WHEN: step.decision == null              DO: A_RESOLVE_ARGS
  → END             WHEN: step.decision != null              DO: A_EXEC_DECISION

S_COMPOSE:
  → S_DELEGATE      DO: A_COMPOSE_STEP_PROMPT

S_DELEGATE:
  → END             DO: A_DISPATCH_DELEGATE
                     NOTE: STOP immediately after dispatch; callback resumes

S_CALLBACK:
  → S_ANALYZE       DO: A_READ_DELEGATE_OUTPUT

S_ANALYZE:
  → S_MARK_COMPLETE WHEN: delegate succeeded                 DO: A_ANALYZE_CLI_OUTPUT
  → S_HANDLE_FAIL   WHEN: delegate failed                    DO: A_ANALYZE_CLI_OUTPUT

S_MARK_COMPLETE:
  → S_LOCATE        DO: A_MARK_COMPLETE + Skill("maestro-ralph-cli-execute")

S_HANDLE_FAIL:
  → S_LOCATE        WHEN: auto + not retried               DO: A_RETRY
  → END             WHEN: auto + retried                    DO: A_PAUSE_SESSION
  → S_LOCATE        WHEN: interactive + user selects retry  DO: A_RETRY
  → S_LOCATE        WHEN: interactive + user selects skip   DO: A_SKIP_STEP
  → END             WHEN: interactive + user selects abort  DO: A_PAUSE_SESSION

S_COMPLETE:
  → END             DO: A_COMPLETE_SESSION

S_FALLBACK:
  → END             DO: display "无运行中的 ralph-cli 会话。使用 /maestro-ralph-cli 创建。"

</transitions>

<actions>

### A_LOCATE_SESSION

1. If session_id provided → load `.workflow/.maestro/{session_id}/status.json`
2. Else: scan `.workflow/.maestro/ralph-cli-*/status.json`, filter `status == "running"`, sort DESC, take first
3. Extract: session_id, steps[], phase, milestone, intent, auto_mode, cli_tool, cli_tool_config, boundary_contract, task_decomposition, execution_criteria, context
4. Check for running step with `delegate_exec_id` → indicates callback resume → S_CALLBACK
5. Otherwise find first pending step → S_RESOLVE_ARGS

### A_RESOLVE_ARGS

Same as ralph-execute A_RESOLVE_ARGS:
- Placeholder substitution: `{phase}`, `{milestone}`, `{intent}`, etc.
- Per-skill enrichment
- `--from` auto-injection for phase-level artifact chaining
- Goal context injection (goal_ref → goal_snippet)
- Write enriched args back to status.json

### A_EXEC_DECISION

1. Mark step running, write status.json
2. Display: `[{index}/{total}] ◆ {step.decision} Retry: {retry}/{max}`
3. `Skill({ skill: "maestro-ralph-cli" })` — ralph-cli 评估 + handoff
4. 执行在此结束

### A_COMPOSE_STEP_PROMPT

**Core prompt composition engine.** Builds a structured delegate prompt from session state + accumulated context.

**Algorithm:**

1. **Read completed steps** from status.json:
   ```
   completed_steps = session.steps.filter(s => s.status == "completed")
   recent_5 = completed_steps.slice(-5)
   all_caveats = completed_steps.map(s => s.completion_caveats).filter(Boolean)
   all_deferred = completed_steps.map(s => s.completion_deferred).filter(Boolean)
   ```

2. **Resolve artifacts** for stage-specific injection:
   | Current stage | Inject | Source |
   |---------------|--------|--------|
   | plan | analyze conclusions | Read `{analysis_dir}/conclusions.json` |
   | execute | plan task list | Read `{plan_dir}/TASK-*.json` summary |
   | review | changed files list | Read `{scratch_dir}/verification.json` |
   | test | review findings | Read latest `review.json` |
   | debug | error/gap details | Read preceding step's `completion_evidence` |
   | brainstorm | grill report | Read `{grill_id}` report if exists |

3. **Assemble prompt** (10 sections):

```
PURPOSE: {stage_purpose} for "{session.intent}"
成功标准: {stage_success_criteria}

SESSION:
  Intent: {session.intent}
  Phase: {session.phase}
  Lifecycle: {session.lifecycle_position}
  Milestone: {session.milestone}

{IF boundary_contract:}
BOUNDARY:
  In scope: {boundary_contract.in_scope}
  Out of scope: {boundary_contract.out_of_scope}
  Constraints: {boundary_contract.constraints}
  Definition of done: {boundary_contract.definition_of_done}
{END IF}

{IF task_decomposition AND pending goals exist:}
ACTIVE GOALS:
  {for g in task_decomposition WHERE status=="pending":}
  - {g.id}: {g.goal} — done when: {g.done_when}
  {end}
{END IF}

{IF recent_5 non-empty:}
EXECUTION HISTORY (recent {len} steps):
  {for s in recent_5:}
  [{s.index}] {s.skill} {s.args} → {s.completion_summary}
    Decisions: {s.completion_decisions ?? "—"}
    Caveats: {s.completion_caveats ?? "—"}
  {end}
{END IF}

{IF all_caveats or all_deferred non-empty:}
ACCUMULATED SIGNALS:
  Caveats: {all_caveats deduplicated, joined by "; "}
  Deferred: {all_deferred deduplicated, joined by "; "}
{END IF}

{IF stage-specific artifacts resolved:}
ARTIFACTS:
  {artifact content or summary}
{END IF}

TASK: 执行 /{step.skill} {resolved_args}
  {stage_task_detail}

EXPECTED: {stage_expected_output}

CONSTRAINTS:
  - Stay within boundary_contract.in_scope
  - {execution_criteria joined by " | "}
  - 完成后在工作目录产出结果文件
```

4. **Persist**: hash prompt → `step.delegate_prompt_hash`; write status.json

**Stage Purpose / Task Detail / Expected (lookup tables):**

| Stage | Purpose | Task Detail | Expected |
|-------|---------|-------------|----------|
| grill | 压力测试意图和假设 | 从多角度质疑方案可行性，找出盲点和风险 | grill-report.md + terminology.md |
| brainstorm | 多角度探索方案空间 | 生成 3+ 候选方案并评估优劣 | brainstorm analysis under .brainstorming/ |
| blueprint | 生成正式规格文档 | 走 7-phase spec generation | Product Brief + PRD + Architecture docs |
| init | 初始化项目结构 | 创建 .workflow/ + state.json + 基础配置 | .workflow/ directory + state.json |
| analyze-macro | 宏观分析范围和复杂度 | 扫描代码库，评估 scope_verdict (large/medium/small) | conclusions.json with scope_verdict |
| analyze | 分析 phase 代码和需求 | 理解当前 phase 的代码结构、依赖、约束 | analysis context + conclusions |
| roadmap | 生成路线图 | 从 analyze 产出构建里程碑/phase 结构 | roadmap.md + milestone structure |
| plan | 生成任务分解计划 | 将分析转化为可执行 TASK-*.json 文件 | TASK-*.json files |
| execute | 实现代码变更 | 按 plan 中的 task 逐个实现 | modified source files + verification.json |
| review | 审查代码质量 | 检查正确性、安全性、性能、架构 | review.json with verdict |
| test | 运行测试验证 | 执行测试套件，记录结果 | test-results.json + uat.md |
| test-gen | 生成测试用例 | 分析覆盖缺口，生成测试 | test task files |
| business-test | 业务场景测试 | 运行面向业务的自动化测试 | auto-test report |
| debug | 诊断修复问题 | 定位 root cause，应用修复 | fix applied + verification |

### A_DISPATCH_DELEGATE

1. Build delegate command（`session.cli_tool` 默认 `claude`，可由 `/maestro-ralph-cli --to <tool>` 覆盖）:
   ```
   maestro delegate "{composed_prompt}"
     --to {session.cli_tool}
     --mode {step.delegate_mode}
     --role {step.delegate_role}
     {step.delegate_rule ? "--rule " + step.delegate_rule : ""}
     --id {exec_id_prefix}-{HHmmss}-{rand4}
   ```
   Exec ID prefix: step.stage first 3 chars (e.g., `ana`, `pln`, `exe`, `rev`)

2. Mark step running:
   ```json
   step.status = "running"
   step.delegate_exec_id = "<generated exec_id>"
   ```
   Write status.json

3. Execute:
   ```
   Bash({ command: "maestro delegate \"...\" --to {tool} --mode {mode} --id {id}", run_in_background: true })
   ```

4. Display: `[{index}/{total}] ⟶ {step.skill} → delegate:{exec_id} [{cli_tool}]`

5. **STOP** — 不输出任何后续文本或工具调用。等待 delegate callback 通知。

### A_READ_DELEGATE_OUTPUT

Triggered when delegate callback notification arrives (or on re-invocation finding a running step with delegate_exec_id).

1. Read delegate output:
   ```
   Bash("maestro delegate output {step.delegate_exec_id}")
   ```
   如果 delegate 仍在运行：
   ```
   Bash("maestro delegate status {step.delegate_exec_id}")
   ```
   仍 running → STOP 继续等待

2. Parse delegate status:
   - `completed` → S_ANALYZE (succeeded)
   - `failed` → S_ANALYZE (failed) → S_HANDLE_FAIL

3. Store raw output excerpt in memory for A_ANALYZE_CLI_OUTPUT

### A_ANALYZE_CLI_OUTPUT

Reads CLI output and produced artifacts to extract key signals.

**Steps:**

1. **Read full output** from delegate:
   ```
   output = Bash("maestro delegate output {exec_id}")
   ```

2. **Scan for artifacts** produced by the delegate step:

   | Stage | Artifact patterns to scan |
   |-------|--------------------------|
   | analyze | `.workflow/scratch/*/conclusions.json`, `context.md` |
   | plan | `.workflow/scratch/*/TASK-*.json`, `plan.json` |
   | execute | `verification.json`, git diff |
   | review | `review.json` |
   | test | `test-results.json`, `uat.md` |
   | brainstorm | `.brainstorming/*` |
   | grill | `grill-report.md` |

   Use `Glob` to find newly created/modified files in expected paths.

3. **Extract key signals** from output:
   - `PHASE: N` → update `session.context.phase`
   - `scratch_dir: path` → update `session.context.scratch_dir`
   - `plan_dir: path` → update `session.context.plan_dir`
   - `analysis_dir: path` → update `session.context.analysis_dir`
   - Artifact IDs (`ANL-xxx`, `PLN-xxx`, `BLP-xxx`) → update corresponding context fields
   - Error indicators → flag for S_HANDLE_FAIL

4. **Compose output summary** (≤200 chars):
   Extract the most important outcome from the output. Examples:
   - analyze: "分析完成，scope_verdict=medium，发现 5 处关键依赖"
   - plan: "生成 8 个 TASK，覆盖 3 个模块"
   - execute: "实现 12 个文件变更，通过内置验证"
   - review: "审查通过，2 个 minor findings"

5. **Write to status.json**:
   ```json
   step.cli_output_summary = "{summary}"
   step.artifacts_produced = ["{path1}", "{path2}", ...]
   session.context = { ...updated signals }
   ```

### A_MARK_COMPLETE

1. Determine completion status from analysis:
   - Artifacts produced + no errors → DONE
   - Artifacts produced + warnings → DONE_WITH_CONCERNS
   - No artifacts + errors → NEEDS_RETRY or BLOCKED

2. Compose `--summary` from `cli_output_summary`:
   ```
   Bash("maestro ralph complete {index} --status {STATUS} --summary \"{cli_output_summary}\"
     {artifacts_produced.length ? '--evidence ' + artifacts_produced[0] : ''}
     {caveats ? '--caveats \"' + caveats + '\"' : ''}
     {decisions ? '--decisions \"' + decisions + '\"' : ''}
     {deferred ? '--deferred \"' + deferred + '\"' : ''}")
   ```

3. Display: `[{index}/{total}] ✓ {step.skill} → {completion_summary}`

4. Self-invoke: `Skill({ skill: "maestro-ralph-cli-execute" })`

### A_RETRY

1. `Bash("maestro ralph retry N")` — reset step status
2. Display: `[{index}/{total}] ↻ {step.skill} retry`
3. Self-invoke from S_LOCATE

### A_SKIP_STEP

手动编辑 `status.json`：step `status = "skipped"`, `completion_confirmed = false`, 清 `active_step_index`。

### A_PAUSE_SESSION

由 `ralph complete N --status BLOCKED` 触发或手动 pause。
Display: `[{index}/{total}] ✗ {step.skill} 失败，会话已暂停。/maestro-ralph-cli continue 恢复。`

### A_COMPLETE_SESSION

1. 校验：所有 step `completion_confirmed == true`（除 skipped）
2. `session.status = "completed"`, write status.json
3. Display completion report:
   ```
   ============================================================
     SESSION COMPLETE [cli-delegate]
   ============================================================
     Session:  {session_id}
     CLI Tool: {cli_tool}
     Steps:    {completed}/{total}

     [✓] 0.   maestro-analyze 2        [delegate:{exec_id}]
     [✓] 1.   maestro-plan 2           [delegate:{exec_id}]
     [✓] 2. ◆ post-execute              [decision]
     ...
   ============================================================
   ```

</actions>

</state_machine>

<appendix>

### Prompt Composition: Sliding Window Strategy

**Why 5 steps**: Claude's delegate prompt should be concise enough for the CLI tool to process effectively. More than 5 steps of history causes diminishing returns and prompt bloat.

**Window content per step**:
```
[{index}] {skill} {args} → {completion_summary}
  Decisions: {completion_decisions ?? "—"}
  Caveats: {completion_caveats ?? "—"}
```

**Accumulated signals**: unlike the sliding window, caveats and deferred items are aggregated from ALL completed steps (not just recent 5). This ensures important constraints propagate even when the source step exits the window.

### Delegate Exec ID Convention

Format: `{stage_prefix}-{HHmmss}-{rand4}`

| Stage | Prefix |
|-------|--------|
| grill | `grl` |
| brainstorm | `brn` |
| blueprint | `blp` |
| init | `ini` |
| analyze-macro | `anm` |
| analyze | `ana` |
| roadmap | `rdm` |
| plan | `pln` |
| execute | `exe` |
| review | `rev` |
| test | `tst` |
| test-gen | `tgn` |
| business-test | `bzt` |
| debug | `dbg` |

### Callback Detection

On re-invocation (e.g., user calls `/maestro-ralph-cli-execute` again), the executor detects callback state by:

1. Find running step with `delegate_exec_id` set
2. `Bash("maestro delegate status {exec_id}")`:
   - `completed` → proceed to S_ANALYZE
   - `failed` → proceed to S_ANALYZE → S_HANDLE_FAIL
   - `running` → display status, STOP (still waiting)

### Error Codes

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| E001 | error | No running session found | Suggest /maestro-ralph-cli |
| E011 | error | Delegate execution failed | Retry once (A_RETRY), then BLOCKED |
| E013 | error | Delegate output unreadable | Mark BLOCKED with raw error |
| E014 | error | No artifacts found after delegate | Check delegate output manually |
| W001 | warning | Step completed with concerns | Log and continue |
| W008 | warning | Delegate output truncated | Use available portion |

### Success Criteria

- [ ] Session discovery limited to `ralph-cli-*` prefix
- [ ] Pending step → A_COMPOSE_STEP_PROMPT → A_DISPATCH_DELEGATE → STOP
- [ ] Running step with delegate_exec_id → callback detection → A_ANALYZE
- [ ] A_COMPOSE_STEP_PROMPT includes all 10 sections (PURPOSE through CONSTRAINTS)
- [ ] Sliding window: last 5 completed steps' summaries in prompt
- [ ] Accumulated signals: ALL caveats + deferred aggregated
- [ ] Stage-specific artifact injection resolves correct files
- [ ] Boundary contract + active goals injected when present
- [ ] Delegate called with `run_in_background: true` + STOP after dispatch
- [ ] A_ANALYZE_CLI_OUTPUT reads full output + scans artifact patterns
- [ ] Key signals extracted and written to session.context
- [ ] cli_output_summary ≤200 chars, written to step
- [ ] artifacts_produced list written to step
- [ ] Completion via `maestro ralph complete N --status <S> --summary "..."`
- [ ] `--summary` MUST on DONE/DONE_WITH_CONCERNS (derived from cli_output_summary)
- [ ] Decision nodes handoff to `maestro-ralph-cli` (not `maestro-ralph`)
- [ ] Self-invocation chain continues until all confirmed or paused
- [ ] No inline skill execution — all work done in delegate subprocess

</appendix>
</output>
