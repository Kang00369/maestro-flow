---
name: manage-codebase-refresh
description: Refresh codebase docs from recent changes
argument-hint: [--since <date>] [--deep]
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
Incrementally refresh .workflow/codebase/ documentation based on changes since the last rebuild or refresh. Detects which files have changed (via git diff), identifies which codebase docs are affected, selectively re-runs mapper agents on those areas only, and updates timestamps. Much faster than a full rebuild for ongoing maintenance.
</purpose>

<required_reading>
@~/.maestro/workflows/codebase-refresh.md
</required_reading>

<context>
$ARGUMENTS -- optional flags.

**Flags:**
- `--since <date>` -- Override change detection window (ISO date or relative like "3d")
- `--deep` -- Force deeper re-scan even for files with minor changes

**State files:**
- `.workflow/` -- must be initialized
- `.workflow/codebase/` -- must contain existing docs (from prior rebuild)
- `.workflow/codebase/doc-index.json` -- documentation index with timestamps
- `.workflow/state.json` -- contains `codebase_last_rebuilt` timestamp
</context>

<execution>
Follow '~/.maestro/workflows/codebase-refresh.md' completely.
</execution>

<error_codes>
| Code | Meaning                                                  |
|------|----------------------------------------------------------|
| E001 | .workflow/ not initialized                               |
| E002 | No codebase/ docs exist, use codebase-rebuild instead    |
| W001 | No changes detected since last refresh                   |
</error_codes>

<success_criteria>
- [ ] Changed files detected via git diff since last refresh
- [ ] Affected documentation entries identified from doc-index.json
- [ ] Only affected docs refreshed (selective mapper re-run)
- [ ] doc-index.json timestamps updated per affected entry
- [ ] state.json updated with codebase_last_refreshed timestamp
- [ ] Next step routing: `/manage-status` or `/spec-load` to use updated docs
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
