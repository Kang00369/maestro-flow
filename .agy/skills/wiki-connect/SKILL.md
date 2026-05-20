---
name: wiki-connect
description: Find and link hidden connections in wiki graph
argument-hint: [--scope <type>] [--min-similarity N] [--fix] [--max N]
allowed-tools:
  - ask_question
  - define_subagent
  - grep_search
  - invoke_subagent
  - manage_subagents
  - run_command
  - send_message
  - view_file
  - write_to_file
---
<required_reading>
@~/.maestro/workflows/wiki-connect.md
</required_reading>

<purpose>
Knowledge graph link discovery and health improvement. Analyzes the wiki index to find orphaned entries, missing connections, and transitive link gaps, then suggests or auto-applies new `related` links to improve graph connectivity.

Leverages maestro's unique wiki graph infrastructure (BM25 search, backlinks, health scoring) — no equivalent in gstack. Directly improves the quality of all downstream wiki consumers (search, digest, follow-along).
</purpose>

<context>
Arguments: $ARGUMENTS

Flags, storage paths, and CLI commands defined in workflow wiki-connect.md.
</context>

<execution>
Follow '~/.maestro/workflows/wiki-connect.md' completely (Stages 1-6).

**Next-step routing:**
- Generate knowledge digest → `/wiki-digest <topic>`
- Follow-along on orphan → `/learn-follow <wiki-id>`
- View full graph → `maestro wiki graph`
</execution>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No wiki entries found (empty index) | Initialize wiki content first, or run `/maestro-init` |
| E002 | error | `maestro wiki` CLI not available | Check maestro installation |
| W001 | warning | No connection candidates found above threshold | Lower --min-similarity or check if graph is already well-connected |
| W002 | warning | Some wiki update calls failed during --fix | Partial application; retry failed entries manually |
| W003 | warning | Health score unchanged after fix | Connections may not have improved the specific health metrics |
</error_codes>

<success_criteria>
- [ ] Wiki index loaded with entry count and type distribution
- [ ] Baseline health score recorded
- [ ] Orphans identified and rescue candidates generated
- [ ] Connection candidates scored and ranked
- [ ] Results filtered by --min-similarity and limited by --max
- [ ] Suggestions displayed with scores and reasons
- [ ] If --fix: entries updated with new `related` links
- [ ] If --fix: new health score computed and delta reported
- [ ] Report written to `wiki-connections-{date}.md`
- [ ] Graph insights appended to `specs/learnings.md` as `<spec-entry>` blocks
- [ ] No unintended entry modifications (only `related` field changed)
- [ ] Summary displayed with next-step routing
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
