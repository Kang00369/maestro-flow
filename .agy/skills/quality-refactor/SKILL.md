---
name: quality-refactor
description: Use when accumulated tech debt needs systematic identification and safe reduction
argument-hint: [<scope>]
allowed-tools:
  - ask_question
  - define_subagent
  - grep_search
  - invoke_subagent
  - manage_subagents
  - replace_file_content
  - run_command
  - send_message
  - view_file
  - write_to_file
---
<purpose>
Plan and execute targeted refactoring with safety guarantees through analysis, planning, and reflection-driven iteration. Identifies affected files and dependencies, creates a refactoring plan, confirms with the user before execution, then applies changes with test verification after every modification to ensure zero regressions. Each refactoring round records strategy, outcome, and adjustments in reflection-log.md.
</purpose>

<required_reading>
@~/.maestro/workflows/refactor.md
</required_reading>

<context>
Scope: $ARGUMENTS (required)
- Module path: "src/auth" - specific directory
- Feature area: "authentication" - conceptual scope
- "all" - full codebase scan

If not provided, prompt user for scope.

### Pre-load context (before refactoring)

1. **Coding specs**: Run `maestro spec load --category coding` to load coding conventions. Apply conventions to all refactored code.
2. **Review specs**: Run `maestro spec load --category review` to load review standards. Use as quality gate for refactored code.
3. **Role Knowledge**:
   - Browse: `maestro wiki list --category coding`
   - Identify task-relevant entries, then load: `maestro wiki load <id1> [id2...]`
4. All are optional — proceed without if unavailable.
</context>

<execution>
Follow '~/.maestro/workflows/refactor.md' completely.

**Knowledge inquiry on completion:**
After successful refactoring, ask user once: "Record refactoring pattern as coding convention?" If yes, persist via `Skill("spec-add", "coding \"<title>\" \"<pattern>\" --keywords <kw1>,<kw2>")`.

**Next-step routing on completion:**
- All tests pass → `/quality-sync` (update codebase docs)
- Test failures after refactor → `/quality-debug {scope}`
- No test suite available → `/quality-auto-test {phase}`
</execution>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | Refactoring scope/description required | Prompt user for module path, feature area, or "all" |
| E002 | error | Test suite not available for affected area | Suggest creating tests first, or proceed with manual verification |
| W001 | warning | Partial test coverage for affected area | Note uncovered areas, proceed with extra caution |
</error_codes>

<success_criteria>
- [ ] Refactoring plan created and confirmed by user
- [ ] Changes implemented according to plan
- [ ] All tests pass after refactoring
- [ ] No regressions introduced
- [ ] reflection-log.md written with strategy and outcomes
</success_criteria>

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
