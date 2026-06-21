# Codex Code Guidelines
## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

## Core Principles

- Follow project's existing patterns and conventions
- Single responsibility, DRY, YAGNI
- Small testable changes, commit frequently
- Study 3+ similar patterns before implementing
- Boring solutions over clever code

**Git Operations:**
- Only stage/commit files produced by current task
- Use `git add <specific-files>` instead of `git add .`

**Multi-CLI Coexistence (CRITICAL):**
- Conflicts with uncommitted changes → **STOP and report**, never overwrite

## Knowledge System

**Gate rule: On any coding/modification/debugging task, the FIRST tool call MUST be `maestro search`. Do NOT read code or edit files until search is done.**

### Required search (every task, no exceptions)

```bash
maestro search "<feature/module keywords>"
```

Then add follow-up searches based on results:
- Specific symbol/function → `maestro kg search <symbol>` or `maestro kg context <node>`
- Architecture/testing → `maestro search --type spec --category arch|test`
- Call chains → `maestro kg callers <fn>` / `maestro kg callees <fn>`
- Domain rules → `maestro spec load --category <cat> [--keyword <kw>]`

### Record

- **Spec** → `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"`
- **Knowhow** → persist non-obvious knowledge (deviations, root causes, constraints)

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, tests→`test`.

### Confidence & Conflict Marking

When search results conflict with current context, **mark the entry**:

```bash
maestro spec conflict mark <file> <line> --note "<conflict reason>"
maestro spec conflict list                    # view all marked entries
```

Confidence levels: `high` (verified) → `medium` (default) → `low` (stale) → `contested` (conflict detected).

- `contested` → 注入时排末尾，`[CONTESTED]` 标记 + 冲突说明
- `low` → `[LOW CONFIDENCE]` 标记
- 消除由 `/manage-knowledge-audit` 审查命令专门处理
