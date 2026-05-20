---
name: spec-setup
description: Initialize specs from project structure
argument-hint: 
allowed-tools:
  - grep_search
  - run_command
  - view_file
  - write_to_file
---
<purpose>
Initialize the project-level specs directory by scanning the codebase for conventions, patterns, and tech stack.
Core files (coding, arch, knowhow) are always created. Optional files (quality, debug, test, review) are created only when relevant signals are detected.
All output lands in `.workflow/specs/`.
</purpose>

<required_reading>
@~/.maestro/workflows/specs-setup.md
</required_reading>

<context>
$ARGUMENTS (no arguments expected)

**Preconditions:**
- `.workflow/` directory must exist (created by `/maestro-init`)  # (see code: E001)
- Project must contain source files to scan  # (see code: E002)
</context>

<execution>
Follow '~/.maestro/workflows/specs-setup.md' completely.
</execution>

<error_codes>
| Code | Severity | Description | Stage |
|------|----------|-------------|-------|
| E001 | fatal | `.workflow/` directory not initialized -- run `/maestro-init` first | parse_input |
| E002 | fatal | No source files found in project -- nothing to scan | scan_codebase |
| W001 | warning | Convention detection uncertain for one or more categories -- marked `[UNCERTAIN]` | generate_specs |
</error_codes>

<success_criteria>
- [ ] `.workflow/specs/` directory created
- [ ] Core files always created: `coding-conventions.md`, `architecture-constraints.md`, `knowhow.md`
- [ ] Optional files created when detected: `quality-rules.md` (linter/CI), `test-conventions.md` (test framework), `debug-notes.md` (on demand), `review-standards.md` (on demand)
- [ ] Report displayed with summary and next steps
</success_criteria>
</output>

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
