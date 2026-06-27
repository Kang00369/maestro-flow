# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

`maestro delegate "<PROMPT>" --to <tool> --mode analysis|write` — dispatch tasks to external CLI tools (gemini, codex, claude, opencode).
Always `run_in_background: true`. Full guide: `cat ~/.maestro/workflows/delegate-usage.md`

**Strictly follow the cli-tools.json configuration**

## Explore

`maestro explore` takes priority over Glob, Grep, and Read. When locating files or searching code patterns, call `maestro explore` first and stop to wait for results.

```bash
maestro explore "FIND: <target + condition>\nSCOPE: <paths>" [more prompts...] [options]
```

Lightweight read-only codebase search. 1 prompt = 1 agent. Not for write-mode/long sessions — use `delegate`.

| Option | Description |
|--------|-------------|
| `-e, --endpoint <names>` | Endpoint name(s), comma-separated |
| `--all` | Fan out each prompt to all endpoints |
| `--max-turns <n>` | Max agent turns per job |
| `-f, --file <path>` | Load prompts from JSON or text file |
| `--cd <dir>` | Working directory |
| `--json` | Output results as JSON |

**FIND + SCOPE is minimum standard.** Bare FIND produces unfocused results.

| Field | Required | Purpose |
|-------|----------|---------|
| `FIND` | **Yes** | Precise target — what exactly + condition |
| `SCOPE` | **Yes** | File patterns or directories |
| `EXCLUDE` | No | What to skip |
| `ATTENTION` | No | Edge cases to watch |
| `EXPECTED` | Recommended | Output format (`file:line` list, summary, JSON) |

```
# ❌ Vague
FIND: database patterns

# ✅ Specific target + condition + scope
FIND: Functions that execute SQL queries without parameterized inputs
SCOPE: src/db/**/*.ts, src/api/**/*.ts
```

**Multi-prompt: decompose by angle, not keyword.** Each prompt gets one focused question + scope.

Multi-prompt — background; single lookup — foreground:

```
Bash({ command: "maestro explore \"p1\" \"p2\" --json", run_in_background: true })
Bash({ command: "maestro explore \"FIND: ...\nSCOPE: ...\"" })
```

Session: `maestro explore show` / `maestro explore output <id>`

## Knowledge System

**Gate rule**: run `maestro search` + `maestro load` BEFORE reading code or editing files.

```bash
maestro search "<query>" [--type <type>] [--category <cat>] [--code] [--kg]
maestro load --type <type> [--list] [--category <cat>] [--keyword <word>] [--id <id>]
```

**--type**: `spec`, `knowhow`, `domain`, `issue`, `session`, `scratch`, `note`, `project`, `roadmap`
**--category** (spec only): `coding`, `arch`, `debug`, `test`, `review`, `learning`, `ui`

### Query Rules

1-3 core keywords per query — multiple short queries beat one long one.
Separate concepts from symbols. Add `--code` for symbols, `--kg` for full-source.

```bash
# ❌ keyword dump
maestro search "topology display frontend DetailedTopologySVG elk"

# ✅ targeted
maestro search "topology layout"
maestro search "DetailedTopologySVG" --code
maestro load --type spec --category coding
```

### Record

| What | Command |
|------|---------|
| Spec | `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"` |
| Knowhow | `/manage-knowhow-capture` (`--spec-category <cat>` for agent injection) |

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, tests→`test`.

### Conflict Marking

```bash
maestro spec conflict mark <file> <line> --note "<reason>"
```

Levels: `high` → `medium` (default) → `low` (`[LOW CONFIDENCE]`) → `contested` (`[CONTESTED]`).
Resolution: `/manage-knowledge-audit`
