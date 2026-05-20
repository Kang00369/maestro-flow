---
name: quality-sync
description: Sync codebase docs by tracing git diff impact
argument-hint: [--full] [--since <commit|HEAD~N>] [--dry-run]
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
Synchronize project state after manual code changes or to refresh codebase documentation. Detects changes via git diff, traces impact through doc-index.json (file -> component -> feature -> requirement), updates state.json and index.json, and refreshes affected `.workflow/codebase/` documentation. Use --full flag for a complete resync of all tracked files regardless of git diff.
</purpose>

<required_reading>
@~/.maestro/workflows/sync.md
</required_reading>

<context>
$ARGUMENTS -- optional flags:
- `--full` -- Complete resync of all tracked files (ignores git diff, rebuilds all docs)
- `--since <commit|HEAD~N>` -- Diff since specific commit (default: last sync timestamp)
- `--dry-run` -- Show what would be updated without writing changes
</context>

<execution>
Follow '~/.maestro/workflows/sync.md' completely.

**Next-step routing on completion:**
- Docs refreshed → `/manage-status`
- Major structural changes detected → `/manage-codebase-rebuild` (full rebuild recommended)
</execution>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | .workflow/ not initialized | Suggest running `/maestro-init` first|
| W001 | warning | No changes detected since last sync | Report clean state, skip updates |
</error_codes>

<success_criteria>
- [ ] state.json updated with current sync timestamp
- [ ] Codebase docs refreshed for all affected components
- [ ] doc-index.json reflects current file state
- [ ] Changes tracked and logged
- [ ] project.md Tech Stack section refreshed if dependency manifests changed
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
