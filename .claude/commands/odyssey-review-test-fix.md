---
name: odyssey-review-test-fix
description: Deep review + fix cycle — archaeology, exploration, multi-dimensional review, targeted fix, generalization, discovery, and knowledge persistence
argument-hint: "<target> [--dimensions <list>] [--fix-threshold critical|high|medium|low|all] [--skip-fix] [--skip-generalize] [--auto] [-y] [-c] [--heartbeat]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---
<base>@~/.maestro/workflows/odyssey-base.md</base>

<purpose>
Deep code review with exhaustive fix: archaeology → explore → multi-dimensional review →
fix ALL findings → confirm → generalize → discover → persist. Zero-residual philosophy.
</purpose>

<boundary>
**范围内:** 目标代码的多维度深度审查 → 穷尽修复 ALL 发现（按 severity 递降）→ 泛化 pattern 到全项目
**范围外:** 深度根因调查 → `/odyssey-debug` | 需求实现 → `/odyssey-planex` | UI 视觉优化 → `/odyssey-ui`
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
| Cross-dimension recurring pattern | Pattern description + affected dimensions + suggested coding standard | `/spec-add review "..."` |
| Security finding | Vulnerability type + trigger conditions + fix approach | `/spec-add debug "..."` |
| Architecture violation pattern | Violation description + correct boundary + verification method | `/spec-add arch "..."` |
| Reusable generalization pattern | Pattern signature + risk description + fix template | `/spec-add coding "..."` |

**Two-step model:** During execution, write to output files (temporary). After completion, user persists permanent knowledge via next_step_routing commands.
</context>

<invariants>
1. **Evidence append-only** — evidence.ndjson is the single source of truth; never delete or overwrite
2. **Session is state** — session.json holds current_state, phase_goals, progress_metrics; always update before advancing
3. **Phase goal tracking** — each phase MUST mark its goal done (or failed) before transition
4. **Auto-commit per phase** — code changes + understanding.md committed; session.json/evidence.ndjson excluded
5. **Zero silent drops** — every finding must have an action (fix/issue/decision)
</invariants>

<self_iteration>
**Quality Gate — auto-evaluate after each analytical phase (progress-aware):**

| Dimension | Sufficient | Insufficient |
|-----------|-----------|-------------|
| Coverage | All known related files/modules analyzed | Missed targets discoverable via grep/git log |
| Depth | ≥80% findings have file:line evidence | Most findings lack specifics |
| Actionability | Each conclusion has concrete next action | "Consider reviewing" without action |

**Progress-aware iteration:** evaluate 3 dimensions + progress_metrics → insufficient + stale_count < 3 → re-enter with expansion strategy (scope_widen/perspective_shift/tool_switch/structural_pivot, must pass directions_tried dedup) → stale_count >= 3 → log gaps, advance

Applicable stages: S_ARCHAEOLOGY, S_EXPLORE, S_REVIEW, S_FIX, S_GENERALIZE
</self_iteration>

<state_machine>
<states>
S_INTAKE → S_ARCHAEOLOGY → S_EXPLORE → S_REVIEW → S_FIX → S_CONFIRM → S_GENERALIZE → S_DISCOVER → S_RECORD → END
Skip: --skip-fix skips S_FIX+S_CONFIRM | --skip-generalize skips S_GENERALIZE+S_DISCOVER
</states>

<transitions>
S_INTAKE  → S_INTAKE (resume/-c) | S_ARCHAEOLOGY (target resolved) | AskUserQuestion (no target)
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
`git log --oneline -20` + `git blame` on key regions. CLI delegate `--role analyze`. Append evidence (archaeology). Update §2.
📌 `"odyssey-review({slug}): ARCHAEOLOGY — git 考古分析"`

### A_EXPLORE
CLI delegate `--role explore` — call chains, error gaps, similar patterns. Write explore.json. Update §3. Mark G2.
📌 `"odyssey-review({slug}): EXPLORE — 代码探索完成"`

### A_REVIEW
Spawn N parallel Agents (one per dimension):
- **Correctness**: logic errors, boundary conditions, null/undefined, race conditions
- **Security**: injection, XSS, CSRF, data exposure, auth bypass
- **Performance**: hot paths, N+1, memory leaks, unnecessary recomputation
- **Architecture**: layer violations, circular deps, interface contracts, SoC

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

Normal: AskUserQuestion per tier. `-y`: auto-fix all.
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
Pattern source: findings (severity >= medium). 3-layer extraction (syntax/semantic/structural) → 4 parallel Agents → cross-layer dedup (multi-layer → boost | single-layer → `needs_review` | historically fixed → `regression_risk`) → iterative deepening (module ≥3 hits → deep scan, max 1 round). Persist: understanding.md §6 + `session.json.generalization_stats`. Mark G4.
📌 `"odyssey-review({slug}): GENERALIZE — 泛化扫描完成"`

### A_DISCOVER
1. **Triage** each scan hit with ±10 lines context → classify `bug` / `risk` / `safe`
2. **Route:** bug + fix_template → immediate fix → S_FIX | bug + no template → create issue | risk → add guard if possible | safe → skip. **Normal**: AskUserQuestion | **`-y`**: auto-fix with template, create issue for rest
3. `cross_phase_loops++`. At `loops >= max_loops` → MUST record per-item reasons. Update §7.
Mark G5.
📌 `"odyssey-review({slug}): DISCOVER — 发现分类完成"`

### A_RECORD
1. Finalize understanding.md §8 — write learnings structured by Knowledge Persistence table. For each category: pattern description + context + fix approach + detection method.
2. Mark G6 done. Pending decisions: **Normal** → AskUserQuestion | **`-y`** → skip, show deferred count
3. **Goal audit:** all `phase_goals[*].completion_confirmed` → `phase_goals_all_done = true`. Incomplete: **Normal** → AskUserQuestion | **`-y`** → auto accept
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
每个 finding 必须有 action（fix/issue/decision），decision pending 必须 AskUserQuestion。
```

### `-y` (7 decision points)
| Decision Point | Normal | `-y` |
|----------------|--------|------|
| S_FIX tier candidates | AskUserQuestion | auto-fix, `deferred` |
| S_FIX re-review new | AskUserQuestion | auto-append |
| S_CONFIRM needs_rework | Display → S_FIX | auto proceed |
| S_DISCOVER bug routing | AskUserQuestion | auto issue, `deferred` |
| S_DISCOVER ambiguous | AskUserQuestion | all `deferred` |
| S_RECORD decisions | AskUserQuestion | skip |
| S_RECORD goal audit | AskUserQuestion | auto accept |

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
| Deeper debug needed | `/odyssey-debug "<finding>"` |
| Issues created | `/manage-issue list --source review-odyssey` |
| Pattern to document | `/learn-decompose <module>` |
| Plan fixes | `/maestro-plan --gaps` |
</next_step_routing>
