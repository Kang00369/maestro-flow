---
name: maestro-merge
description: Merge milestone worktree branch back to main
argument-hint: -m <milestone-number> [--force] [--dry-run] [--no-cleanup] [--continue]
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
Merge a completed milestone worktree branch back into the main branch, sync scratch artifacts, and reconcile the artifact registry. Uses a two-phase approach: git merge first (source code), artifact sync second (only after git succeeds). This prevents partial state corruption when merge conflicts occur.

Includes registry health check, pre-merge rebase (pull main into worktree to minimize conflicts), and atomic state reconciliation (merge artifact entries, don't overwrite).
</purpose>

<required_reading>
@~/.maestro/workflows/merge.md
</required_reading>

<context>
$ARGUMENTS -- milestone number and optional flags.

Flags (`-m`, `--force`, `--dry-run`, `--no-cleanup`, `--continue`), merge sequence, artifact sync detail, and conflict handling are defined in workflow `merge.md`.
</context>

<execution>
Follow '~/.maestro/workflows/merge.md' completely.

**Knowledge inquiry on completion:**
After successful merge, ask user once: "Record milestone learnings?" If yes, persist via `Skill("spec-add", "learning \"<title>\" \"<insight>\" --keywords <kw1>,<kw2>")`.

**Next-step routing on completion:**
- View dashboard → Skill({ skill: "manage-status" })
- Audit milestone → Skill({ skill: "maestro-milestone-audit" })
</execution>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | Running inside a worktree | Run from main worktree |
| E002 | error | No worktree registry found | Nothing to merge |
| E003 | error | --continue but no merge state | Start fresh merge |
| E004 | error | No milestone number provided | Provide `-m <N>` |
| W001 | warning | Stale registry entries found | Auto-cleaned |
| W002 | warning | Incomplete artifacts (without --force) | Confirm or use --force |
| W003 | warning | Conflict pulling main into worktree | Resolve in worktree first |
</error_codes>

<success_criteria>
- [ ] Registry health check passed (stale entries cleaned)
- [ ] Pre-merge rebase successful (worktree has latest main)
- [ ] Git merge completed without conflicts (or conflicts resolved via --continue)
- [ ] All scratch artifacts synced to main `.workflow/scratch/`
- [ ] `state.json.artifacts[]` reconciled (worktree entries merged into main)
- [ ] Milestone `"forked"` flag removed in `state.json.milestones[]`
- [ ] `roadmap.md` completed phases marked
- [ ] Worktree removed and branch deleted (unless --no-cleanup)
- [ ] `worktrees.json` registry updated (entry removed)
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
