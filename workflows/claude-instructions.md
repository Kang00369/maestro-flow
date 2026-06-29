# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

## Code Location

For locating files or code patterns, use FastContext first. In Claude the MCP
tool name is `mcp__fast-context__fast_context_search`. Keep queries focused, set
`project_path`, exclude generated directories, then inspect returned files and
line ranges with `Grep`, `Read`, or Maestro file tools before editing or
concluding.

Priority:
1. FastContext semantic locator for natural-language code search and unknown symbols.
2. `Grep`/`Read`/Maestro file tools for exact verification of returned ranges.
3. MaestroGraph (`maestro kg search/context/callers/callees`) for known-symbol and call-chain confirmation after FastContext.

Example:

```text
mcp__fast-context__fast_context_search({
  query: "where JWT middleware validates tokens",
  project_path: "/path/to/project",
  exclude_paths: ["node_modules", "dist", ".git", ".workflow"],
  max_results: 8,
  max_turns: 2
})
```

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

Levels: `high` (verified) → `medium` (default) → `low` (stale) → `contested` (conflict detected).

- `contested` → sorted last during injection, labeled `[CONTESTED]` with conflict note
- `low` → labeled `[LOW CONFIDENCE]`
- Resolution handled by `/manage-knowledge-audit`

## Capability Routing

When the right Maestro command or skill is unclear, search before acting. Do not choose from memory when a router or discovery command exists.

- Clear development intent, unclear chain: use `/maestro <intent>` to classify the intent, select the chain, create a session, and dispatch it.
- Unclear command or skill availability: use `/maestro-help` for read-only command, skill, and guide discovery.
- User asks "how to use", "what commands exist", "what should I use", or "how does Maestro work": route to `/maestro-help`.

Do not hand-pick commands or abandon Maestro capabilities when `/maestro` and `/maestro-help` cover the routing problem.

## Knowledge Infrastructure

For real development tasks, knowledge infrastructure is baseline project infrastructure, not optional convenience. If it is missing, initialize it instead of bypassing it.

Startup checks:
- If `.workflow/kg/maestro.db` is missing, run `maestro kg init && maestro kg sync`.
- If `maestro search` reports `bm25-only`, treat it as a missing KG signal and initialize or sync the KG; the same applies when `maestro search --code` returns no code results unexpectedly.
- For call-chain or symbol analysis, use `maestro kg context <symbol>`, `maestro kg callers <fn>`, or `maestro kg callees <fn>`.
- Before refactoring, run `maestro kg sync --full`.
- For graph health, run `maestro wiki health` to inspect orphans, hubs, and broken links.

Do not use "KG is not initialized" as a reason to fall back to blind grep. `kg-auto-init` should cover this path; if it does not, run `maestro kg init` manually.

## Skill Auto-Triggers

When a task matches a specialized Maestro skill, invoke that skill instead of relying on memory.

| Scenario | Skill |
|----------|-------|
| Multi-angle code review | `team-review` |
| Tech debt discovery and remediation | `team-tech-debt` |
| Security vulnerability audit | `security-audit` |
| Test coverage gap filling | `team-testing` / `quality-auto-test` |
| Performance bottleneck optimization | `team-perf-opt` |
| Architecture optimization | `team-arch-opt` |
| UI design or polish | `team-uidesign` / `team-ui-polish` |
| Root-cause debugging | `quality-debug` / `odyssey-debug` |
| Academic writing or papers | `scholar-*` |
| Persisting code knowledge into knowhow | `codify-to-knowhow` / `manage-knowhow-capture` |
| Unclear skill selection | `/maestro-help skills` |

## Locator vs Delegate Boundary

| Scenario | Tool | Reason |
|----------|------|--------|
| Single focused or multi-angle code location | FastContext + `Grep`/`Read` verification | Lower cost and better semantic file targeting |
| Known symbol or call-chain lookup | `maestro kg context/callers/callees` | Graph-backed symbol context |
| Deep implementation, long analysis, or writes | `maestro delegate` | Session-backed and chainable |
| Broad research over more than 5 files | FastContext seed queries, then `maestro delegate --role research` if needed | Preserves main-session context |

Keep the main session focused on planning, review, and interaction. Delegate heavy work with `--async`; Maestro reports completion through the MCP channel and the `delegate-monitor` hook.

Multi-agent write work must use worktrees. When multiple agents may write in parallel, including multiple Codex delegates, CSV Wave agent fanout, or team execution, each agent must work in an independent git worktree when the project is inside a git repository. Use paths such as `maestro delegate --cd <worktree>` or agent isolation settings such as `isolation: "worktree"` so parallel agents do not overwrite one another in the same working tree. Single-agent serial tasks are not subject to this rule.

## Local Runtime Tools: prefer maestro file tools

For reading and editing files, prefer the maestro MCP tools over the harness built-ins when available — they are more reliable across harness versions and do not depend on harness-internal "already read" tracking that can break `Edit` chains:

- **Read**: use `mcp__maestro-tools__read_file` (param: `path`, supports `offset`/`limit`) or `mcp__maestro-tools__read_many_files` for batch reads / directory listing / regex content search
- **Edit/Write**: use `mcp__maestro-tools__edit_file` / `mcp__maestro-tools__write_file` — they do not require a prior harness `Read` to succeed, so they avoid the "File has not been read yet" failure mode when the built-in `Read` is unavailable or unreliable
- If a harness built-in tool reports a missing required parameter (e.g. `file_path is missing`) on the first try, switch to the maestro equivalent immediately rather than retrying

The harness built-ins still have value for image/PDF/notebook reads and line-numbered output; use them when they work and the maestro tool lacks the capability. Default to maestro for plain-text file read/edit to keep `Read → Edit` chains reliable.
