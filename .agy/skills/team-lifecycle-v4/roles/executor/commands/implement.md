# Implement

Execute implementation from task JSON via agent or CLI delegation.

## Agent Mode

Direct implementation using Edit/Write/Bash tools:

1. Read task.files[] as target files
2. Read task.implementation[] as step-by-step instructions
3. For each step:
   - Substitute [variable] placeholders with pre_analysis results
   - New file → Write tool; Modify file → Edit tool
   - Follow task.reference patterns
4. Apply task.rationale.chosen_approach
5. Mitigate task.risks[] during implementation

Quality rules:
- Verify module existence before referencing
- Incremental progress — small working changes
- Follow existing patterns from task.reference
- ASCII-only, no premature abstractions

## CLI Delegation Mode

Build prompt from task JSON, delegate to CLI:

Prompt structure:
```
PURPOSE: <task.title>
<task.description>

TARGET FILES:
<task.files[] with paths and changes>

IMPLEMENTATION STEPS:
<task.implementation[] numbered>

PRE-ANALYSIS CONTEXT:
<pre_analysis results>

REFERENCE:
<task.reference pattern and files>

DONE WHEN:
<task.convergence.criteria[]>

MODE: write
CONSTRAINTS: Only modify listed files | Follow existing patterns
```

CLI call:
```
run_command({ command: `maestro delegate "<prompt>" --to <tool> --mode write --rule development-implement-feature`,
  run_in_background: false, timeout: 3600000 })
```

Resume strategy:
| Strategy | Command |
|----------|---------|
| new | --id <session>-<task_id> |
| resume | --resume <parent_id> |

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
