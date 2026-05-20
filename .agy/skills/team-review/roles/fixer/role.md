---
role: fixer
prefix: FIX
inner_loop: true
message_types: 
---

# Code Fixer

Fix code based on reviewed findings. Load manifest, plan fix groups, apply with rollback-on-failure, verify. Code-generation role -- modifies source files.

## Phase 2: Context & Scope Resolution

| Input | Source | Required |
|-------|--------|----------|
| Task description | From task subject/description | Yes |
| Session path | Extracted from task description | Yes |
| Fix manifest | <session>/fix/fix-manifest.json | Yes |
| Review report | <session>/review/review-report.json | Yes |
| .msg/meta.json | <session>/.msg/meta.json | No |

1. Extract session path, input path from task description
2. Load manifest (scope, source report path) and review report (findings with enrichment)
3. Filter fixable findings: severity in scope AND fix_strategy !== 'skip'
4. If 0 fixable -> report complete immediately
5. Detect quick path: findings <= 5 AND no cross-file dependencies
6. Detect verification tools: tsc (tsconfig.json), eslint (package.json), jest (package.json), pytest (pyproject.toml), semgrep (semgrep available)
7. Load wisdom files from `<session>/wisdom/`

## Phase 3: Plan + Execute

### 3A: Plan Fixes (deterministic, no CLI)
1. Group findings by primary file
2. Merge groups with cross-file dependencies (union-find)
3. Topological sort within each group (respect fix_dependencies, append cycles at end)
4. Sort groups by max severity (critical first)
5. Determine execution path: quick_path (<=5 findings, <=1 group) or standard
6. Write `<session>/fix/fix-plan.json`: `{plan_id, quick_path, groups[{id, files[], findings[], max_severity}], execution_order[], total_findings, total_groups}`

### 3B: Execute Fixes
**Quick path**: Single code-developer agent for all findings.
**Standard path**: One code-developer agent per group, in execution_order.

Agent prompt includes: finding list (dependency-sorted), file contents (truncated 8K), critical rules:
1. Apply each fix using Edit tool in order
2. After each fix, run related tests
3. Tests PASS -> finding is "fixed"
4. Tests FAIL -> `git checkout -- {file}` -> mark "failed" -> continue
5. No retry on failure. Rollback and move on
6. If finding depends on previously failed finding -> mark "skipped"

Agent returns JSON: `{results:[{id, status: fixed|failed|skipped, file, error?}]}`
Fallback: check git diff per file if no structured output.

Write `<session>/fix/execution-results.json`: `{fixed[], failed[], skipped[]}`

## Phase 4: Post-Fix Verification

1. Run available verification tools on modified files:

| Tool | Command | Pass Criteria |
|------|---------|---------------|
| tsc | `npx tsc --noEmit` | 0 errors |
| eslint | `npx eslint <files>` | 0 errors |
| jest | `npx jest --passWithNoTests` | Tests pass |
| pytest | `pytest --tb=short` | Tests pass |
| semgrep | `semgrep --config auto <files> --json` | 0 results |

2. If verification fails critically -> rollback last batch
3. Write `<session>/fix/verify-results.json`
4. Generate `<session>/fix/fix-summary.json`: `{fix_id, fix_date, scope, total, fixed, failed, skipped, fix_rate, verification}`
5. Generate `<session>/fix/fix-summary.md` (human-readable)
6. Update `<session>/.msg/meta.json` with fix results
7. Contribute discoveries to `<session>/wisdom/` files

<!--
Maestro: converted from .claude/. Semantic differences worth knowing:

- TaskCreate / TaskUpdate / TaskList / TaskGet → file-based at .workflow/tasks/<id>.json
  (agy's manage_task handles run_command async tasks, NOT named-task tracking)
- mcp__ccw-tools__team_msg(log|broadcast|read|get_state) → write_to_file/view_file on
  .workflow/.team/<session>/.msg/messages.jsonl
- Skill(skill=X, args=Y) → user-triggered slash command in agy; cannot be invoked from an agent
- TeamCreate / TeamDelete → no agy equivalent; rely on directory scaffolding at
  .workflow/.team/<session>/
- TodoWrite → write_to_file append on .workflow/todos.jsonl
- send_message Recipient is a ConversationId returned by invoke_subagent, not a role name
-->
