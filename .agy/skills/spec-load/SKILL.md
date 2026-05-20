---
name: spec-load
description: Load specs and lessons for current context
argument-hint: [--category <category>] [--keyword <word>]
allowed-tools:
  - grep_search
  - run_command
  - view_file
---
<purpose>
Load relevant specs filtered by category (file-level) and/or keyword (entry-level).
Category-based loading: loads the category's primary doc in full + matching entries from other files.
</purpose>

<required_reading>
@~/.maestro/workflows/specs-load.md
</required_reading>

<context>
$ARGUMENTS -- optional flags and keyword

**Flags:**
- `--category <category>` — Load by category: primary category doc (full) + cross-file entries with matching category attr. Categories: coding, arch, test, review, debug, learning, ui.
- `--keyword <word>` — Filter by keyword within entries

**File → Primary Category mapping:**
| File | Category |
|------|----------|
| coding-conventions.md | coding |
| architecture-constraints.md | arch |
| test-conventions.md | test |
| review-standards.md | review |
| debug-notes.md | debug |
| ui-conventions.md | ui |
| quality-rules.md | review |
| learnings.md | learning |

**Examples:**
```
/spec-load --category coding            # coding全文 + 跨文件coding条目
/spec-load --category review            # review-standards + quality-rules + 跨文件review条目
/spec-load --category coding --keyword auth
/spec-load --keyword auth
```

**Ref entries:**
When loading entries with `ref` attribute, only the summary is shown with a load command:
  → Detail: maestro wiki load <knowhow-id>
Use the load command to read the full referenced document.
</context>

<execution>
Follow '~/.maestro/workflows/specs-load.md' completely.
</execution>

<error_codes>
| Code | Severity | Description | Stage |
|------|----------|-------------|-------|
| E001 | fatal | `.workflow/specs/` not initialized -- run `/spec-setup` first | detect_context |
| W001 | warning | No matching specs found for keyword -- showing all specs in category instead | load_specs |
</error_codes>

<success_criteria>
- [ ] Category and/or keyword parsed from arguments
- [ ] Spec files loaded per category mapping
- [ ] Keyword filtering applied at entry level (via `<spec-entry>` keywords attribute)
- [ ] Legacy entries filtered by text grep fallback
- [ ] Results displayed with file:category references
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
