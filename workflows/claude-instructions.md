# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

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

### Context Injection

Explore agent 无项目认知，调用前注入上下文：

| 注入项 | 写入字段 | 内容 |
|--------|----------|------|
| 结构 | SCOPE | 相关目录的具体路径（非通配泛扫） |
| 领域 | SCOPE | `maestro search` 已返回的关键文件路径 |
| 约束 | ATTENTION | 框架、语言、命名惯例 |

```
FIND: authentication middleware that validates JWT tokens
SCOPE: src/middleware/, src/auth/, src/api/routes/
ATTENTION: Express.js, middleware files named *.middleware.ts
```

### Prompt Structure

**FIND + SCOPE 为最低标准。** 每个字段一句陈述句，禁止嵌套条件。

| Field | Required | Rule |
|-------|----------|------|
| `FIND` | **Yes** | 可判定的具体目标（什么 + 判定条件） |
| `SCOPE` | **Yes** | 明确路径或 glob，禁止 `**/*` 泛扫 |
| `EXCLUDE` | No | 要跳过的文件类型或目录 |
| `ATTENTION` | No | 框架、命名惯例、已知陷阱 |
| `EXPECTED` | Recommended | 输出格式：`file:line` 列表 / 摘要 / JSON |

```
FIND: Functions that call db.query() with string concatenation instead of $1/$2
SCOPE: src/db/**/*.ts, src/api/**/*.ts
EXCLUDE: **/*.test.ts
EXPECTED: file:line list with the SQL string
```

### Cross-Search

对重要搜索，用 2-3 个不同角度的 prompt 并发，结果由 Claude 交叉验证。

**按角度拆分，不按关键词拆分：**

| 角度 | Prompt A | Prompt B |
|------|----------|----------|
| 定义 vs 调用 | 找函数定义 | 找调用点 |
| 正例 vs 反例 | 找正确用法 | 找遗漏用法 |
| 入口 vs 实现 | 找 export/路由 | 找内部逻辑 |
| 按文件类型 | .ts 中的用法 | .vue 中的用法 |

```bash
maestro explore \
  "FIND: All functions exported from auth module\nSCOPE: src/auth/\nEXPECTED: function name + file:line" \
  "FIND: All imports from auth module\nSCOPE: src/**/*.ts\nEXCLUDE: src/auth/\nEXPECTED: import path + file:line" \
  --json
```

**结果置信度：**
- 双命中 → 高置信，直接使用
- 单命中 → 用 Grep/Read 二次确认
- 零命中 → 换角度重搜或目标不存在

### Execution

Multi-prompt — background；single lookup — foreground：

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

## Explore vs Delegate Boundary

| Scenario | Tool | Reason |
|----------|------|--------|
| Multi-angle read-only scan with 3+ prompts | `maestro explore` | Lightweight and sessionless |
| Single focused lookup | `maestro explore` | Sufficient for narrow discovery |
| Deep implementation, long analysis, or writes | `maestro delegate` | Session-backed and chainable |
| Broad research over more than 5 files | `maestro delegate --role explore/research` | Preserves main-session context |

Keep the main session focused on planning, review, and interaction. Delegate heavy work with `--async`; Maestro reports completion through the MCP channel and the `delegate-monitor` hook.

Multi-agent write work must use worktrees. When multiple agents may write in parallel, including multiple Codex delegates, CSV Wave agent fanout, or team execution, each agent must work in an independent git worktree when the project is inside a git repository. Use paths such as `maestro delegate --cd <worktree>` or agent isolation settings such as `isolation: "worktree"` so parallel agents do not overwrite one another in the same working tree. Single-agent serial tasks are not subject to this rule.

## Local Runtime Tools: prefer maestro file tools

For reading and editing files, prefer the maestro MCP tools over the harness built-ins when available — they are more reliable across harness versions and do not depend on harness-internal "already read" tracking that can break `Edit` chains:

- **Read**: use `mcp__maestro-tools__read_file` (param: `path`, supports `offset`/`limit`) or `mcp__maestro-tools__read_many_files` for batch reads / directory listing / regex content search
- **Edit/Write**: use `mcp__maestro-tools__edit_file` / `mcp__maestro-tools__write_file` — they do not require a prior harness `Read` to succeed, so they avoid the "File has not been read yet" failure mode when the built-in `Read` is unavailable or unreliable
- If a harness built-in tool reports a missing required parameter (e.g. `file_path is missing`) on the first try, switch to the maestro equivalent immediately rather than retrying

The harness built-ins still have value for image/PDF/notebook reads and line-numbered output; use them when they work and the maestro tool lacks the capability. Default to maestro for plain-text file read/edit to keep `Read → Edit` chains reliable.
