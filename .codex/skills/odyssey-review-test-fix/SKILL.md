---
name: odyssey-review-test-fix
description: "Deep review + fix cycle — archaeology, exploration, multi-dimensional review, targeted fix, generalization, discovery, and knowledge persistence"
argument-hint: "<target> [--dimensions <list>] [--fix-threshold critical|high|medium|low|all] [--skip-fix] [--skip-generalize] [--auto] [-y] [-c] [--heartbeat]"
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, request_user_input
---
<base>@~/.maestro/workflows/odyssey-base-codex.md</base>

<purpose>
Deep code review with exhaustive fix: archaeology → explore → multi-dimensional review →
fix ALL findings → confirm → generalize → discover → persist. Zero-residual philosophy.

**三句哲学约束（穷尽迭代）:**
1. **零遗留** — 每个 finding 必须是 action item（修复 / issue / 决策），不允许只报告不处理
2. **穷尽迭代** — 按 severity 从高到低逐轮修复，直到 0 remaining actionable findings 才退出 fix loop
3. **改进即标准** — 每次修复后重审同区域，发现新问题继续修，直到该区域无可改善

Core behaviors:
- **Find one, fix one, find all** — every finding triggers fix + codebase-wide scan
- **Record everything** — ambiguous items → decision journal, never silent skip
- **CLI-assisted** — delegate for multi-angle analysis
</purpose>

<boundary>
**范围内:** 目标代码的多维度深度审查 → 穷尽修复 ALL 发现（按 severity 递降）→ 泛化 pattern 到全项目
**范围外:** 深度根因调查 → `$odyssey-debug` | 需求实现 → `$odyssey-planex` | UI 视觉优化 → `$odyssey-ui`
**探索自由度:** 边界内自由探索 — 跨维度关联、追溯 git 历史、泛化扫描全项目。修复 ALL findings within fix_threshold（默认 all）。
**Zero-residual principle:** Every finding MUST have a concrete action (fix / issue / decision). "Report and shelve" and "pre-existing skip" are forbidden.
</boundary>

<context>
$ARGUMENTS — target and optional flags.

**Target resolution:**
| Input | Resolution |
|-------|-----------|
| File/dir path | Review those files |
| `HEAD` / `staged` | `git diff HEAD` / `git diff --staged` |
| Phase number | state.json → changed files |
| PR number | `git diff main...HEAD` |

**Flags:**
| Flag | Effect | Default |
|------|--------|---------|
| `--dimensions` | Comma-separated subset | correctness,security,performance,architecture |
| `--fix-threshold` | 修复到哪个 severity 为止 | `all` |
| `--skip-fix` | Skip S_FIX + S_CONFIRM | false |
| `--skip-generalize` | Skip S_GENERALIZE + S_DISCOVER | false |
| `--auto` `-y` `-c` `--heartbeat` | CLI auto / auto-confirm / resume / heartbeat | false |

**Session**: `.workflow/scratch/{YYYYMMDD}-review-odyssey-{slug}/`
**Output**: session.json, evidence.ndjson, explore.json, understanding.md (§1-§8)
**session.json unique fields**: `target`, `dimensions`, `review_result` (with `remaining_actionable`), `patterns[]`, `confirmation`, `generalization_stats`
**evidence.ndjson phases**: archaeology, explore, review, fix, discovery, decision, self-iteration

**phase_goals[]:**
| ID | Goal | Done When | Phase | skip_when |
|----|------|-----------|-------|-----------|
| G1 | Review completed | all dimensions reviewed | S_REVIEW | — |
| G2 | Explore context | explore.json populated | S_EXPLORE | — |
| G3 | Zero remaining | `remaining_actionable == 0` | S_CONFIRM | skip_fix |
| G4 | Pattern generalized | patterns[] ≥1 | S_GENERALIZE | skip_generalize |
| G5 | Discoveries triaged | all hits classified | S_DISCOVER | skip_generalize |
| G6 | Learnings persisted | spec entries or no actionable | S_RECORD | — |

### Pre-load
Specs: `maestro load --type spec --category review`。其余按 base Pre-load。

### Knowledge Persistence (S_RECORD → understanding.md §8)

S_RECORD writes actionable learnings to **understanding.md §8**, structured by category:

| Category | Content to Write | Suggested Follow-up |
|----------|-----------------|---------------------|
| Cross-dimension recurring pattern | Pattern description + affected dimensions + suggested coding standard | `$spec-add review "..."` |
| Security finding | Vulnerability type + trigger conditions + fix approach | `$spec-add debug "..."` |
| Architecture violation pattern | Violation description + correct boundary + verification method | `$spec-add arch "..."` |
| Reusable generalization pattern | Pattern signature + risk description + fix template | `$spec-add coding "..."` |

**Two-step model:** During execution, write to output files (temporary). After completion, user persists permanent knowledge via next_step_routing commands.
</context>

<invariants>
1. **Evidence append-only** — evidence.ndjson is the single source of truth for all findings; never delete or overwrite entries
2. **Session is state** — session.json holds current_state, phase_goals, progress_metrics; always update before advancing
3. **Phase goal tracking** — each phase MUST mark its goal done (or failed) before transition; skipping silently is forbidden
4. **Auto-commit per phase** — code changes + understanding.md committed after each phase; session.json/evidence.ndjson excluded from commits
5. **Zero silent drops** — every finding must have an action (fix/issue/decision); "noted for later" is not an action
</invariants>

<self_iteration>
**Quality Gate — auto-evaluate after each analytical phase (progress-aware):**

| Dimension | Sufficient | Insufficient |
|-----------|-----------|-------------|
| Coverage | All known related files/modules analyzed | Missed targets discoverable via grep/git log |
| Depth | ≥80% findings have file:line evidence | Most findings lack specifics |
| Actionability | Each conclusion has concrete next action | "Consider reviewing" without action |

**Progress-aware iteration (replaces fixed 3-round cap):**
- Phase complete → evaluate 3 dimensions + check `progress_metrics`
- Any insufficient AND `stale_count < 3` → re-enter with expansion strategy (must pass directions_tried dedup)
- Follow Stall Escalation Ladder: stale_count 0 = normal | 1 = switch perspective/tool | 2 = structural pivot | 3 = human escalation or INCONCLUSIVE

**Expansion strategies:**
- `scope_widen`: more directories, deeper git log, additional delegate angles
- `perspective_shift`: different CLI tool, reverse trace, manual reading
- `tool_switch`: switch to unused analysis tool
- `structural_pivot`: redefine problem framework, decompose sub-problems

**Exit:** all sufficient → advance | `stale_count >= 3` → log gaps, advance
**Log:** `evidence.ndjson {"phase":"self-iteration"}` + `session.json.self_iteration_log[]` + `directions_tried[]`

Applicable stages: S_ARCHAEOLOGY, S_EXPLORE, S_REVIEW, S_FIX, S_GENERALIZE
</self_iteration>

<csv_schema>

### Shared Output Schema
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "result_status": { "type": "string", "enum": ["completed", "failed"] },
    "findings": { "type": "string", "maxLength": 500 },
    "evidence": { "type": "string" },
    "error": { "type": "string" }
  },
  "required": ["id", "result_status", "findings"]
}
```

**Termination contract:** Call `report_agent_job_result` EXACTLY ONCE. Read-only. Do NOT modify source files, tasks.csv, wave-*.csv, results.csv, or call spawn_agents_on_csv.

### tasks.csv
```csv
id,title,description,task_type,dimension,deps,wave,status,findings,evidence,error
```

**Waves:**
| Wave | Tasks | Parallelism |
|------|-------|-------------|
| 1 | Archaeology (git-timeline, git-blame) | 2 agents |
| 2 | Review (correctness, security, performance, architecture) | 4 agents |
| 3 | Generalization (syntax-grep, semantic-scan, structural-match, historical-grep) | 4 agents |
</csv_schema>

<state_machine>
<states>
S_INTAKE → S_ARCHAEOLOGY → S_EXPLORE → S_REVIEW → S_FIX → S_CONFIRM → S_GENERALIZE → S_DISCOVER → S_RECORD → END
Skip: --skip-fix skips S_FIX+S_CONFIRM | --skip-generalize skips S_GENERALIZE+S_DISCOVER
</states>

<transitions>
S_INTAKE  → S_INTAKE (resume/-c) | S_ARCHAEOLOGY (target resolved) | request_user_input (no target)
S_REVIEW  → S_FIX (!skip_fix AND findings) | S_GENERALIZE (skip_fix/no findings, !skip_gen) | S_RECORD (both skip)
S_CONFIRM → S_GENERALIZE (confirmed, !skip_gen) | S_RECORD (confirmed, skip_gen) | S_FIX (needs_rework)
S_GENERALIZE → S_DISCOVER (hits) | S_RECORD (no hits)
S_DISCOVER → S_FIX (fixable sibling) | S_REVIEW (new target, loops < max) | S_RECORD (done or max_loops)
</transitions>

<actions>

### A_INTAKE
Parse target + flags → file list. Create SESSION_DIR, derive phase_goals[]. Search prior knowledge. Write session.json + §1. Display Goal Prompt.
📌 `"odyssey-review({slug}): INTAKE — 目标解析与上下文加载"`

### A_ARCHAEOLOGY
**spawn_agents_on_csv (Wave 1):**
```csv
"arch-timeline","Git Timeline","git log --oneline -20 -- {target_files}","archaeology","","","1","pending","","",""
"arch-blame","Git Blame","git blame on key regions of target files","archaeology","","","1","pending","","",""
```
```javascript
spawn_agents_on_csv({ csv_path: "tasks.csv", id_column: "id",
  instruction: ARCHAEOLOGY_INSTRUCTION + TERMINATION_CONTRACT,
  max_concurrency: 2, max_runtime_seconds: 300,
  output_csv_path: "wave-1-results.csv", output_schema: SHARED_OUTPUT_SCHEMA })
```
Merge → evidence.ndjson (phase: "archaeology"). CLI delegate `--role analyze`. Update §2.
📌 `"odyssey-review({slug}): ARCHAEOLOGY — git 考古分析"`

### A_EXPLORE
CLI delegate `--role explore` — call chains, error gaps, similar patterns. Write explore.json. Update §3. Mark G2.
📌 `"odyssey-review({slug}): EXPLORE — 代码探索完成"`

### A_REVIEW
**spawn_agents_on_csv (Wave 2):**
```csv
"rev-correct","Correctness","Logic errors, boundary conditions, null/undefined, race conditions","review","correctness","","2","pending","","",""
"rev-security","Security","Injection, XSS, CSRF, data exposure, auth bypass","review","security","","2","pending","","",""
"rev-perf","Performance","Hot paths, N+1, memory leaks, unnecessary recomputation","review","performance","","2","pending","","",""
"rev-arch","Architecture","Layer violations, circular deps, interface contracts, SoC","review","architecture","","2","pending","","",""
```
```javascript
spawn_agents_on_csv({ csv_path: "tasks.csv", id_column: "id",
  instruction: REVIEW_INSTRUCTION + TERMINATION_CONTRACT,
  max_concurrency: 4, max_runtime_seconds: 600,
  output_csv_path: "wave-2-results.csv", output_schema: SHARED_OUTPUT_SCHEMA })
```
Each returns `[{title, severity, file, line, description, suggestion, cwe}]`. Merge → evidence (review). Write review_result + §4 (severity matrix). Mark G1.
📌 `"odyssey-review({slug}): REVIEW — 多维度审查完成"`

### A_FIX
**穷尽迭代修复** — 按 severity 递降，直到 `remaining_actionable == 0`。

```
for tier in [critical, high, medium, low].filter(>= threshold):
  for each unfixed candidate: read ±20 → fix → evidence (fix)
  re-review modified area ("改进即标准"): new → append, continue (max 2/tier)
  tier done → auto-commit
```

Normal: request_user_input per tier. `-y`: auto-fix all.
Remaining > 0 → retry (no max_loops limit). Unchanged 2 rounds → classify each individually.
❌ Blanket "pre-existing" forbidden.
📌 per tier: `"odyssey-review({slug}): FIX-{tier} — {N}项修复"`

### A_CONFIRM
Run tests + CLI delegate zero-residual review (`--role review`).
- `remaining == 0 AND new == 0` → confirmed, mark G3
- Otherwise → needs_rework → S_FIX
Update confirmation + remaining_actionable + §5.
📌 `"odyssey-review({slug}): CONFIRM — 零遗留验证"`

### A_GENERALIZE
**spawn_agents_on_csv (Wave 3):**
```csv
"gen-syntax","Syntax Grep","Grep syntax-layer patterns across project","generalization","syntax","","3","pending","","",""
"gen-semantic","Semantic Scan","Check related modules for same anti-patterns","generalization","semantic","","3","pending","","",""
"gen-structural","Structural Match","Find structurally similar files, check for same issues","generalization","structural","","3","pending","","",""
"gen-historical","Historical Grep","git log -S pattern for introduction/fix history","generalization","historical","","3","pending","","",""
```
```javascript
spawn_agents_on_csv({ csv_path: "tasks.csv", id_column: "id",
  instruction: GENERALIZATION_INSTRUCTION + TERMINATION_CONTRACT,
  max_concurrency: 4, max_runtime_seconds: 600,
  output_csv_path: "wave-3-results.csv", output_schema: SHARED_OUTPUT_SCHEMA })
```
Pattern source: findings (severity >= medium).

**Cross-layer dedup:** multi-layer hits → boost confidence | single-layer → `needs_review` | historically fixed → `regression_risk`
**Iterative deepening:** module with ≥3 hits → targeted deep scan (max 1 round)
**Persist:** understanding.md §6 generalization section + `session.json.generalization_stats`

Mark G4.
📌 `"odyssey-review({slug}): GENERALIZE — 泛化扫描完成"`

### A_DISCOVER
1. **Triage** each scan hit with ±10 lines context → classify as `bug` / `risk` / `safe`
2. **Route:**
   - bug + fix_template directly applicable → **immediate fix** → back to S_FIX
   - bug + needs cross-module decision or no fix_template → create issue (with fix suggestion + impact analysis)
   - risk → evaluate if guard can be added directly; if yes → fix; if no → create issue
   - safe → skip
   **Normal**: request_user_input for routing. **`-y`**: auto-fix bugs with fix_template, create issue for rest
3. **Cross-phase loop tracking:** `cross_phase_loops++`. At `loops >= max_loops` → MUST record per-item reasons (blanket "historical legacy" is forbidden)
4. Append evidence (phase: "discovery" + "decision"). Update understanding.md §7.
Mark G5.
📌 `"odyssey-review({slug}): DISCOVER — 发现分类完成"`

### A_RECORD
1. Finalize understanding.md §8 — write learnings structured by Knowledge Persistence table categories. For each category, write: pattern description + affected dimensions/context + fix approach + detection method.
2. Mark G6 done. Pending decisions: **Normal** → request_user_input per item | **`-y`** → skip, show deferred count
3. **Goal audit:** check all `phase_goals[*].completion_confirmed`. All confirmed → `phase_goals_all_done = true`. Incomplete: **Normal** → request_user_input (accept/reject/skip each) | **`-y`** → auto accept
4. Set `current_state = "COMPLETED"`

```
--- REVIEW-TEST-FIX ODYSSEY COMPLETE ---
Target:     {target}          Dimensions: {dims}
Findings:   {C}C {H}H {M}M {L}L    Fix: {fixed}, confirmed={yes|skip}
Patterns:   {N} ({by_layer})        Scan hits: {total} ({cross} cross-layer)
Issues: {N}  Decisions: {N}r/{M}p/{K}d  Learnings: {N}  Self-iter: {N}×{M}
Goals:  {done}/{total} ({skipped} skipped)
---
```
📌 `"odyssey-review({slug}): RECORD — 会话总结与知识沉淀"`

</actions>

<appendix>

### Goal Prompt
```
📋 Review-Test-Fix Odyssey 会话已创建。可随时复制以下 /goal：

/goal 完成以下目标：
{for each G in phase_goals where status != "skipped":}
- {G.id}: {G.goal} — {G.done_when}
{end for}
穷尽迭代：review_result.remaining_actionable == 0 且 confirmation == confirmed 且 phase_goals_all_done。
修复按 severity 逐轮迭代，每轮 re-review 修改区域，新问题追加继续。
每个 finding 必须有 action（fix/issue/decision），decision pending 必须 request_user_input。
```

### `-y` (7 decision points)
| Decision Point | Normal | `-y` |
|----------------|--------|------|
| S_FIX tier candidates | request_user_input | auto-fix, `deferred` |
| S_FIX re-review new | request_user_input | auto-append |
| S_CONFIRM needs_rework | Display → S_FIX | auto proceed |
| S_DISCOVER bug routing | request_user_input | auto-fix 有 fix_template 的，其余 create issue |
| S_DISCOVER ambiguous | request_user_input | all `deferred` |
| S_RECORD decisions | request_user_input | skip |
| S_RECORD goal audit | request_user_input | auto accept |

</appendix>
</state_machine>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No target specified | Provide target |
| E002 | error | Target path not found | Check path |
| W001 | warning | No git history | Proceed |
| W002 | warning | Some dimension agents failed | Partial coverage |
</error_codes>

<success_criteria>
- [ ] All dimensions reviewed, ALL findings fixed (remaining_actionable == 0), zero-residual confirmed
- [ ] Per-tier re-review gate; every unfixed finding individually classified
- [ ] Generalized with multi-layer scan (unless --skip-generalize); self-iteration on insufficient
- [ ] understanding.md §1-§8, phase_goals G1-G6 audited, Goal Prompt once, `-y` no blocking, -c resumable
</success_criteria>

<next_step_routing>
| Condition | Next step |
|-----------|-----------|
| Deeper debug needed | `$odyssey-debug "<finding>"` |
| Issues created | `$manage-issue list --source review-odyssey` |
| Pattern to document | `$learn-decompose <module>` |
| Plan fixes | `$maestro-plan --gaps` |
</next_step_routing>
