# Quality Pipeline Guide

Complete reference for the Maestro quality pipeline, covering seven commands and their closed-loop flow from code review through phase retrospective.

---

## 1. Overview

The quality pipeline is the verification and improvement system that runs after Phase execution. Seven commands are organized around a **"Review -> Test -> Debug -> Refactor -> Retrospective"** closed loop. Each command has clearly defined input artifacts, output artifacts, and next-step routing:

| Command | Purpose | Core Question | Artifact ID |
|----------|---------|---------------|-------------|
| `quality-review` | Multi-level code review | Does code quality meet standards? | `REV-{NNN}` |
| `quality-test` | Conversational UAT | Does it work from the user's perspective? | `TST-{NNN}` |
| `quality-auto-test` | Unified automated testing | Do coverage and regression checks pass? | `TST-{NNN}` |
| `quality-debug` | Hypothesis-driven debugging | What is the root cause? | `DBG-{NNN}` |
| `quality-refactor` | Reflection-driven refactoring | Is technical debt converging? | `WBR-{NNN}` |
| `quality-sync` | Documentation synchronization | Are docs consistent with code? | -- |
| `quality-retrospective` | Phase retrospective | What insights are reusable? | `INS-{8hex}` |

**Core Design Principles:**

- **Artifact-driven**: Each command produces structured artifacts (JSON + Markdown) under `.workflow/scratch/`, which subsequent commands can consume
- **Automatic routing**: Upon completion, commands automatically recommend the next step based on results, forming a closed loop
- **Session persistence**: Session state for `quality-test`, `quality-debug`, and `quality-auto-test` can be restored across context resets
- **Knowledge feedback**: `quality-retrospective` routes insights to the spec, issue, and knowhow systems to prevent recurring mistakes

---

## 2. Command Reference

### 2.1 quality-review -- Multi-Level Code Review

A multi-dimensional code review command that answers "how is the code quality?" It complements `maestro-verify` (whether goals are met) and `quality-test` (whether the user perspective is correct).

#### Invocation

```bash
/quality-review <phase> [--level quick|standard|deep] [--dimensions security,architecture,...] [--skip-specs]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `<phase>` | Required. Phase number or slug |
| `--level` | Review level: `quick` / `standard` / `deep`. Default: auto-detected |
| `--dimensions` | Comma-separated review dimensions. Overrides level defaults |
| `--skip-specs` | Skip loading project specs as review context |

#### Three-Level Review Mechanism

- **Quick**: Inline review for a small number of files, suitable for minor changes
- **Standard**: Medium scale. Uses parallel agents per dimension, auto-triggers deep-dives
- **Deep**: Large-scale changes. Forces deep-dive iterations with multiple aggregation rounds

The review level is auto-detected based on the number of changed files by default, or explicitly specified via `--level`.

#### Artifact Path and Format

```
.workflow/scratch/{YYYYMMDD}-review-P{N}-{slug}/
  review.json          # findings, severity distribution, verdict
```

Review results include a three-level verdict:

| Verdict | Meaning | Next-Step Routing |
|---------|---------|-------------------|
| `PASS` | All dimensions passed | `/quality-test {phase}` |
| `WARN` | Non-critical issues exist; can proceed | `/quality-test {phase}` (with warnings) |
| `BLOCK` | Critical issues found; must be fixed | `/maestro-plan {phase} --gaps` |

#### Context Consumption

`quality-review` automatically loads preceding artifacts from the same Phase:

- **execute** artifacts: `.summaries/`, `.task/`, `verification.json` (source of reviewed code)
- **review** artifacts: `review.json` (incremental comparison, avoids duplicate reviews)
- **debug** artifacts: `understanding.md`, `evidence.ndjson` (confirmed root causes as review leads)
- **test** artifacts: `uat.md`, `.tests/` (issues discovered from the user side)

#### Artifact Registration

Upon completion, the command registers in `state.json.artifacts[]`:

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

### 2.2 quality-test -- Conversational UAT

A user acceptance testing command that extracts test scenarios from verification criteria, executes them one by one in an interactive Q&A format, records pass/fail results, and automatically infers severity.

#### Invocation

```bash
/quality-test [phase] [--smoke] [--auto-fix]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `[phase]` | Optional. Phase number |
| `--smoke` | Inject basic smoke tests before UAT |
| `--auto-fix` | Auto-trigger gap-fix loop (verify -> plan --gaps -> execute -> re-verify, max 2 rounds) |

#### Conversational Test Flow

1. **Scenario generation**: Extract verification criteria from `verification.json` and generate test scenarios
2. **Source consolidation**: Merge spec tool steps (`source: "tool"`), review findings (`source: "review_finding"`), debug root causes (`source: "debug_root_cause"`)
3. **Per-scenario interaction**: Display expected behavior for each scenario; user provides natural-language feedback
4. **Severity inference**: Automatically infer blocker/major/minor/cosmetic from the user's natural language without prompting
5. **Auto-diagnosis**: When issues are found, dispatch parallel debug agents per gap cluster to diagnose root causes
6. **Gap-fix loop**: In `--auto-fix` mode, automatically run plan -> execute -> re-verify loop
7. **Confidence scoring**: 4-factor model evaluates UAT confidence, with stress testing (triggered when pass rate > 80%)

#### Artifact Path

```
.workflow/scratch/{YYYYMMDD}-test-P{N}-{slug}/
  uat.md               # UAT session log (restorable across contexts)
  test-plan.json       # Test plan
  test-results.json    # Test results
  coverage-report.json # Coverage report
```

#### Artifact Registration

```json
{
  "id": "TST-001",
  "type": "test",
  "status": "issues == 0 ? 'completed' : 'failed'",
  "depends_on": "<execute_artifact_id>"
}
```

#### Next-Step Routing

| Condition | Next Step |
|-----------|-----------|
| All passed | `/maestro-milestone-audit` |
| `--auto-fix` succeeded | `/maestro-verify {phase}` |
| Issues remain after `--auto-fix` | `/quality-debug --from-uat {phase}` |
| Manual fix needed | `/quality-debug --from-uat {phase}` |
| Insufficient coverage | `/quality-auto-test {phase}` |
| Integration testing needed | `/quality-auto-test {phase}` |

---

### 2.3 quality-auto-test -- Unified Automated Testing

A unified pipeline for automatically generating and executing tests. It intelligently routes to the best scenario source (spec/coverage gaps/code exploration) and efficiently writes and diagnoses through a CSV parallel engine.

#### Invocation

```bash
/quality-auto-test <phase> [-y] [-c N] [--max-iter <N>] [--layer <L0-L3>] [--strategy <name>] [--dry-run] [--re-run]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `<phase>` | Required. Phase number |
| `--max-iter N` | Max outer iteration count (default 5). Set to 1 for single-pass generation |
| `--layer L` | Specify starting/restricted layer (L0/L1/L2/L3) |
| `--dry-run` | Generate test plan only, do not execute |
| `--re-run` | Re-run only previously failed/blocked scenarios |
| `-y` | Skip confirmation |

#### Smart Routing

The command auto-detects project state and selects the best scenario source:

| Priority | Condition | Route |
|----------|-----------|-------|
| 1 | Active session exists | Resume session |
| 2 | `--re-run` + previous failures | Re-run failed scenarios |
| 3 | Spec package exists (REQ-*.md) | Spec route |
| 4 | Nyquist coverage gaps exist | Gap route |
| 5 | Default | Code route |

#### Test Levels and Parallelism

- **Level waves**: L0 -> L1 -> L2 -> L3 sequential execution, with fail-fast on critical levels
- **CSV parallel writes**: Each agent writes to an independent test file (`spawn_agents_on_csv`)
- **CSV parallel diagnosis**: Failed scenarios are distributed via CSV to parallel agents for classification and repair
- **Dual-layer iteration engine**: Inner layer (test_defect repair, max 3 per level) + outer layer (strategy adjustment)

#### Artifact Path

```
.workflow/scratch/{YYYYMMDD}-auto-test-P{N}-{slug}/
  test-plan.json       # Test plan
  scenarios.csv        # Scenario pipeline
  report.json          # Test report (includes confidence)
  state.json           # Session state (restorable)
  reflection-log.md    # Iteration reflection log
  discoveries.ndjson   # Cross-agent shared discoveries (append-only)
  traceability.md      # Requirements traceability matrix (spec route)
```

#### Next-Step Routing

| Condition | Next Step |
|-----------|-----------|
| Converged (>=95%) | `/maestro-verify {phase}` |
| All requirements verified (spec route) | `/maestro-milestone-audit` |
| Bugs found | `/quality-debug --from-uat {phase}` |
| Max iterations, >80% | `/quality-test {phase}` (manual UAT) |
| Max iterations, <80% | `/quality-debug {phase}` |
| Coverage still low | `/quality-auto-test {phase} --layer {missing}` |
| Single-pass all passed | `/quality-test {phase}` |

---

### 2.4 quality-debug -- Hypothesis-Driven Debugging

A scientific-method-driven debugging command that locates issues through parallel hypothesis generation, isolation verification, and root cause confirmation. Supports three entry modes and structured evidence collection.

#### Invocation

```bash
/quality-debug [issue description] [--from-uat <phase>] [--parallel]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `[issue description]` | Standalone mode: issue description |
| `--from-uat <phase>` | UAT mode: read gaps from the Phase's uat.md as pre-filled symptoms |
| `--parallel` | Parallel mode: one agent per gap cluster |

#### Three Entry Modes

| Mode | Trigger | Symptom Source |
|------|---------|----------------|
| Standalone | Provide issue description directly | Interactive collection |
| UAT handoff | `--from-uat` | Loaded from `uat.md` gaps |
| Parallel | `--parallel` | Independent agent per gap cluster |

#### Debug Loop

```
Symptom collection -> Hypothesis generation -> Isolation verification -> Root cause confirmation
    ^                                                                    |
    |                        (continue if unconfirmed)                   |
    +--------------------------------------------------------------------+
```

- **Hypothesis generation**: Extract investigation directions from review findings and prior debug conclusions
- **Isolation verification**: Each hypothesis verified in an independent agent
- **Evidence collection**: All evidence recorded in structured NDJSON format
- **Multi-factor confidence**: Multi-factor confidence score computed per gap (not simple high/medium/low)
- **Readiness gate**: Must pass readiness gate check before declaring ROOT CAUSE
- **Stress testing**: Execute stress testing after confirming hypothesis

#### Artifact Path and Format

```
.workflow/scratch/{YYYYMMDD}-debug-P{N}-{slug}/
  understanding.md      # Per-cluster evolving understanding tracker
  evidence.ndjson       # Structured NDJSON evidence entries
```

`evidence.ndjson` format example:

```json
{"ts": "2026-05-13T14:30:00Z", "hypothesis": "H1", "action": "check_log", "result": "confirmed", "evidence": "Error log shows null ref at line 42"}
{"ts": "2026-05-13T14:31:00Z", "hypothesis": "H1", "action": "trace_code", "result": "confirmed", "evidence": "Input not validated before use"}
```

#### Knowledge Feedback

After debugging completes, the system may propose knowledge persistence:

| Condition | Prompt | Routing Target |
|-----------|--------|----------------|
| Root cause pattern recurs | "Record to debug-notes.md?" | `spec-add debug` |
| Fix is non-obvious | "Record as learning?" | `spec-add learning` |
| Root cause = architecture boundary violation | "Update architecture-constraints.md?" | `spec-add arch` |

#### Next-Step Routing

| Condition | Next Step |
|-----------|-----------|
| Root cause found, fix needed | `/maestro-plan {phase} --gaps` |
| Root cause found (UAT handoff), auto-fix | `/quality-test {phase} --auto-fix` |
| Conclusion unclear | `/quality-debug {issue}` (resume session) |
| Standalone mode, fix applied | `/maestro-verify {phase}` |

---

### 2.5 quality-refactor -- Reflection-Driven Refactoring

Plans and executes refactoring in a reflection-driven manner, ensuring zero regression through analysis, planning, and iteration rounds. Each round records strategy, results, and adjustments in `reflection-log.md`.

#### Invocation

```bash
/quality-refactor [<scope>]
```

#### Parameters

| Scope | Description |
|-------|-------------|
| Module path (`src/auth`) | Specific directory |
| Feature area (`authentication`) | Conceptual scope |
| `all` | Full codebase scan |
| Not provided | Prompt user for input |

#### Reflection Dimensions and Iteration Mechanism

Each refactoring round consists of three phases:

1. **Analysis**: Identify affected files and dependencies. Load coding spec and review spec as quality gates
2. **Planning**: Create refactoring plan, execute after user confirmation
3. **Reflection**: Run tests after each modification to verify. Record strategy and results in `reflection-log.md`. Adjust next round's strategy based on results

**Safety guarantee**: Tests run immediately after each modification, ensuring zero regression.

#### Artifact Path

```
.workflow/scratch/{YYYYMMDD}-refactor-{scope}/
  reflection-log.md     # Strategy, results, adjustment records
```

#### Next-Step Routing

| Condition | Next Step |
|-----------|-----------|
| All tests pass | `/quality-sync` (update docs) |
| Tests fail | `/quality-debug {scope}` |
| No test suite | `/quality-auto-test {phase}` |

---

### 2.6 quality-sync -- Documentation Synchronization

A documentation sync command for post-code-change updates. Detects changes via git diff, traces impact chains through `doc-index.json` (file -> component -> feature -> requirement), and updates affected `.workflow/codebase/` documents.

#### Invocation

```bash
/quality-sync [--full] [--since <commit|HEAD~N>] [--dry-run]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `--full` | Full re-sync of all tracked files (ignores git diff, rebuilds all docs) |
| `--since <commit>` | Diff from specified commit (default: last sync timestamp) |
| `--dry-run` | Show what would be updated without writing |

#### Sync Mechanism

1. **Change detection**: Identify changed files since last sync via `git diff`
2. **Impact tracing**: Trace each file's component -> feature -> requirement impact chain via `doc-index.json`
3. **Document update**: Refresh affected `.workflow/codebase/` documents
4. **State sync**: Update sync timestamp in `state.json` and file status in `index.json`

#### Artifact Path

No independent artifact directory. Directly updates the following files:

- `.workflow/state.json` -- sync timestamp
- `.workflow/codebase/` -- affected documents
- `.workflow/doc-index.json` -- file status
- `.workflow/project.md` -- Tech Stack section (if dependency manifest changed)

#### Next-Step Routing

| Condition | Next Step |
|-----------|-----------|
| Docs refreshed | `/manage-status` |
| Major structural changes detected | `/manage-codebase-rebuild` (full rebuild) |

---

### 2.7 quality-retrospective -- Phase Retrospective

A multi-perspective phase retrospective command that consumes existing execution artifacts (verification.json, review.json, issues.jsonl, plan.json, etc.), distills reusable insights through 4 parallel lenses, and automatically routes them to the spec, issue, and knowhow systems.

#### Invocation

```bash
/quality-retrospective [phase|N..M] [--lens technical|process|quality|decision] [--all] [--no-route] [--compare N] [-y]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `[phase]` | Single Phase retrospective |
| `[N..M]` | Phase range retrospective |
| `--lens <name>` | Run only specified lens (technical/process/quality/decision) |
| `--all` | Retrospective on all completed but not-yet-reviewed Phases |
| `--no-route` | Analyze only, no routing (do not create specs/issues/notes) |
| `--compare N` | Diff comparison with the retrospective results of the specified Phase |
| `-y` | Skip confirmation |

#### Four Parallel Lenses

| Lens | Perspective | Focus Areas |
|------|-------------|-------------|
| **Technical** | Technical implementation | Architecture decisions, code quality, performance patterns |
| **Process** | Process efficiency | Execution efficiency, blocking factors, collaboration patterns |
| **Quality** | Quality metrics | Bug density, coverage, review finding distribution |
| **Decision** | Decision evaluation | Key decisions and outcomes, alternative evaluations |

The 4 lenses run as parallel agents (one per lens). Results are aggregated and distilled into insights.

#### Insight Routing Mechanism

Each insight is automatically routed to the most appropriate storage:

| Routing Target | Condition | Path |
|----------------|-----------|------|
| Spec stub | Reusable patterns/constraints | `.workflow/specs/{category}.md` (`<spec-entry>` format) |
| Issue | Recurring gaps | `issues.jsonl` (conforming to canonical schema) |
| Knowhow tip | Process notes/reminders | `manage-learn tip` |
| Learnings (always) | All insights | `.workflow/knowhow/specs/learnings.md` (`<spec-entry>` format) |

**Stable IDs**: Each insight uses the `INS-{8hex}` format (`hash(phase_num + lens + title)`). Re-running does not create duplicates.

#### Artifact Path and Format

```
.workflow/scratch/{YYYYMMDD}-retro-P{N}-{slug}/
  retrospective.json    # Full retrospective data (metrics, findings_by_lens, distilled_insights, routing_recommendations)
  retrospective.md      # Human-readable report (metric tables, per-lens findings, insights, routing table)
```

#### Integration with Knowledge Feedback Loop

Retrospectives are the core entry point for knowledge feedback:

1. **Spec system**: Reusable coding patterns and architecture constraints are auto-appended as `<spec-entry>`
2. **Issue system**: Recurring quality gaps are created as canonical issues (status: "open", complete issue_history)
3. **Knowhow system**: Process notes are written to persistent memory via `manage-learn tip`
4. **Learnings aggregation**: All insights are uniformly written to `learnings.md`, supporting cross-Phase queries

#### Next-Step Routing

| Condition | Next Step |
|-----------|-----------|
| Retrospective complete | `/manage-status` to view status |
| Routed issues exist | `/manage-issue list --source retrospective` for triage |
| Browse knowledge base | `/manage-learn list` |

---

## 3. Quality Closed Loop

### Command Flow Relationships

The seven commands form a three-layer closed loop:

```
                    ┌──────────────────────────────────────────┐
                    │           Phase execution complete         │
                    └──────────────┬───────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────┐
              ┌─────┤        quality-review (review)            │
              │     └──────────────┬───────────────────────────┘
              │ BLOCK              │ PASS/WARN
              ▼                    ▼
    ┌─────────────────┐  ┌────────────────────────────────────┐
    │ maestro-plan     │  │     quality-test / quality-auto-test │
    │ --gaps (fix)     │  │            (testing)                │
    └────────┬────────┘  └──────────────┬─────────────────────┘
             │                          │
             │ Apply fix                │ Issues found
             ▼                          ▼
    ┌─────────────────┐      ┌──────────────────────┐
    │ maestro-execute  │◄─────┤   quality-debug       │
    └────────┬────────┘ debug │   (debugging)         │
             │                └──────────┬───────────┘
             │ Root cause found          │
             ▼                           │
    ┌─────────────────┐                  │
    │ Re-run test loop │◄─────────────────┘
    └────────┬────────┘
             │ All passed
             ▼
    ┌──────────────────────────────────────────┐
    │  quality-refactor (optional, tech debt)   │
    │  quality-sync (sync docs)                │
    │  quality-retrospective (retro, feedback)  │
    └──────────────────────────────────────────┘
```

### When to Use Which Command -- Decision Tree

```
Code just executed
  ├─ Need code quality assessment? ──> /quality-review <phase>
  │    ├─ PASS/WARN ──> Continue to testing
  │    └─ BLOCK ──> /maestro-plan <phase> --gaps
  │
  ├─ Need user acceptance? ──> /quality-test <phase>
  │    ├─ All passed ──> /maestro-milestone-audit
  │    └─ Issues found ──> /quality-debug --from-uat <phase>
  │
  ├─ Need automated testing? ──> /quality-auto-test <phase>
  │    ├─ Converged ──> /maestro-verify <phase>
  │    └─ Bugs found ──> /quality-debug --from-uat <phase>
  │
  ├─ Known bugs? ──> /quality-debug "<issue>"
  │    ├─ Root cause clear ──> /maestro-plan <phase> --gaps
  │    └─ Unclear ──> Continue debugging
  │
  ├─ Need to reduce tech debt? ──> /quality-refactor <scope>
  │    ├─ Tests pass ──> /quality-sync
  │    └─ Tests fail ──> /quality-debug <scope>
  │
  ├─ Code changed but docs not updated? ──> /quality-sync
  │
  └─ Phase complete, need retrospective? ──> /quality-retrospective <phase>
       ├─ Insights found ──> Auto-route to spec/issue/knowhow
       └─ Complete ──> /manage-status
```

### Typical Usage Scenarios

**Scenario 1: Standard Quality Flow**

```bash
/quality-review 1 --level standard     # Code review
/quality-auto-test 1                   # Automated testing
/quality-test 1                        # User acceptance
/quality-retrospective 1               # Retrospective
```

**Scenario 2: Test Failure Fix Loop**

```bash
/quality-test 1                        # UAT finds issues
/quality-debug --from-uat 1            # Diagnose root cause
/maestro-plan 1 --gaps                 # Generate fix plan
/maestro-execute 1                     # Apply fix
/quality-auto-test 1 --re-run          # Re-run failed scenarios
```

**Scenario 3: Technical Debt Remediation**

```bash
/quality-refactor src/auth             # Refactor auth module
/quality-sync                          # Sync docs
/quality-retrospective 1               # Review refactoring results
```

---

## 4. Integration with Phase Pipeline

Quality commands play a verification and assurance role within Maestro's Phase pipeline (`maestro-analyze -> maestro-plan -> maestro-execute -> maestro-verify`). Below are the integration points at each stage:

### Post-verify Quality Flow

After `maestro-verify` confirms Phase goals are met, quality commands are the standard entry point:

```bash
/maestro-execute 1              # Execute
/maestro-verify 1               # Verify goals met
# ↓ Quality pipeline follows
/quality-review 1               # Code review
/quality-auto-test 1            # Automated testing
/quality-test 1                 # User acceptance
/quality-retrospective 1        # Retrospective
```

### maestro-plan --gaps Closed Loop

The `--gaps` flag is the core bridge between the quality pipeline and the Phase pipeline:

| Trigger Scenario | Command |
|-----------------|---------|
| `quality-review` verdict BLOCK | `/maestro-plan {phase} --gaps` |
| `quality-debug` confirms root cause | `/maestro-plan {phase} --gaps` |
| `quality-test --auto-fix` | Auto-invokes `plan --gaps -> execute -> verify` |

### Quality Commands in the Phase Pipeline

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

### Pre-Milestone-Audit Quality Checkpoints

Before `maestro-milestone-audit`, the following quality checks are recommended:

1. **All Phases verified**: `maestro-verify` passed
2. **Critical Phases reviewed**: `quality-review` completed, no BLOCK items
3. **Core functionality tested**: `quality-test` or `quality-auto-test` passed
4. **Discovered issues resolved**: Issues fixed and verified
5. **Retrospective completed**: `quality-retrospective` insights routed

### Quality Steps in Full Automation

In the full lifecycle of `/maestro -y`, quality commands automatically engage after verify:

```bash
/maestro -y "Implement user authentication system"
# Internal execution chain:
# analyze → plan → execute → verify → auto-test → test → milestone-audit
```
