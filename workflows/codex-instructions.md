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

**注入行为**：
- `contested` → 排末尾，`[CONTESTED]` 标记 + 冲突说明
- `low` → `[LOW CONFIDENCE]` 标记

**冲突消除**（通过审查命令处理）：
- `/manage-knowledge-audit --scope spec` — 批量审查所有冲突/降级条目，三态决策（keep/deprecate/delete）
- `maestro spec conflict clear <file> <line>` — 逐条清除已解决的冲突
- `maestro spec conflict clear-all <file>` — 批量清除文件内所有标记
- `maestro spec conflict set-confidence <file> <line> high` — 审查后提升置信度
