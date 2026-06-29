# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

`maestro delegate "<PROMPT>" --to <tool> --mode analysis|write` — dispatch tasks to external CLI tools (gemini, codex, claude, opencode).
Always `run_in_background: true`. Full guide: `cat ~/.maestro/workflows/delegate-usage.md`

**Strictly follow the cli-tools.json configuration**

## Code Location

For locating files or code patterns, use FastContext first. In Codex the MCP tool
name is `mcp__fast_context__fast_context_search`. Keep queries focused, set
`project_path`, exclude generated directories, then inspect returned files and
line ranges with `rg`, `Read`, or Maestro file tools before editing or
concluding.

Priority:
1. FastContext semantic locator for natural-language code search and unknown symbols.
2. MaestroGraph (`maestro kg search/context/callers/callees`) for known symbols, call chains, and knowledge-linked context.
3. `rg`/`Read`/Maestro file tools for exact verification.
4. `maestro explore` only when the user explicitly asks for it, or when FastContext/KG are unavailable and a separate high-cost read-only LLM scout is truly needed. Do not use `--all` by default.

Example:

```text
mcp__fast_context__fast_context_search({
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

Levels: `high` → `medium` (default) → `low` (`[LOW CONFIDENCE]`) → `contested` (`[CONTESTED]`).
Resolution: `/manage-knowledge-audit`
