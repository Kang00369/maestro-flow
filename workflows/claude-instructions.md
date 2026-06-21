# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

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
- **Knowhow** → `/manage-knowhow-capture` (use `--spec-category <cat>` to bridge into agent injection)

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, tests→`test`.

### Confidence & Conflict Marking

When search results conflict with current context, mark the entry:

```bash
maestro spec conflict mark <file> <line> --note "<conflict reason>"
maestro spec conflict list                    # view all marked entries
maestro spec conflict clear <file> <line>     # clear after audit resolution
```

Confidence levels: `high` (verified) → `medium` (default) → `low` (stale) → `contested` (conflict detected).

- `contested` entries are injected last with `[CONTESTED]` badge + conflict note
- `low` entries show `[LOW CONFIDENCE]` badge
- Use `/manage-knowledge-audit` to review and resolve all conflicts
