<!-- session-mode: none -->
# Knowledge System Operations

This guide contains the operational detail intentionally omitted from managed
agent core instructions. Core instructions retain only the mandatory knowledge
gate and infrastructure invariants.

## Search And Load

```bash
maestro search "<query>" [--type <type>] [--category <category>] [--code] [--kg]
maestro load --type <type> [--list] [--category <category>] [--keyword <word>] [--id <id>]
```

Supported types include `spec`, `knowhow`, `domain`, `issue`, `session`,
`scratch`, `note`, `project`, and `roadmap`. Spec categories include `coding`,
`arch`, `debug`, `test`, `review`, `learning`, and `ui`.

Use 1-3 core keywords per query. Separate concepts from code symbols, add
`--code` for code entities, and add `--kg` when cross-layer context matters.
Inspect every cited source file and line range before editing or concluding.

## Infrastructure Recovery

The knowledge graph is baseline project infrastructure:

- If `.workflow/kg/maestro.db` is missing, run
  `maestro kg init && maestro kg sync`.
- Apply the same recovery when search is BM25-only, code search is unexpectedly
  empty, or graph commands report an uninitialized graph.
- Before broad refactors, major renames, or call-chain work, run
  `maestro kg sync --full`.
- Use `maestro kg health`, `maestro kg stats`, and `maestro wiki health` for
  staleness and graph-health checks.
- Do not fall back to blind grep merely because the graph is unavailable.

## Recording Routes

| Knowledge shape | Route |
|-----------------|-------|
| Short durable rule or constraint | `/maestro-spec "<constraint>"` |
| Longer recipe, decision, reference, or code knowledge | `/maestro-knowhow "<capture intent>"` |
| Domain term | `/maestro-knowledge "register domain term <term>"` |
| Contradictory code evidence | `maestro spec conflict mark <file> <line> --note "<reason>"` |
| Cleanup, audit, and extraction | `/maestro-knowledge "<audit or harvest intent>"` and structured `maestro spec conflict` commands |

Category routing: decisions -> `arch`; implementation patterns -> `coding`;
pitfalls and root causes -> `debug` or `learning`; quality rules -> `review`;
test rules -> `test`; UI rules -> `ui`.

## Supersession And Conflict

These are distinct relationships:

| Relationship | Use when | Effect |
|--------------|----------|--------|
| `supersede` | A new rule replaces an obsolete rule | The old entry becomes `deprecated`; evolution history is preserved |
| `conflict` | Both positions remain plausible and need human adjudication | The old entry becomes `contested` and receives reduced search weight |

```bash
maestro spec supersede <old-sid> --by <new-sid>
maestro spec conflict mark <file> <line> --note "<reason>"
```

Confidence levels are `high`, `medium`, `low`, and `contested`. Prefer a
`/maestro-knowledge` audit for bulk cleanup; otherwise use structured
`maestro spec conflict list/clear/set-confidence` commands. Artifact and
session extraction also routes through `/maestro-knowledge` with a harvest
intent.

## Health And History

```bash
maestro spec health
maestro spec backfill-sid
maestro spec history <sid>
```
