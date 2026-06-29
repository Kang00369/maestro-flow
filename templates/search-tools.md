# Search Tools

## Semantic Search Tool

@~/.maestro/templates/search-tool.json

## Priority

```
FastContext semantic locator → Grep/Read verification → MaestroGraph/KG for known symbols → Glob (files)
```

## Tool Selection

| Scenario | Tool |
|----------|------|
| Find by intent/behavior | FastContext (`mcp__fast_context__fast_context_search` in Codex, `mcp__fast-context__fast_context_search` in Claude) |
| Multi-angle codebase scan | Run 2-3 focused FastContext queries, then verify with `Grep`/`Read` |
| Known symbol or call chain | FastContext first, then `maestro kg context/callers/callees` for confirmation |
| Targeted code search (known scope) | FastContext or `Grep` with focused path filters |
| Known identifier/regex | `Grep` |
| Find files by name/ext | `Glob` |
| Deep cross-file reasoning | `maestro delegate --role analyze --mode analysis` |
| Read identified file | `Read` |

## FastContext Query Pattern

- Query: concrete behavior or symbol intent, not a keyword dump.
- Exclude: `node_modules`, `dist`, `.git`, `.workflow`, generated outputs.
- Use `max_turns: 1-2` for lookup, `3-4` only for broad tracing.
- Always inspect returned file ranges with `Grep`/`Read` before relying on them.

## Fallback

- **FastContext unavailable** → Grep + Glob pattern scanning, then MaestroGraph/KG for known symbols
- **KG unavailable** → Grep + Glob; log degraded mode
- **Grep insufficient** → Escalate to CLI delegate analysis

## Combined Strategy

For thorough exploration: FastContext (broad locator) → Grep (validate specific) → Read (deep examine) → KG call-chain lookup when symbols are known
