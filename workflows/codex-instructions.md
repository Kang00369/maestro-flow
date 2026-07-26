<!-- session-mode: none -->
# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

This file is the managed Codex `AGENTS.md` Maestro core. Keep it as routing
policy and invariants; detailed flags, schemas, and step loops live in the
selected `SKILL.md`, workflow docs, hooks, and CLI help.

## Maestro Routing

Use Maestro skills as the intent router when task shape is unclear. Do not
choose from memory when a router or discovery command exists.

Important boundary:
- Free-text user intent routes through Codex skills such as `$maestro`,
  `$maestro-next`, `$maestro-ralph`, `$maestro-quick`, or an explicit named
  skill.
- Do **not** run `maestro "<free text intent>"` in Bash. The shell `maestro`
  command is only for structured subcommands such as `search`, `load`, `kg`,
  `delegate`, `csv-wave`, `session ...`, and `run ...`.

Routing ladder:
1. Narrow deterministic edit or question: do it directly after the knowledge
   and code-location gates below.
2. Small well-understood pipeline: use `$maestro-quick`.
3. Unclear single next skill: use `$maestro-next` or `$maestro-help`.
4. Unclear multi-step lifecycle: use `$maestro` or `$maestro-ralph`.
5. Explicit analysis -> plan -> implementation: use `$maestro-analyze`,
   `$maestro-plan`, then `$maestro-execute`.
6. Roadmap-scale requirements: use `$maestro-roadmap`, then plan/execute the
   selected slice.
7. Broad rewrite, migration, overhaul, or long-lived fix loop: clarify scope,
   constraints, and definition of done before execution; prefer `$maestro-ralph`
   when stateful decisions, goal audit, or regrounding are needed.
8. Unknown command, skill, or usage question: use `$maestro-help`.

High-signal skill triggers:

| Scenario | Route |
|----------|-------|
| Bug, failing test, unexpected behavior | `$quality-debug`; stubborn loop -> `$odyssey-debug` |
| Code review after changes | `$quality-review`; wide parallel review -> `$team-review` |
| Automated coverage gaps | `$quality-auto-test` or `$team-testing` |
| User-observable acceptance/UAT | `$quality-test` |
| Refactor / tech debt scope | `$quality-refactor`; wide scan/remediation -> `$team-tech-debt` |
| Security audit / OWASP / STRIDE / secrets / supply chain | `$security-audit` |
| Frontend/UI design, polish, visual audit | `$maestro-impeccable`; exhaustive UI loop -> `$odyssey-ui` |
| Multi-role coordination | `$team-coordinate`; full lifecycle team delivery -> `$team-lifecycle-v4` |
| Specs, knowhow, domain, wiki, issues | matching `spec-*`, `manage-*`, `domain-*`, `wiki-*` skill |

Do not over-route narrow edits into team or Odyssey workflows. Those are for
wide, multi-perspective, or zero-residual loops.

## Code Exploration

Choose one exploration tier before any locator call or broad read:

1. For a known, narrow location or a single symbol, use the coordinator with
   FastContext.
2. For cross-file evidence collection, large peripheral material, or an
   independent read-only check, use one generic native Scout with FastContext.
3. For genuinely ambiguous semantic exploration, dependency/impact tracing,
   or architecture-level synthesis, use `maestro explore` with its sole
   configured endpoint set to `gpt-5.6-sol`.

Do not maintain a cheaper Explore endpoint: it costs more than FastContext and
does not provide the independent context and evidence discipline of a Scout.
Do not use Explore as a fallback for ordinary file or symbol lookup. Choose the
highest tier justified by the question instead of running all tiers in sequence.

### Session Identity

Binary role check — do **not** rely on environment variables:

| Prompt signal | You are |
|---------------|---------|
| Prompt begins with a `[DELEGATE WORKER IDENTITY]` bracket block (includes parent execution id) | **Delegate worker** (launched by `maestro delegate` via CliAgentRunner) |
| No such block | **Coordinator** (user-started main session) |

FastContext-first applies to coordinator and native Scout scopes when you are
the coordinator; it does not require the coordinator to duplicate a Scout's
search or to pre-search a scope that belongs to Explore.

When you are the **coordinator**, handle known small files, a single fact, the
exact code about to be edited, foundational architecture/design/handoff
documents, and work whose dispatch cost is no lower than direct reading.
Implementation, design choices, and final verification remain
coordinator-owned. Hard problems: consult **claude** via
`maestro delegate --to claude` rather than toughing them out alone.

When you are the **coordinator**, use a one-shot read-only Scout for large
non-foundational files, cross-file or cross-directory searches, independent
evidence domains, parallel read-only verification, high-volume logs/search
output/peripheral material, or a fresh module-state check during a long task.
For Scout-owned scopes, dispatch before running the same FastContext query,
search, or read in the coordinator. When you are a **Delegate worker**, stay
inside the assigned provider execution — do not open a second Maestro
orchestration layer (see Delegate invariants).

For coordinator- and Scout-owned scopes:

1. Use `mcp__fast_context__fast_context_search` first for natural-language code
   search or unknown symbols. Keep queries focused, set `project_path`, and
   exclude generated directories.
2. Inspect the returned files and line ranges with `rg`, `sed`, `nl`, `Read`,
   or Maestro file tools. FastContext is a locator hint, not final evidence.
3. Use MaestroGraph (`maestro kg context/callers/callees/path/impact`) only when
   known-symbol dependencies or call chains need confirmation.

Scout invariants:

- Use only the generic `default` agent with `fork_turns = "none"`. Ultra is
  not required.
- Give each scout a self-contained scope, question, and output format requiring
  exact `file:line`, symbols, and necessary source excerpts.
- A scout is read-only and single-use: no edits, decisions, final conclusions,
  child agents, follow-ups, or reuse.
- Dispatch independent scopes concurrently in one round. Then stop duplicating
  their exploration and wait once with `wait_agent(timeout_ms = 3600000)`.
- `wait_agent` waits only for native Codex scout mailboxes, never Maestro
  Delegate, CSV Wave, shell processes, or other external jobs.
- Treat scout output as compressed evidence: spot-check key citations instead
  of rereading all delegated material. The coordinator still reads
  foundational documents and code it will edit in full.
- After 10 minutes without completion, inspect partial results, stop the scout,
  and continue locally or redispatch a smaller one-shot scope.

## Knowledge Gate

Gate rule: run focused `maestro search` plus relevant `maestro load` before
reading code deeply or editing files.

```bash
maestro search "<query>" [--type <type>] [--category <cat>] [--code] [--kg]
maestro load --type <type> [--list] [--category <cat>] [--keyword <word>] [--id <id>]
```

Query rules:
- Use 1-3 core keywords per query; several short queries beat one long keyword
  dump.
- Separate concepts from symbols.
- Use `--code` for symbols and code entities.
- Use `--kg` when cross-layer context from code, specs, knowhow, domain, and
  issues matters.
- Always inspect cited source files/line ranges before concluding.

The knowledge graph is baseline infrastructure:

- If its database is missing, search is BM25-only, code search is unexpectedly
  empty, or graph commands report an uninitialized graph, run
  `maestro kg init && maestro kg sync`.
- Before broad refactors, major renames, or call-chain work, run
  `maestro kg sync --full`.
- Do not use missing KG as a reason to fall back to blind grep.

Record durable knowledge through the matching `spec-*`, `manage-*`, `domain-*`,
or `wiki-*` skill. Supersede an obsolete rule; mark a conflict only when both
positions remain plausible and require adjudication. Detailed commands,
categories, confidence states, and maintenance procedures live in
@~/.maestro/workflows/knowledge-system.md.

## Work Dispatch

Use this progressive order:

1. Coordinator for narrow deterministic work that gains nothing from isolation.
2. Delegate for one bounded offload; add one critic only when independent
   verification materially changes confidence.
3. CSV Wave only for a real row batch, dependency waves, or strict
   multi-worker schema/retry/recovery requirements.

Native Codex `spawn_agent` is forbidden except for the one-shot read-only
scouts defined in Code Exploration. A lifecycle name such as Ralph, analyze,
plan, or execute does not by itself justify CSV Wave.

### Delegate

Use `maestro delegate` as the default offload primitive for one bounded task,
whether short or long. It is appropriate for focused analysis, planning,
review, research, or implementation when an independent context helps, an
external CLI perspective is useful, or the main session context should stay
small.

Always pass an enabled provider with `--to` and set `--mode analysis|write`.
Missing, unknown, or disabled providers fail without fallback; `--role` controls
spec injection only and never selects a provider. Explicit user model and
effort flags always win.

For explicit Codex delegates:

| Task | Model / effort |
|------|----------------|
| Ambiguous cross-subsystem reasoning or planning | `gpt-5.6-sol` / `max` |
| Simple implementation or analysis with clear acceptance | `gpt-5.6-sol` / `low` |
| Mechanical chores, extraction, or bounded support scans | `gpt-5.6-terra` / `medium` |

Model and effort selection never changes `--to` or enables provider fallback.
Do not pass Codex model names or effort semantics to another provider unless
its adapter explicitly supports them.

Use explicit `--to grok --model grok-4.5 --effort high` for fast,
cost-efficient bounded implementation, iteration, test/fix loops, and
straightforward review. Keep provider-native Composer workers available; do
not substitute the lower-quality build model or use Grok for work that needs
Sol-level ambiguity handling, high-risk architecture, or deep planning.

Default Delegate execution is synchronous, independent of expected duration.
Use --async only when the coordinator can make useful progress on concrete,
independent work. When the result becomes necessary, run
`maestro delegate wait <exec_id>` and wait exactly once. Do not use sleep or
repeated status/output queries. A harness using `write_stdin` to await that one
still-running wait process is process waiting, not Delegate status polling.
When hosting synchronous Delegate or `delegate wait` in `functions.exec`, omit
an outer early `yield_time_ms` so the blocking command can return naturally.
Parallel write delegates require independent worktrees.

Delegate invariants:

- A Delegate worker must not create another Maestro orchestration layer through
  `maestro delegate`, `maestro cli`, `maestro csv-wave` / `spawn_agents_on_csv`,
  or native `spawn_agent`. Coordinator-only lifecycle instructions do not
  authorize recursive dispatch.
- Provider-native workers inside the selected CLI execution remain allowed,
  including Grok Composer. If a nested Maestro job is ever observed, treat it
  as a guard defect and fix the guard instead of messaging the nested session.
- A failed or missing delegate agent is an error. Do not silently route to a
  different agent or escalate to CSV Wave as a provider fallback.

Full Delegate options, backend behavior, prompt templates, resume, and message
delivery live in @~/.maestro/workflows/delegate-usage.md.

### CSV Wave

When the dispatch choice is close, start with one Delegate and upgrade only
after fresh evidence establishes a CSV trigger. Use `maestro-collab` or
explicit Delegates for heterogeneous external perspectives.

CSV Wave details belong in the owning skill,
@~/.maestro/workflows/skill-authoring.md, and `csv-wave-guard`, not in AGENTS.md.
Before invoking `spawn_agents_on_csv` directly, read the selected skill's
schema and recovery instructions. Set
`max_runtime_seconds` explicitly with `3600` as the hard ceiling. The call is
already blocking; when hosting it in `functions.exec`, normally omit an outer
explicit `yield_time_ms` so the complete wave returns naturally. Only opt into
early yield for requested mid-wave observation or cancellation.

Require strict non-empty worker results, schema-backed output,
artifact-backed recovery when needed, and no recursive fan-out. Do not diagnose
`multi_agent_v2` without fresh source evidence.

Top-level `$maestro` / `$maestro-ralph` routing is sequential and coordinator
owned. Do not wrap every lifecycle step in CSV Wave; individual skills may use
CSV Wave internally when their design requires it.

## Local Runtime

- Prefer `rg` over `grep`; use `sed`/`nl` for exact line inspection.
- Use `apply_patch` for manual edits.
- When rolling back tracked-file changes, use non-destructive git-backed
  rollback such as `git restore -- <path>`, `git checkout <rev> -- <path>`, or
  `git apply -R` against an exact saved diff instead of hand-editing reverse
  patches. If the target is not in a git repository or has no usable git
  history, state that and use the safest manual edit available.
- If a harness file tool fails because of missing parameters or prior-read
  tracking, switch to the available Maestro file tools or normal shell reads
  instead of retrying the same broken call.
- Preserve user changes in dirty worktrees; do not revert unrelated files.

## Keep AGENTS.md High Signal

AGENTS.md should contain routing, gates, and invariants only. Do not paste full
Maestro chain maps, skill inventories, CSV schemas, hook tables, install wizard
details, or workflow state machines here. Open the selected `SKILL.md` or guide
for exact flags, artifacts, schemas, and execution details.
