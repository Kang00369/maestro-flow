---
name: wiki-digest
description: Generate wiki digest with theme clustering and gap analysis
argument-hint: [<topic>|--recent N] [--type <type>] [--format brief|full]
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
<purpose>
Knowledge synthesis command that generates actionable digests from the wiki knowledge graph. Clusters entries by semantic theme, identifies knowledge gaps, and produces a coverage heatmap. Unique to maestro — leverages the wiki graph (BM25 search, backlinks, health) to surface trends and missing knowledge.

Unlike `maestro wiki list` which shows raw entries, this command synthesizes and interprets the knowledge base, producing a curated summary with gap analysis and recommended next actions.
</purpose>

<required_reading>
@~/.maestro/workflows/wiki-digest.md
</required_reading>

<deferred_reading>
- @~/.maestro/workflows/issue.md (issues.jsonl canonical schema for `--create-issues` routing)
</deferred_reading>

<context>
Arguments: $ARGUMENTS

Flags, scope resolution, storage paths, and CLI commands defined in workflow wiki-digest.md.
</context>

<execution>
Follow '~/.maestro/workflows/wiki-digest.md' completely (Stages 1-8).

**Next-step routing:**
- Deep dive on a theme → `/learn-follow <wiki-id>`
- Fix graph gaps → `/wiki-connect --fix`
- Decompose code for missing patterns → `/learn-decompose <path>`
- Create missing entries → `maestro wiki create --type <type> --slug <slug>`
- Triage gap issues → `/manage-issue list --source wiki-digest`
</execution>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No wiki entries found (empty index) | Initialize wiki content first |
| E002 | error | Topic search returned 0 results | Broaden topic or check wiki content |
| W001 | warning | Too few entries (<5) for meaningful theme clustering | Digest produced but themes may be trivial |
| W002 | warning | specs/learnings.md not found — skipping cross-reference | Proceed without knowhow context |
| W003 | warning | Some entry bodies failed to load — partial summaries | Note incomplete entries in digest |
</error_codes>

<success_criteria>
- [ ] Scope parsed and entries loaded
- [ ] Baseline health score recorded
- [ ] Entries clustered into 3-5 semantic themes
- [ ] Per-theme analysis: summary, key entries, gaps, health
- [ ] Cross-reference with specs/learnings.md completed
- [ ] Coverage heatmap generated (type × theme matrix)
- [ ] Knowledge gaps identified with suggested actions
- [ ] If `--create-issues`: gap issues created in `issues.jsonl` (deduped)
- [ ] Digest written to `KNW-digest-{slug}-{date}.md`
- [ ] Meta-insights appended to `specs/learnings.md` as `<spec-entry>` blocks
- [ ] No files modified outside `.workflow/knowhow/` and `.workflow/issues/` (issues only when `--create-issues`)
- [ ] Summary displayed with key findings and next-step routing
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
