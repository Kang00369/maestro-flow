# Code Review

4-dimension code review for implementation quality.

## Inputs

- Plan file (plan.json)
- Git diff or modified files list
- Test results (if available)

## Dimensions

| Dimension | Critical Issues |
|-----------|----------------|
| Quality | Empty catch, any casts, @ts-ignore, console.log |
| Security | Hardcoded secrets, SQL injection, eval/exec, innerHTML |
| Architecture | Circular deps, imports >2 levels deep, files >500 lines |
| Requirements | Missing core functionality, incomplete acceptance criteria |

## Review Process

1. Gather modified files from executor's state (team_msg get_state)
2. Read each modified file
3. Score per dimension (0-100%)
4. Classify issues by severity (Critical/High/Medium/Low)
5. Generate verdict (BLOCK/CONDITIONAL/APPROVE)

## Output

Write review report to <session>/artifacts/review-report.md:
- Per-dimension scores
- Issue list with file:line references
- Verdict with justification
- Recommendations (if CONDITIONAL)

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
