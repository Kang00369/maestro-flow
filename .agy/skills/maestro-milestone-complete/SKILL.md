---
name: maestro-milestone-complete
description: Archive completed milestone and prepare for next
argument-hint: [<milestone>]
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
Mark a milestone as complete after its audit has passed. Archives all scratch artifacts to `milestones/{M}/artifacts/`, moves artifact entries from `state.json.artifacts[]` to `milestone_history`, extracts final knowhow, and advances to the next milestone.
</purpose>

<required_reading>
@~/.maestro/workflows/milestone-complete.md
</required_reading>

<context>
Milestone: $ARGUMENTS (optional -- defaults to current_milestone from state.json).

**Requires:** `/maestro-milestone-audit` should have passed.

**State files:**
- `.workflow/state.json` — artifacts[], milestones[], current_milestone, milestone_history[]
- `.workflow/roadmap.md` — milestone structure
- `.workflow/milestones/{milestone}/audit-report.md` — audit results
</context>

<execution>
Follow '~/.maestro/workflows/milestone-complete.md' completely.

Archive flow steps (validation, directory archival, artifact history, knowhow extraction, state advancement, cleanup) are defined in workflow `milestone-complete.md`.

### Knowledge Promotion Inquiry

After knowhow extraction (step 4), scan `learnings.md` for promotion candidates:

1. **High-frequency pattern detection**: Scan all `<spec-entry>` entries with `roles="implement"` for keyword overlap (≥2 entries sharing keywords):
   → Ask: "Keyword '{keyword}' appears in {N} knowhow entries. Should this be promoted to a formal coding convention? (`/spec-add coding`)"

2. **Convention drift detection**: Compare executed task summaries against `coding-conventions.md` and `architecture-constraints.md`:
   → Ask: "Were any established conventions bypassed during this milestone? Should conventions be updated?"

3. **Wiki island check**: Auto-trigger `wiki-connect --fix` to link newly extracted knowledge.

If user confirms promotion, invoke `Skill({ skill: "spec-add", args: "<category> <content>" })` with promoted content, preserving original date and source traceability.

**Next-step routing on completion:**
- Cut a release → `/maestro-milestone-release`
- Next milestone → `/maestro-analyze` or `/maestro-plan 1`
- View state → `/manage-status`
</execution>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | Milestone identifier required | Check arguments |
| E002 | error | Audit not passed | Run maestro-milestone-audit first |
| E003 | error | Incomplete artifacts remain | Complete remaining work first |
</error_codes>

<success_criteria>
- [ ] Audit report verified as PASS
- [ ] Scratch artifacts moved to milestones/{M}/artifacts/
- [ ] Artifact entries archived to milestone_history
- [ ] Knowhow extracted to specs/learnings.md
- [ ] state.json updated: next milestone as current, artifacts[] cleared
- [ ] Roadmap snapshot saved
- [ ] project.md Context updated with milestone summary
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
