---
name: manage-learn
description: Capture and search learning insights and tips
argument-hint: [<text> | tip <text> | list | search | show <id>] [--category <cat>] [--tag t1,t2] [--phase N]
allowed-tools:
  - ask_question
  - grep_search
  - replace_file_content
  - run_command
  - view_file
  - write_to_file
---
<purpose>
Unified atomic knowledge capture for the workflow learning library. Captures two types of knowledge:
- **Insights**: Timeless "eureka moment" entries (patterns, gotchas, techniques) — the default mode
- **Tips**: Quick contextual notes for cross-session recovery (formerly in `manage-knowhow-capture tip`)

Both types are stored in `.workflow/specs/learnings.md` as `<spec-entry>` blocks with auto-detected phase linkage and keyword-based category inference. Tips are distinguished by `source: "tip"` and implicitly tagged `tip`. Same store as retrospective output, so search and list see the entire knowledge corpus.
</purpose>

<required_reading>
@~/.maestro/workflows/learn.md
</required_reading>

<context>
Arguments: $ARGUMENTS

**Modes (auto-detected from first token):**
- `"<insight text>"` (or any non-keyword text) → insight capture mode
- `tip <text>` → tip capture mode (quick contextual note, auto-tagged `tip`)
- `list` → list recent entries (default 20)
- `search <query>` → `maestro spec load --category learning` or text search across `specs/learnings.md`
- `show <INS-id>` → full detail with phase context
- empty → ask_question to prompt for text

Flags, storage paths, and shared store rationale defined in workflow learn.md.
</context>

<execution>
Follow `~/.maestro/workflows/learn.md` Stages 1–5 in order.
</execution>

<error_codes>
| Code | Severity | Description | Stage |
|------|----------|-------------|-------|
| E001 | error | `.workflow/` not initialized — run `/maestro-init` first | parse_input |
| E002 | error | Unknown `--category` value (allowed: pattern, antipattern, decision, tool, gotcha, technique, tip) | parse_input |
| E003 | error | `show` mode requires an INS-id argument | show |
| E004 | error | Insight id not found in `specs/learnings.md` | show |
| W001 | warning | Auto-phase detection found a current_phase but no matching artifact in registry; phase set to null | capture |
</error_codes>

<success_criteria>
- [ ] Mode correctly routed (capture / list / search / show)
- [ ] Capture: `<spec-entry>` block appended to `specs/learnings.md` with all required fields
- [ ] Capture: phase auto-link resolves correctly via artifact registry when `state.json` has `current_phase`
- [ ] Capture: category inference produces a sensible default when `--category` absent
- [ ] List: filters apply, output sorted newest-first, default limit 20
- [ ] Search: results ranked by title (3) > tags (2) > summary (1) match
- [ ] Show: full insight displayed with phase context and routed-artifact link if any
- [ ] No file modifications outside `.workflow/knowhow/`
- [ ] Confirmation banner displayed with INS-id and next-step hints
- [ ] Next step: `/manage-learn list` to browse, or `/manage-learn search <query>` to find related insights
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
