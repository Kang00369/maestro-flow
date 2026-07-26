<!-- session-mode: none -->
# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

This file is the managed Grok Build `AGENTS.md` Maestro core. Prefer finishing
the assigned task in this session. Use the shell `maestro` command only for
structured subcommands (`search`, `load`, `kg`, `spec`, `wiki`, …) — not free-text
intent routing.

## Code Location

For locating files or code patterns, use FastContext first. In Grok Build the
MCP tool is typically discovered via `search_tool` / `use_tool` (server names may
appear as `fast-context` or similar). Keep queries focused, set `project_path`,
exclude generated directories, then inspect returned files and line ranges with
`grep` / `read_file` / Maestro file tools before editing or concluding.

Priority:
1. FastContext semantic locator for natural-language code search and unknown symbols.
2. `grep` / `read_file` / Maestro file tools for exact verification of returned ranges.
3. MaestroGraph (`maestro kg search/context/callers/callees`) for known-symbol and call-chain confirmation after FastContext.

Example:

```text
fast_context_search({
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

### Supersession & Conflict (dual-track)

新知识与旧条目的关系分两种,语义不同、操作不同:

| 关系 | 场景 | 命令 | 效果 |
|------|------|------|------|
| **supersede** | 新规则替代旧规则（演化） | `maestro spec supersede <old-sid> --by <new-sid>` | 旧条目 `deprecated`（search/load 排除），演化链保留 |
| **conflict** | 两条规则均有道理（争议） | `maestro spec conflict mark <file> <line> --note "<reason>"` | 旧条目 `contested`（search ×0.5，`[CONTESTED]` 标注，仍注入），人裁决 |

```bash
# supersede 流程: add → capture sid → supersede
maestro spec add coding "新规则" "内容" --keywords kw1,kw2 --json   # → 获取 new-sid
maestro spec supersede <old-sid> --by <new-sid>                     # → 旧条目 deprecated
maestro spec history <sid>                                          # → 查看演化链

# conflict 流程: 不确定谁对 → 标记争议 → 审计解决
maestro spec conflict mark <file> <line> --note "<reason>"
# Resolution: /manage-knowledge-audit
```

**三正交轴**: `confidence`（人/审计裁定）⊥ `status`（active/deprecated 生命周期）⊥ time-decay（自动新鲜度）。不要混用。

Levels: `high` (verified) → `medium` (default) → `low` (stale) → `contested` (conflict detected).

- `contested` → sorted last during injection, labeled `[CONTESTED]` with conflict note
- `low` → labeled `[LOW CONFIDENCE]`
- Resolution handled by `/manage-knowledge-audit`

### Health & Maintenance

```bash
maestro spec health                  # 生命周期统计 + 悬空/循环 supersedes 校验 + 新鲜度
maestro spec backfill-sid            # 存量无 sid 条目回填（幂等），启用演化链
maestro spec history <sid>           # 某条目的演化链（oldest → newest）
maestro search "<q>" --include-deprecated   # 搜索含 deprecated 条目
```

## Capability Routing

When the right Maestro command or skill is unclear, search before acting. Do not choose from memory when a router or discovery command exists.

- Unclear command or skill availability: use `/maestro-help` for read-only command, skill, and guide discovery.
- User asks "how to use", "what commands exist", "what should I use", or "how does Maestro work": route to `/maestro-help`.
- Prefer an already-loaded skill or slash command when it matches the task.

Do not abandon Maestro capabilities when `/maestro-help` or a matching skill covers the problem.

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

## Local Runtime Tools: prefer maestro file tools

For reading and editing files, prefer the maestro MCP tools over the harness built-ins when available — they are more reliable across harness versions and do not depend on harness-internal "already read" tracking that can break edit chains:

- **Read**: use maestro `read_file` (param: `path`, supports `offset`/`limit`) or `read_many_files` for batch reads / directory listing / regex content search
- **Edit/Write**: use maestro `edit_file` / `write_file` when available
- If a harness built-in tool reports a missing required parameter on the first try, switch to the maestro equivalent immediately rather than retrying

The harness built-ins still have value for image/PDF/notebook reads and line-numbered output; use them when they work and the maestro tool lacks the capability. Default to maestro for plain-text file read/edit to keep read→edit chains reliable.

## Delegate & Session Identity

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md

### Session Identity

Binary role check — do **not** rely on environment variables:

| Prompt signal | You are |
|---------------|---------|
| Prompt begins with a `[DELEGATE WORKER IDENTITY]` bracket block (includes parent execution id) | **Delegate worker** (launched by `maestro delegate` via CliAgentRunner) |
| No such block | **Coordinator** (user-started main session) |

### Nested Orchestration Ban

A Delegate worker **must not** create a second Maestro orchestration layer through
`maestro delegate`, `maestro cli`, `maestro csv-wave` / `spawn_agents_on_csv`, or
native `spawn_agent`. Coordinator-only lifecycle instructions do not authorize
recursive dispatch. Provider-native workers inside the selected CLI execution
remain allowed. If a nested Maestro job is ever observed, treat it as a guard
defect and fix the guard instead of messaging the nested session.

## Grok Build notes

- Grok is Maestro's default delegated executor for bounded, explicit implementation
  tasks: fast, cost-efficient, high-value worker for rapid code iteration,
  test/fix loops, and straightforward review. Optimize for a correct result at
  this role rather than behaving like a low-quality chore model; return difficult
  ambiguous reasoning or high-risk architectural decisions to the coordinator when
  they exceed the assigned boundary.
- Prefer `~/.grok/AGENTS.md` (this managed core) over Claude's `CLAUDE.md` for Maestro policy.
- Recommended: in `~/.grok/config.toml` set `[compat.claude] agents = false` so Claude persona files are not loaded as project instructions. Keep `skills`, `hooks`, and `mcps` enabled if you want Claude-compatible Maestro assets.
- Keep Grok's native subagents enabled. Use its `task` workers and configured Composer-backed roles when they improve implementation, exploration, planning, or review; do not add `--no-subagents` merely because Maestro launched the session. Provider-internal parallelism is allowed and is not a second Maestro orchestration layer.
- The caller or `~/.grok/config.toml` owns model and reasoning effort. Do not silently downgrade a delegated job to the build model; the recommended default is `grok-4.5` with `high` effort, while native subagents may use their configured Composer models.
- When you are a Delegate worker (see Session Identity), you **must not** recursively
  start another Maestro orchestration layer (`maestro delegate`, `maestro cli`,
  `maestro csv-wave`). Finish within this provider execution or return failure.
  This ban does not restrict Grok's native subagents.
- `compatibility` imports selected Claude, Cursor, or Codex configuration surfaces; it is separate from Grok's model selection and native subagent system.
