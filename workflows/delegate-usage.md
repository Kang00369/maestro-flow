<!-- session-mode: none -->
# Delegate Usage

```bash
maestro delegate "<PROMPT>" [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--to <tool>` | Explicit enabled agent: gemini, qwen, codex, claude, grok, opencode | Required |
| `--role <role>` | Spec-injection role: analyze, explore, review, implement, plan, brainstorm, research | — |
| `--mode <mode>` | `analysis` (read-only) / `write` (modify) | `analysis` |
| `--model <model>` | Model override | Tool's `primaryModel` |
| `--effort <level>` | Reasoning effort: low, medium, high, max | Tool config/default |
| `--cd <dir>` | Working directory | Current |
| `--rule <template>` | Protocol + prompt template | — |
| `--id <id>` | Execution ID | Auto: `{prefix}-{HHmmss}-{rand4}` |
| `--resume [id]` | Resume previous session | — |
| `--includeDirs <dirs>` | Additional directories (comma-separated) | — |

`maestro delegate` supports the direct backend only. The terminal backend is
rejected before config, history, broker, or child-process creation because a
multiplexer pane cannot currently receive the Delegate execution context needed
by the recursion guard. `maestro cli --backend terminal` remains available for
non-Delegate interactive use.

Agent resolution is explicit: `--to <tool>` is required. `--role` never selects
an agent, and missing, unknown, or disabled agents fail without fallback.

Delegate is the normal choice for a single bounded offload, including short
analysis, planning, review, research, or implementation. It is not reserved for
long-running work. Prefer it before CSV Wave when the task does not require a
homogeneous row batch, dependency waves, or strict multi-worker recovery.

`--model <model>` overrides the selected agent's `primaryModel`. For example:

```bash
maestro delegate "<PROMPT>" --to codex --model gpt-5.6-luna --mode analysis
```

### Codex Model Budget

When `--to codex` is explicit and the caller did not pin a model/effort, use the
lowest sufficient tier:

| Task shape | Model and effort | Examples |
|------------|------------------|----------|
| Hard reasoning | `gpt-5.6-sol` + `max` | Ambiguous multi-step understanding, cross-subsystem planning, high-risk design decisions |
| Simple work | `gpt-5.6-sol` + `low` | Bounded implementation, simple analysis, straightforward review with clear acceptance criteria |
| Scout/chore | `gpt-5.6-terra` + `medium` | Mechanical extraction, supporting-document scan, independent bounded code-location scout |

```bash
maestro delegate "<HARD_TASK>" --to codex --model gpt-5.6-sol --effort max --mode analysis
maestro delegate "<SIMPLE_TASK>" --to codex --model gpt-5.6-sol --effort low --mode write
maestro delegate "<SCOUT_TASK>" --to codex --model gpt-5.6-terra --effort medium --mode analysis
```

FastContext remains the first code locator. Use the Terra tier when a separate
scout session still adds value. Model/effort selection never changes the
explicit agent and never enables provider fallback. Codex `max` is translated
by the adapter to its supported highest local reasoning setting.

### Grok Delegate

Use Grok as a fast, cost-efficient, high-value worker for bounded implementation, rapid code
iteration, test/fix loops, and straightforward review when it is the explicitly
selected provider:

```bash
maestro delegate "<TASK>" --to grok --mode write --model grok-4.5 --effort high
```

The Grok adapter forwards the model and effort, uses a private prompt file,
maps `analysis` to Grok's `read-only` sandbox and `write` to its `workspace`
sandbox, and does not emit `--no-subagents`. Grok may therefore use its native
Composer-backed subagents according to the user's Grok configuration. It must
not silently substitute the lower-quality build model or another provider.
Cost alone is not a routing reason: keep ambiguous cross-subsystem reasoning,
high-risk architecture, and deep planning on a provider suited to that work.

Each new Grok Delegate receives a provider-session UUID through `--session-id`. Maestro
persists the session ID emitted by Grok's `end` event, and a later
`--resume <exec-id>` uses Grok's native `--resume <provider-session-id>` without
replaying the stored transcript. History created before this bridge, or history
with missing/invalid provider metadata, falls back to the existing transcript
resume in a new Grok session. A native resume failure is reported rather than
silently replaying a potentially mutating task.

Run `npm run test:grok-contract` after upgrading Grok. The smoke test calls only
`grok --version` and `grok --help`; it checks every headless/session flag used by
the adapter and does not start a model request.

**`--mode` is authoritative** — `MODE:` in prompt text is a hint only.

## Prompt Template

```
PURPOSE: [goal] + [success criteria]
TASK: [step 1] | [step 2] | [step 3]
MODE: analysis|write
CONTEXT: @[file patterns] | Memory: [prior work]
EXPECTED: [output format]
CONSTRAINTS: [scope limits]
```

### CONTEXT Patterns

- `@**/*` — all files (default)
- `@src/**/*.ts` — scoped
- `@../shared/**/*` — sibling dir (**requires `--includeDirs ../shared`**)

### --rule Templates

**Universal**: `universal-rigorous-style`, `universal-creative-style`

**Analysis**: `analysis-trace-code-execution`, `analysis-diagnose-bug-root-cause`, `analysis-analyze-code-patterns`, `analysis-analyze-technical-document`, `analysis-review-architecture`, `analysis-review-code-quality`, `analysis-analyze-performance`, `analysis-assess-security-risks`

**Planning**: `planning-plan-architecture-design`, `planning-breakdown-task-steps`, `planning-design-component-spec`, `planning-plan-migration-strategy`

**Development**: `development-implement-feature`, `development-refactor-codebase`, `development-generate-tests`, `development-implement-component-ui`, `development-debug-runtime-issues`

## Execution Rules

Default is synchronous: a Delegate without `--async` blocks and returns its
terminal status and last reply, regardless of expected duration. Use `--async`
only when the coordinator can make useful progress on concrete independent
work while the Delegate runs. When its result becomes a dependency, wait once:

```bash
maestro delegate wait <exec_id>
maestro delegate wait <exec_id> --timeout <ms>
```

The wait is event-driven. A caller timeout does not cancel or mutate the job.
Exit codes are completed `0`, failed or unknown `1`, caller timeout `124`, and
cancelled `130`. Terminal output, including a legal empty string, is written to
stdout; status is written to stderr. The `status`, `tail`, and `output` commands
remain available, but status, tail, and output are diagnostics, not waiting
primitives. Do not sleep and recheck status, or loop over status/output.
When hosting a synchronous Delegate or `delegate wait` in `functions.exec`, do
not set an outer early `yield_time_ms`; let the blocking command return
naturally, as with CSV Wave.

When the current session is already a Maestro Delegate worker, it must not
create a second Maestro orchestration layer through another
`maestro delegate`, `spawn_agents_on_csv`, or Codex native `spawn_agent`. If an
injected lifecycle skill says the coordinator should delegate, treat that as a
coordinator boundary, not permission to create another Delegate layer.
Provider-internal workers owned by the explicitly selected CLI remain valid;
in particular, Grok may use native `spawn_subagent` / Composer without creating
a nested Maestro job. Recursive `maestro delegate` is rejected before
job/history creation; the worker must otherwise finish within the selected
provider execution or return failure. If a nested Maestro job is ever created,
classify it as a guard defect and fix the guard instead of messaging or
cancelling that nested session as the primary recovery.

### Execution ID Prefix

gemini→`gem`, qwen→`qwn`, codex→`cdx`, claude→`cld`, grok→`grk`, opencode→`opc`

### Resume

```bash
maestro delegate "<PROMPT>" --to gemini --resume           # last session
maestro delegate "<PROMPT>" --to gemini --resume <id>      # specific
```

`<id>` is always a Maestro execution ID. Grok resolves it through the persisted
provider session mapping; callers do not pass a Grok UUID directly. Other
non-interactive adapters continue to rebuild a bounded prompt from Maestro
history.

### Message Delivery

| Mode | Use For |
|------|---------|
| `inject` | Supplementary context to running worker |
| `after_complete` | Chained tasks after completion |

```bash
maestro delegate message <exec-id> "additional context"
maestro delegate message <exec-id> "next task" --delivery after_complete
```

Delivery timing depends on the provider transport. Claude's stream-json input
keeps stdin open, so `inject` can enter the live process. Codex Delegate uses
one-shot `codex exec`, and Grok Delegate uses one-shot headless mode; for these
non-interactive adapters `inject` cancels the current process and dispatches the
queued message after termination. The Grok restart uses its native session;
Codex currently uses Maestro transcript resume. Consequently, a Codex message
cannot steer the active turn and may only appear after that turn completes if
termination races with `turn.completed`. Codex app-server protocol has
`turn/steer`, but Maestro's current `codex-server` follow-up path still uses
`turn/start`, while the default `codex exec` adapter exposes neither transport.
Neither Codex Delegate path currently provides live-turn steering.

## Auto-Invoke Triggers

Proactively invoke for `analysis` mode — no user confirmation needed:

| Trigger | Suggested Rule |
|---------|---------------|
| Self-repair fails (1+ attempts) | `analysis-diagnose-bug-root-cause` |
| Ambiguous requirements | `planning-breakdown-task-steps` |
| Architecture decisions needed | `planning-plan-architecture-design` |
| Pattern uncertainty | `analysis-analyze-code-patterns` |
| Critical/security code paths | `analysis-assess-security-risks` |

Default to `--mode analysis`. Expected duration does not select `--async`; use it
only when the coordinator has concrete independent work to do before the result
becomes a dependency.
