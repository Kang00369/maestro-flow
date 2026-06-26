---
name: odyssey-ui
description: "Long-running UI optimization cycle — visual survey, multi-dimensional audit, divergent exploration, fix, verify, generalize, and design knowledge persistence"
argument-hint: '"<target>" [--dimensions <list>] [--skip-fix] [--skip-generalize] [--auto] [-y] [-c] [--heartbeat]'
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, request_user_input
---

<base>@~/.maestro/workflows/odyssey-base-codex.md</base>

<purpose>
Deep UI polish cycle: survey → 6-dimension audit → divergent creative exploration →
fix → verify → generalize → discover → persist. Every pixel is a learning opportunity.

Core philosophy:
- **Every pixel tells a story** — subtle details create the experience
- **Diverge before converge** — explore creatively, then implement methodically
- **Find one, polish all** — a single improvement reveals a class of opportunities
- **Browser is truth** — verify in real rendering, not just code

**三句哲学约束（穷尽迭代）:**
1. **零遗留** — 每个 finding/idea 必须是 action item（修复 / issue / 决策），不允许只报告不处理
2. **穷尽迭代** — 按 impact×severity 递降逐轮修复，直到 0 remaining actionable 才退出 fix loop
3. **改进即标准** — 每次修复后重审同区域，发现新视觉问题继续修，直到该区域无可改善
</purpose>

<boundary>
**范围内:** 目标组件/页面的视觉体验优化 — 审查 6 维度 → 发散探索 → 修复 → 泛化到兄弟组件
**范围外:** 后端逻辑 / 数据模型 / API 设计 / 业务规则 → `$odyssey-planex` | 深度 bug 调查 → `$odyssey-debug` | 代码质量审查 → `$odyssey-review-test-fix`
**探索自由度:** 边界内最大自由 — S_DIVERGE 阶段鼓励发散思维，不设创意上限。审查 + 发散可发现任何视觉/交互/可访问性细节。在约束下尽可能完善每个像素。
**Zero-residual principle:** Every finding/idea MUST have a concrete action (fix / issue / decision). "Report and shelve" is not allowed. "Pre-existing design debt" is not a valid skip reason — if discovered within scope, it must be addressed.
⚠️ **Decision gate** — ONLY these qualify as decisions (not fixes):
  - Brand/style direction requiring human creative judgment
  - Layout restructuring that changes user flow significantly
  - Requires new design tokens or breaking component API
❌ "Unsure how to fix", "Large scope", "Pre-existing issue" are NOT valid decision reasons — either fix it, or explain specifically why it's unfixable
</boundary>

<context>
$ARGUMENTS — target and optional flags.

**Target resolution:** Component path → audit component | Page/route → audit page | `staged`/`HEAD` → diff UI changes | Feature area → resolve to components/pages

**Flags:**
| Flag | Effect | Default |
|------|--------|---------|
| `--dimensions <list>` | Comma-separated subset of 6 dimensions | all 6 |
| `--fix-threshold <severity>` | 修复到哪个 severity 为止 | all |
| `--skip-fix` | Audit + diverge only, no code changes | false |
| `--skip-generalize` | Skip S_GENERALIZE and S_DISCOVER | false |
| `--auto` | CLI delegates without confirmation | false |
| `-y` | Auto-confirm all decisions (see appendix) | false |
| `-c` | Resume most recent session | — |
| `--heartbeat` | Enable heartbeat progress reporting | false |

**Session**: `SESSION_DIR = .workflow/scratch/{YYYYMMDD}-ui-odyssey-{slug}/`

**Output — 3 files:** `session.json` (state + audit/diverge results + patterns + phase_goals) | `evidence.ndjson` (phases: survey, audit, diverge, fix, discovery, decision, self-iteration) | `understanding.md` (8-section narrative)

**session.json unique fields:** `target`, `dimensions`, `audit_result` {dimensions_audited, finding_count, severity_distribution}, `diverge_result` {improvements_proposed, creative_ideas}, `patterns[]` (schema 见 base, `source` 值为 `finding`), `confirmation` {test_result, cli_review, overall}, `generalization_stats` (schema 见 base)

**phase_goals[]:**
| ID | Goal | Phase | skip_when |
|----|------|-------|-----------|
| G1 | Survey completed | S_SURVEY | — |
| G2 | Audit completed | S_AUDIT | — |
| G3 | Divergent exploration done | S_DIVERGE | — |
| G4 | Zero remaining: all findings/ideas fixed and verified | S_VERIFY | skip_fix |
| G5 | Pattern generalized | S_GENERALIZE | skip_generalize |
| G6 | Discoveries triaged | S_DISCOVER | skip_generalize |
| G7 | Learnings persisted | S_RECORD | — |

**understanding.md:** §1 Target & Design Context | §2 Survey | §3 Audit | §4 Diverge | §5 Verify | §6 Generalize | §7 Discover | §8 Learnings

### Pre-load（可选，缺失不阻塞）
ARCHITECTURE.md | `maestro search "<target>" --json` (top 5) | `maestro load --type spec --category ui` | `maestro load --type spec --category coding` | `maestro search --category ui` → load knowhow | Glob prior sessions

### Knowledge Persistence（S_RECORD 写入 understanding.md §8）
| 分类 | 写入内容 | 后续建议命令 |
|------|---------|-------------|
| 设计 pattern | 组件模式 + 适用场景 + token 引用 | `/spec-add ui "..."` |
| 交互规范 | 状态定义 + 转场规则 + 反馈模式 | `/spec-add ui "..."` |
| 可访问性规则 | WCAG 要求 + 实现方案 | `/spec-add ui "..."` |
| 可复用泛化 pattern | pattern 签名 + 应用范围 | `/spec-add coding "..."` |
</context>

<csv_schema>

### Shared Output Schema (all waves)
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
| 1 | Survey (design-tokens-audit, pattern-inventory) | 2 agents |
| 2 | Audit (visual-hierarchy, interaction-states, accessibility, responsiveness, micro-interactions, edge-cases) | 6 agents |
| 3 | Diverge (polish-agent, delight-agent) | 2 agents |
| 4 | Generalization (syntax-grep, semantic-scan, structural-match, historical-grep) | 4 agents |
</csv_schema>

<invariants>
1. **Evidence append-only** — evidence.ndjson is the single source of truth for all findings; never delete or overwrite entries
2. **Session is state** — session.json holds current_state, phase_goals, progress_metrics; always update before advancing
3. **Phase goal tracking** — each phase MUST mark its goal done (or failed) before transition; skipping silently is forbidden
4. **Auto-commit per phase** — code changes + understanding.md committed after each phase; session.json/evidence.ndjson excluded from commits
5. **Zero silent drops** — every finding must have an action (fix/issue/decision); "noted for later" is not an action
6. **Browser is truth** — verify in real rendering, not just code review
7. **Diverge before converge** — explore creatively first, then implement methodically
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

Applicable stages: S_SURVEY, S_AUDIT, S_DIVERGE, S_GENERALIZE
</self_iteration>

<state_machine>

<states>
S_INTAKE     — Parse target, load design context, resume session           PERSIST: session.json + understanding.md §1
S_SURVEY     — Visual landscape: design tokens, pattern inventory          PERSIST: evidence.ndjson (survey) + understanding.md §2
S_AUDIT      — 6-dimension parallel review                                 PERSIST: evidence.ndjson (audit) + understanding.md §3
S_DIVERGE    — Divergent creative exploration: polish + delight            PERSIST: evidence.ndjson (diverge) + understanding.md §4
S_FIX        — Implement improvements (skip if --skip-fix)                 PERSIST: code changes + evidence.ndjson (fix)
S_VERIFY     — Visual verification + test (skip if --skip-fix)             PERSIST: session.json.confirmation + understanding.md §5
S_GENERALIZE — Pattern extraction + 4-agent scan (skip if --skip-gen)      PERSIST: session.json.patterns + understanding.md §6
S_DISCOVER   — Classify hits, create issues (skip if --skip-gen)           PERSIST: evidence.ndjson (discovery|decision) + understanding.md §7
S_RECORD     — Design knowledge persistence + final report                 PERSIST: understanding.md §8 + spec entries
</states>

<transitions>
S_INTAKE:
  → S_INTAKE      WHEN -c + session found        DO A_RESUME
  → S_SURVEY      WHEN target resolved            DO A_INTAKE
  → S_INTAKE      WHEN no target                  DO request_user_input

S_SURVEY       → S_AUDIT        DO A_SURVEY
S_AUDIT        → S_DIVERGE      DO A_AUDIT

S_DIVERGE:
  → S_FIX          WHEN !skip_fix AND actionable findings/ideas           DO A_DIVERGE
  → S_GENERALIZE   WHEN (skip_fix OR no actionable) AND !skip_gen        DO A_DIVERGE
  → S_RECORD       WHEN (skip_fix OR no actionable) AND skip_gen         DO A_DIVERGE

S_FIX          → S_VERIFY       DO A_FIX
S_VERIFY:
  → S_GENERALIZE   WHEN verified AND !skip_gen    DO A_VERIFY
  → S_RECORD       WHEN verified AND skip_gen     DO A_VERIFY
  → S_FIX          WHEN needs_rework              DO A_VERIFY

S_GENERALIZE:
  → S_DISCOVER     WHEN hits found                DO A_GENERALIZE
  → S_RECORD       WHEN no hits                   DO A_GENERALIZE

S_DISCOVER → S_AUDIT  : new component to audit → cross_phase_loops++
S_DISCOVER → S_FIX    : fixable sibling, !skip_fix → cross_phase_loops++
S_DISCOVER → S_RECORD : remaining_actionable == 0 OR loops >= max_loops (MUST log each unfixed item)

S_RECORD   → END      DO A_RECORD
</transitions>

<actions>

### A_INTAKE
1. Parse arguments: target, flags, `--dimensions` subset
2. Generate slug, create `SESSION_DIR`
3. Pre-load: `maestro search` + Glob prior sessions + ARCHITECTURE.md + spec load ui/coding
4. Derive `phase_goals[]` from flags (apply `skip_when`)
5. Write `session.json` + `understanding.md` §1
6. Emit Goal Prompt (see Appendix)
📌 `git commit -m "odyssey-ui({slug}): INTAKE — 目标解析"`

### A_RESUME
Find latest session via Glob → read `session.json` → display summary → jump to `current_state`.

### A_SURVEY
**spawn_agents_on_csv (Wave 1):**

Write `tasks.csv` with Wave 1 rows:
```csv
"survey-tokens","Design Token Audit","Scan {target_files} for CSS variables, design tokens, theme values. Return [{token,usage_count,consistency,file,line}].","survey","","","1","pending","","",""
"survey-patterns","Pattern Inventory","Catalog component patterns, layout, spacing, typography in {target_files}. Return [{pattern,files,consistency}].","survey","","","1","pending","","",""
```
`spawn_agents_on_csv({ csv_path:"tasks.csv", max_concurrency:2, max_runtime_seconds:300, output_csv_path:"wave-1-results.csv", output_schema:SHARED_OUTPUT_SCHEMA })`

Merge → evidence.ndjson (phase: "survey"). Update §2. Mark G1 done.
📌 `git commit -m "odyssey-ui({slug}): SURVEY — 视觉调查"`

### A_AUDIT
**spawn_agents_on_csv (Wave 2)** — 6 agents (one per dimension, or `--dimensions` subset):

Append Wave 2 rows to `tasks.csv`:
```csv
"audit-hierarchy","Visual Hierarchy","Spacing, typography scale, contrast, alignment, whitespace, visual weight","audit","visual-hierarchy","","2","pending","","",""
"audit-interaction","Interaction States","hover/focus/active/disabled/loading/error/empty/selected states","audit","interaction-states","","2","pending","","",""
"audit-a11y","Accessibility","WCAG AA contrast, focus mgmt, aria, keyboard nav, screen reader","audit","accessibility","","2","pending","","",""
"audit-responsive","Responsiveness","Breakpoints, overflow, touch targets >=44px, fluid typography","audit","responsiveness","","2","pending","","",""
"audit-motion","Micro-interactions","Transitions, animations, feedback, loading states, scroll behavior","audit","micro-interactions","","2","pending","","",""
"audit-edge","Edge Cases","Long text, empty data, error states, extreme values, i18n, RTL","audit","edge-cases","","2","pending","","",""
```
`spawn_agents_on_csv({ csv_path:"tasks.csv", max_concurrency:6, max_runtime_seconds:600, output_csv_path:"wave-2-results.csv", output_schema:SHARED_OUTPUT_SCHEMA })`

Each returns `[{title, severity, file, line, description, suggestion, dimension}]`.
Merge → evidence (phase: "audit"). Write `audit_result` with dimensions, finding count, severity distribution. Update §3 (severity matrix). Mark G2 done.
📌 `git commit -m "odyssey-ui({slug}): AUDIT — 多维审查"`

### A_DIVERGE
**spawn_agents_on_csv (Wave 3)** — 2 agents:

Append Wave 3 rows to `tasks.csv`:
```csv
"diverge-polish","Polish Agent","Missing subtle details: shadows, borders, transitions, hover feedback, empty states, skeleton loading, scroll behavior. Return [{idea,category:'polish',impact,effort,description}].","diverge","","","3","pending","","",""
"diverge-delight","Delight Agent","What makes this memorable: motion design, progressive disclosure, smart defaults, celebratory feedback, personality. Return [{idea,category:'delight',impact,effort,description}].","diverge","","","3","pending","","",""
```
`spawn_agents_on_csv({ csv_path:"tasks.csv", max_concurrency:2, max_runtime_seconds:300, output_csv_path:"wave-3-results.csv", output_schema:SHARED_OUTPUT_SCHEMA })`

**Optional CLI delegate** for creative review:
```bash
maestro delegate "PURPOSE: Creative UI review for: {target}
TASK: Identify polish opportunities | Suggest delight moments | Evaluate visual rhythm
MODE: analysis  CONTEXT: @{target_files} | Survey: {token_summary} | Audit: {top_findings}
EXPECTED: JSON [{idea, category, impact, effort, description}]
CONSTRAINTS: User-perceptible improvements only
" --role analyze --mode analysis
```
Execute with `run_in_background: true`, then wait for callback.

Consolidate: audit findings + divergent ideas → prioritized improvement list (impact/effort matrix). Write `diverge_result`. Append evidence (phase: "diverge"). Update §4. Mark G3 done.
📌 `git commit -m "odyssey-ui({slug}): DIVERGE — 发散探索"`

### A_FIX
Skip if `--skip-fix`.
1. **穷尽修复**: ALL findings/ideas by priority tier (critical→high→medium→low + high-impact ideas). After each tier, re-review — new findings append.
2. Each fix → evidence (phase: "fix")
3. **Normal**: request_user_input per-fix. **`-y`**: auto-proceed, record `deferred`.
📌 `git commit -m "odyssey-ui({slug}): FIX — 优化实现"`

### A_VERIFY
1. Run tests (lint, unit, visual regression)
2. **CLI-assisted**: `maestro delegate` with `--role review` — visual correctness, interaction states, accessibility, responsive
3. `needs_rework` → S_FIX. `verified` → mark G4 done. Update §5, write `confirmation`.
📌 `git commit -m "odyssey-ui({slug}): VERIFY — 验证"`

### A_GENERALIZE
Skip if `--skip-generalize`. Pattern 来源: audit findings + diverge ideas (severity >= medium OR impact = high)。

**3-layer pattern extraction** from audit findings + diverge ideas (severity >= medium OR impact = high):

| Layer | Method | Example |
|-------|--------|---------|
| Syntax | Regex → Grep | Inline styles, hardcoded colors, missing tokens |
| Semantic | Agent understands anti-pattern → scan | Missing interaction states, inconsistent spacing |
| Structural | File/module structure similarity | Same component structure missing same states |

Write `session.json.patterns[]` (source = `finding`).

**Wave 4 — 4-agent scan (spawn_agents_on_csv):**

Append Wave 4 rows to `tasks.csv`:
```csv
"gen-syntax","Syntax Grep","Grep CSS/style patterns matching '${signatures}' across project","generalization","syntax","","4","pending","","",""
"gen-semantic","Semantic Scan","Find components with same interaction pattern but missing states","generalization","semantic","","4","pending","","",""
"gen-structural","Structural Match","Find structurally similar components, check for same issues","generalization","structural","","4","pending","","",""
"gen-historical","Historical Grep","git log -S '${signature}' for UI pattern history","generalization","historical","","4","pending","","",""
```
`spawn_agents_on_csv({ csv_path:"tasks.csv", max_concurrency:4, max_runtime_seconds:600, output_csv_path:"wave-4-results.csv", output_schema:SHARED_OUTPUT_SCHEMA })`

**Cross-layer dedup:** multi-layer hits → boost confidence | single-layer → `needs_review` | historically fixed → `regression_risk`
**Iterative deepening:** module with ≥3 hits → targeted deep scan (max 1 round)
**Persist:** understanding.md §6 generalization section + `session.json.generalization_stats`

Update §6. Mark G5 done.
📌 `git commit -m "odyssey-ui({slug}): GENERALIZE — 泛化扫描"`

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
Mark G6 done.
📌 `git commit -m "odyssey-ui({slug}): DISCOVER — 发现分类"`

### A_RECORD
1. Finalize understanding.md §8 — write learnings structured by Knowledge Persistence table categories. For each category, write: component pattern/interaction rule + applicable scenarios + token references + detection method. Completion summary lists suggested `/spec-add` commands.
2. Mark G7 done. Pending decisions: **Normal** → request_user_input per item | **`-y`** → skip, show deferred count
3. **Goal audit:** check all `phase_goals[*].completion_confirmed`. All confirmed → `phase_goals_all_done = true`. Incomplete: **Normal** → request_user_input (accept/reject/skip each) | **`-y`** → auto accept
4. Set `current_state = "COMPLETED"`. Emit completion summary:
```
--- UI ODYSSEY COMPLETE ---
Target: {target} | Dimensions: {dimensions_audited}
Findings: {C}C {H}H {M}M {L}L | Diverge: {improvements} polish + {creative} delight
Fix: {fixed_count} applied, verified={yes|skipped}
Patterns: {extracted} ({by_layer}) | Scan hits: {total} ({cross_layer} cross-layer)
Issues: {N} | Decisions: {N} resolved, {M} pending, {K} deferred
Learnings: {N} entries | Self-iter: {N} rounds | Goals: {done}/{total} ({skipped} skipped)
---
```
📌 `git commit -m "odyssey-ui({slug}): RECORD — 会话总结"`

</actions>

<appendix>

### Goal Prompt Template
**⚠️ 仅在 A_INTAKE 完成后显示一次。A_RECORD 完成时禁止重新显示。**

```
📋 UI Odyssey 会话已创建。可随时复制以下 /goal 设定终止条件：

/goal 完成以下目标：
{for each G in phase_goals where status != "skipped":}
- {G.id}: {G.goal} — 完成条件: {G.done_when}
{end for}
穷尽迭代：直到 audit + diverge findings 均已处理（fix/issue/decision）
且 phase_goals_all_done=true 才停。修复按 impact×severity 逐轮迭代。
每轮修复后重审修改区域，新发现追加继续修。
遇到 phase=decision 的 pending 必须 request_user_input。不允许"只报告不处理"。
```

### `-y` Auto-Confirm (5 decision points)
| Decision Point | Normal | `-y` |
|----------------|--------|------|
| A_FIX improvement confirmation | request_user_input | auto-proceed, `deferred` |
| A_DISCOVER hit routing | request_user_input | auto-fix 有 fix_template 的，其余 create issue |
| A_DISCOVER ambiguous items | request_user_input | all `deferred` |
| A_RECORD pending decisions | request_user_input | skip, show deferred count |
| A_RECORD goal audit | request_user_input | auto accept |

`deferred` → "待决策" in completion summary; recoverable via `-c`.

</appendix>

</state_machine>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No target specified | Provide target |
| E002 | error | Target path not found | Check path |
| W001 | warning | No design system detected | Proceed with defaults |
| W002 | warning | Some dimension agents failed | Partial coverage |
</error_codes>

<success_criteria>
- [ ] 6-dimension audit with severity matrix + divergent exploration (polish + delight)
- [ ] Improvements implemented and verified (unless --skip-fix)
- [ ] Multi-layer generalization + discoveries classified (unless --skip-generalize)
- [ ] Every unfixed finding has individual classification and reason
- [ ] understanding.md §8 finalized; phase_goals G1-G7 tracked; `-y` no blocking prompts
</success_criteria>

<next_step_routing>
| Condition | Next step |
|-----------|-----------|
| Finding needs deeper debug | `$odyssey-debug "<finding>"` |
| Issues created from discoveries | `/manage-issue list --source ui-odyssey` |
| Design pattern worth documenting | `/spec-add ui "..."` |
| Want full review of changes | `$odyssey-review-test-fix <changed-files>` |
| Sibling components to polish | `$odyssey-ui "<sibling>"` |
</next_step_routing>
