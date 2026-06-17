# Maestro

Workflow orchestration CLI with MCP endpoint support and extensible architecture.

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

Available CLI endpoints are dynamically defined by the config file

## Code Diagnostics

- **Prefer `mcp__ide__getDiagnostics`** for code error checking over shell-based TypeScript compilation

## Knowledge System

### Design Principles

- **Single search entry** — `maestro search` is the only user-facing search command
- **Silent-skip-is-bug** — if knowledge exists but search misses it, that is a defect
- **Search-before-act** — ALWAYS search before implementation; never assume context is pre-loaded

### Search — Three-Layer Architecture

**Before planning or implementing, search first.** Load the right knowledge at the right time.

| Layer | Command | When to Use |
|-------|---------|-------------|
| **1. Unified** | `maestro search "<query>" [--type spec\|knowhow\|issue] [--category <cat>]` | Daily search — BM25 full-text across all knowledge types |
| **2. Domain rules** | `maestro spec load --category <cat> [--keyword <kw>]` | Load domain rules explicitly before coding |
| **3. Code structure** | `maestro kg search <symbol>` / `maestro kg context <node>` | Tracing dependencies, call chains, module boundaries |

**Deprecated** (do not use): `spec search`, `knowhow search`, `wiki search` — all replaced by Layer 1.

### Proactive Search — ALWAYS Execute

**ALWAYS search before acting.** Do not assume knowledge is auto-loaded. Execute via Bash:

**L0 — Every task, no exceptions:**

ALWAYS run before any implementation, planning, or debugging task:
- `maestro search "<feature/module keywords>"` — load specs, knowhow, existing issues

**L1 — Encountering unfamiliar code:**

Run when you hit unknown symbols, modules, or need to understand boundaries:
- `maestro kg search "<symbol>"` — code structure and dependencies
- `maestro kg context <file-or-symbol>` — callers, callees, related code

**L2 — Deep analysis (architecture / debugging / refactoring / tests):**

- `maestro search --type spec --category arch` — architecture decisions
- `maestro kg callers <fn>` / `maestro kg callees <fn>` — trace call chains when debugging
- `maestro search --type spec --category test "<module>"` — before writing tests
- `maestro kg search "<module>" --code` — map impact radius before refactoring

### Record — Capture Knowledge

When execution surfaces non-obvious knowledge, persist it:

- **Spec entry** (short rule/constraint) → `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"`
- **Knowhow document** (detailed recipe/template/decision) → `/manage-knowhow-capture`
  - Use `--spec-category <cat>` to bridge knowhow into agent injection
  - Files use `{PREFIX}-{YYYYMMDD}-{slug}.md` naming for readable filenames

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, test strategy→`test`.
