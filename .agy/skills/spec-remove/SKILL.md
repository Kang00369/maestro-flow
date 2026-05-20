---
name: spec-remove
description: Remove spec entry by ID
argument-hint: <entry-id>
allowed-tools:
  - ask_question
  - grep_search
  - replace_file_content
  - run_command
  - view_file
  - write_to_file
---
<purpose>
Remove a `<spec-entry>` from a specs file. Symmetric with `/spec-add`.
Uses `maestro wiki remove-entry` for atomic removal with index auto-update.
</purpose>

<required_reading>
@~/.maestro/workflows/specs-remove.md
</required_reading>

<context>
$ARGUMENTS -- expects `<entry-id>` (e.g., `spec-learnings-003`, `spec-coding-conventions-001`)

**Entry ID format**: `spec-{file-stem}-{NNN}` — the sub-node ID assigned by WikiIndexer when indexing `<spec-entry>` blocks.

**Discovery**: Use `maestro wiki list --type spec --json` or `/spec-load --keyword <term>` to find entry IDs.
</context>

<execution>
Follow '~/.maestro/workflows/specs-remove.md' completely.
</execution>

<error_codes>
| Code | Severity | Description | Stage |
|------|----------|-------------|-------|
| E001 | fatal | Entry ID is required -- usage: `/spec-remove <entry-id>` | parse_input |
| E002 | fatal | `.workflow/specs/` not initialized -- run `/spec-setup` first | validate |
| E003 | fatal | Entry ID not found in wiki index | lookup |
| E004 | fatal | Entry is not a spec sub-node (wrong type) | validate |
</error_codes>

<success_criteria>
- [ ] Entry ID parsed and validated
- [ ] Entry found in wiki index (type=spec, is sub-node)
- [ ] User confirmed removal (unless -y flag)
- [ ] Entry removed from container file via `maestro wiki remove-entry`
- [ ] Wiki index auto-updated
- [ ] Confirmation displayed with removed entry details
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
