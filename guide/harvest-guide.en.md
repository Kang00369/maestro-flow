# Knowledge Harvest Guide

The Maestro knowledge harvest system transforms knowledge fragments generated during execution from "session temporary files" into "persistent, searchable project assets."

---

## 1. Overview

### Knowledge Loop

Knowledge harvesting is the core component of the Maestro knowledge loop:

```
Execution artifacts → harvest extraction → route dispatch → persistent storage → downstream consumption
       ↑                                                                        ↓
       └──────────── feeds back into new execution ←───────────────────────────┘
```

Three phases of the loop:

| Phase | Action | Corresponding Command |
|-------|--------|----------------------|
| **Extract** | Extract knowledge fragments from workflow artifacts | `/manage-harvest` |
| **Route** | Auto-route by category to wiki / spec / issue | Harvest internal classification engine |
| **Persist** | Write to persistent storage for subsequent command consumption | wiki / spec / issue infrastructure |

### Three Knowledge Stores

| Store | Path | What It Holds | Who Consumes |
|-------|------|---------------|--------------|
| **Wiki** | `.workflow/wiki/` | Observations, general insights, knowledge graph | `/wiki-connect`, `/wiki-digest` |
| **Spec** | `.workflow/specs/` | Coding conventions, architecture decisions, pattern rules | `/spec-load`, Hook auto-injection |
| **Issue** | `.workflow/issues/issues.jsonl` | Unresolved bugs, risks, TODOs | `/manage-issue`, `/maestro-analyze --gaps` |

### Relationship with Knowhow

Harvest extracts fragments and routes them to wiki/spec/issue. Knowhow (`.workflow/knowhow/`) is an independent, complete knowledge document system created proactively via `/manage-knowhow-capture`. The two are complementary:

- **Harvest**: Passive recovery — automatic extraction from existing artifacts
- **Knowhow**: Active capture — manual or on-demand entry by humans or agents

---

## 2. manage-harvest Details

### Command Syntax

```bash
/manage-harvest                                      # Scan all artifacts, interactive selection
/manage-harvest <session-id>                         # Harvest specified session
/manage-harvest <path>                               # Harvest specified directory
/manage-harvest --recent 7                           # Only last 7 days
/manage-harvest --source analysis                    # Only harvest analysis artifacts
/manage-harvest <target> --to wiki                   # Force all routes to wiki
/manage-harvest <target> --dry-run                   # Preview without writing
```

### Three Modes

| Mode | Trigger Condition | Behavior |
|------|-------------------|----------|
| **scan** | No arguments | Scan all Source Registries, list harvestable artifacts, interactive selection |
| **session** | Pass session ID (e.g., `ANL-auth-20260410`, `WFS-xxx`) | Precisely locate artifacts of the specified session |
| **path** | Pass file path (e.g., `.workflow/.analysis/ANL-auth-20260410/`) | Load and extract from specified directory |

### Source Registry

Harvest scans the following 8 artifact source types:

| Source Type | Scan Path | Key Files | ID Pattern |
|-------------|-----------|-----------|------------|
| `analysis` | `.workflow/.analysis/ANL-*/` | `conclusions.json`, `*.md` | `ANL-*` |
| `brainstorm` | `.workflow/scratch/brainstorm-*/` | `guidance-specification.md` | Directory name |
| `lite-plan` | `.workflow/.lite-plan/*/` | `plan.json`, `plan-overview.md` | Directory name |
| `lite-fix` | `.workflow/.lite-fix/*/` | `fix-plan.json` | Directory name |
| `debug` | `.workflow/.debug/*/` | `debug-log.md`, `hypothesis-*.md` | Directory name |
| `scratchpad` | `.workflow/.scratchpad/` | `*.md`, `*.json` | File name |
| `session` | `.workflow/active/WFS-*/` | `workflow-session.json` | `WFS-*` |
| `knowhow` | `.workflow/knowhow/` | `*.md`, `digest-*.md` | File name |

Use `--source <type>` to limit scanning to a single type, `--source all` to scan all (default).

### Extraction and Classification

Each artifact source has a dedicated extraction pattern:

| Artifact Source | What Is Extracted |
|----------------|-------------------|
| analysis | findings, recommendations, risks |
| brainstorm | options, decision, trade-offs, action items |
| lite-plan | task rationale, dependencies, risks |
| lite-fix | root_cause, fix_strategy, verification |
| debug | Final diagnosis, verified hypotheses, rejected hypotheses with reasons |
| scratchpad | Markdown sections, code blocks with descriptions |
| session | completed_tasks, key_decisions, deferred_items |

Each fragment is tagged with a category label and assigned a confidence score (0.0-1.0). `--min-confidence N` (default 0.5) filters out low-quality fragments.

### Routing Classification Rules

| Category | Default Route | Rationale |
|----------|--------------|-----------|
| `finding` | wiki (note) | Observations belong in the knowledge graph |
| `decision` | wiki (spec) or spec (decision) | Architecture decisions → spec ADR or wiki spec entry |
| `pattern` | spec (pattern) | Reusable code patterns → coding conventions |
| `bug` | issue or spec (bug) | Active bugs → issue; fixed bugs → spec experience |
| `risk` | issue | Unmitigated risks → trackable issue |
| `task` | issue | Incomplete work → trackable issue |
| `knowhow` | wiki (knowhow) | Generalizable insights → wiki knowledge |
| `recommendation` | wiki (note) or issue | Actionable recommendations → issue; informational → wiki |

Use `--to wiki|spec|issue` to force override auto-classification. `--to auto` (default) uses the rules above.

### Deduplication Logic

Before writing, a four-level deduplication check ensures idempotency:

1. **harvest-log.jsonl**: Check by `fragment_id` (`HRV-{8 hex}`)
2. **wiki**: Search by title
3. **issues.jsonl**: Match by title/description
4. **specs/learnings.md**: Match by content

Duplicate fragments are marked `[SKIP-DUP]` and recorded in the harvest report.

### Output Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| harvest log | `.workflow/harvest/harvest-log.jsonl` | Traceability record for each routed item |
| harvest report | `.workflow/harvest/harvest-report-{date}.md` | Complete report for this harvest run |
| wiki entries | `.workflow/wiki/` | Entries routed to wiki |
| spec entries | `.workflow/specs/` | Entries routed to spec |
| issue entries | `.workflow/issues/issues.jsonl` | Entries routed to issue |

### Usage Scenarios

**Scenario 1: Milestone Knowledge Harvest**

A milestone is complete. Harvest knowledge from all analysis, debug, and planning artifacts:

```bash
/manage-harvest --recent 14            # Harvest last two weeks of artifacts
/manage-harvest --to wiki --dry-run    # Preview the effect of routing everything to wiki
```

**Scenario 2: Precisely Harvest a Specific Analysis Session**

```bash
/manage-harvest ANL-auth-20260410      # Harvest specified analysis session
```

**Scenario 3: Harvest Bug Patterns from Debug Artifacts**

```bash
/manage-harvest --source debug         # Only harvest debug artifacts
```

### Follow-up Actions

After harvesting completes, the command suggests follow-up routes:

```bash
# View wiki entries
maestro wiki list --type note

# Connect knowledge graph
/wiki-connect --fix

# Classify issues
/manage-issue list --source harvest

# View specs
/spec-load --role implement
```

---

## 3. manage-knowhow Details

### Command Syntax

```bash
/manage-knowhow                                  # List all (default)
/manage-knowhow list                             # List all
/manage-knowhow search "auth flow"               # Full-text search
/manage-knowhow view KNW-20260510-1430           # View specified entry
/manage-knowhow edit MEMORY.md                   # Edit system memory
/manage-knowhow delete TIP-20260510-0900         # Delete (confirmation required)
/manage-knowhow prune --tag deprecated --before 2026-04-01  # Batch cleanup
```

### Dual Storage Architecture

| Storage | Path | Format | Index |
|---------|------|--------|-------|
| **workflow** | `.workflow/knowhow/` | `{PREFIX}-*.md` | `.workflow/wiki-index.json` (WikiIndexer) |
| **system** | `~/.claude/projects/{project}/memory/` | `MEMORY.md` + topic `.md` files | None (flat files) |

Workflow storage is for within-project knowledge; system storage is for cross-session persistent memory. The command automatically determines which storage to operate on based on ID prefix (`KNW-*`, `TIP-*`, etc.) or file name.

### Subcommands

| Subcommand | Purpose | Notes |
|------------|---------|-------|
| `list` | List all entries in both stores | Supports `--tag`, `--type`, `--store` filters |
| `search <query>` | Full-text search across both stores | Sorted by relevance |
| `view <id\|file>` | View full entry text | Auto-detects storage |
| `edit <file>` | Edit system memory file | Can only edit system store |
| `delete <id\|file>` | Delete entry (confirmation required) | `MEMORY.md` is protected, cannot be deleted |
| `prune` | Batch cleanup of workflow entries | Requires at least one filter condition |

### Filter Flags

| Flag | Purpose |
|------|---------|
| `--store workflow\|system\|all` | Target storage (default `all`) |
| `--tag <tag>` | Filter by tag |
| `--type compact\|tip` | Filter by entry type |
| `--before <YYYY-MM-DD>` | Date upper bound |
| `--after <YYYY-MM-DD>` | Date lower bound |
| `--dry-run` | Preview destructive operations |
| `--confirm` | Skip confirmation prompts |

### 9 Knowhow Types

| Type | Prefix | Purpose | Typical Scenario |
|------|--------|---------|------------------|
| `session` | `KNW-` | Session state recovery | End of complex task, save progress before context switch |
| `template` | `TPL-` | Code/config templates | Extract common code patterns, save boilerplate |
| `recipe` | `RCP-` | Step-by-step guides | Document operational procedures, onboarding |
| `reference` | `REF-` | External document summaries | Import API docs, save URL summaries |
| `decision` | `DCS-` | Architecture decision records | Non-trivial design choices |
| `tip` | `TIP-` | Quick tips | Flash of insight, debugging tricks |
| `asset` | `AST-` | Code assets | API contracts, data models, prompts |
| `blueprint` | `BLP-` | Architecture blueprints | Module architecture design |
| `document` | `DOC-` | General documents | General fallback type |

All types share `WikiNodeType = 'knowhow'`, differentiated by the `type` field.

---

## 4. manage-knowhow-capture Details

### Command Syntax

```bash
/manage-knowhow-capture compact "Auth module dev progress"       # Session compression
/manage-knowhow-capture template                       # Interactive template entry
/manage-knowhow-capture recipe "Deployment process"                # Operation recipe
/manage-knowhow-capture reference --source https://...  # External document summary
/manage-knowhow-capture decision                       # Architecture decision record
/manage-knowhow-capture tip "TypeScript generic inference pitfall"    # Quick tip
/manage-knowhow-capture                                # Interactive selection (9 types)
```

### Capture Timing and Trigger Conditions

| Timing | Recommended Type | Description |
|--------|-----------------|-------------|
| End of complex task | `compact` / `session` | Save full context, recoverable next time |
| Discovering reusable code pattern | `template` | Extract as template, avoid duplicate coding |
| Completing an operational procedure | `recipe` | Record steps, team members can reuse |
| Reviewing important external docs | `reference` | Save summary, avoid re-reading original |
| Making architecture decision | `decision` | Record context, option comparison, rationale |
| Flash of insight or trick | `tip` | Quick note, avoid forgetting |
| Defining interface contracts | `asset` | Save API contracts, data models |
| Designing module architecture | `blueprint` | Record architecture design and related code paths |

### Output Path and Naming Convention

Files are written to `.workflow/knowhow/` with the naming format:

```
{PREFIX}-{YYYYMMDD}-{HHMM}.md
```

Examples: `KNW-20260513-1430.md`, `TPL-20260513-1500.md`

Each file includes YAML frontmatter:

```yaml
---
title: "Descriptive title"
type: template          # type
category: coding        # spec category (coding/arch/test/debug/review/learning)
created: "2026-05-13T14:30:00+08:00"
tags: [typescript, auth]
lang: typescript        # only for template
source: "https://..."   # only for reference
status: accepted        # only for decision
---
```

### Type Routing

The command supports automatic type recognition via tokens:

| Token | Type |
|-------|------|
| `compact`, `session` | session |
| `template`, `tpl` | template |
| `recipe`, `rcp` | recipe |
| `reference`, `ref` | reference |
| `decision`, `dcs`, `adr` | decision |
| `tip`, `note` | tip |
| `asset`, `ast` | asset |
| `blueprint`, `blp` | blueprint |
| `document`, `doc` | document |

### Content Structure by Type

**session (KNW-)**: Auto-extracted from current conversation — session ID, objective, execution plan (verbatim), working files, decision table, constraints, dependencies, known issues, change list, TODOs.

**template (TPL-)**: Requires language tag, parameter table, code block (copy-paste ready), dependency list.

**recipe (RCP-)**: Objective, prerequisites, numbered steps, expected results, common pitfalls.

**reference (REF-)**: Source URL, key takeaways, applicable scenarios, quick examples. Supports `--source` to extract directly from URL.

**decision (DCS-)**: Context, option comparison table (at least 2 rejected options), rationale, consequences (positive and negative).

**tip (TIP-)**: Minimal structure — title + content + auto-detected context.

---

## 5. Knowledge Flow Overview

### Complete Process

```
┌─────────────────────────────────────────────────────────┐
│                     Execution Phase                      │
│  maestro-analyze → maestro-plan → maestro-execute       │
│       ↓              ↓                ↓                 │
│   ANL-xxx/       plan-xxx/       code changes           │
│   brainstorm/    lite-plan/      debug-log/             │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                  Knowledge Harvest                       │
│  /manage-harvest                                        │
│  ├── Stage 1-2: Discover artifacts                      │
│  ├── Stage 3:   Extract fragments (category + confidence)│
│  ├── Stage 4:   Classify and route (auto / forced)      │
│  ├── Stage 5:   Preview and confirm                     │
│  ├── Stage 6:   Write to target storage + deduplicate   │
│  └── Stage 7-8: Deduplication check + generate report   │
└────┬──────────┬──────────┬──────────────────────────────┘
     │          │          │
     ▼          ▼          ▼
  ┌──────┐  ┌──────┐  ┌────────┐
  │ Wiki │  │ Spec │  │ Issue  │
  └──┬───┘  └──┬───┘  └───┬────┘
     │         │          │
     ▼         ▼          ▼
┌─────────────────────────────────────────────────────────┐
│                   Downstream Consumption                 │
│  wiki-connect / wiki-digest / spec-load / manage-issue   │
│  Hook auto-injection / maestro-plan --gaps               │
└─────────────────────────────────────────────────────────┘
```

### Active Knowledge Capture Parallel Path

```
Execution process → /manage-knowhow-capture → .workflow/knowhow/ → wiki-index.json → retrieval and reuse
                                              ↓
                              maestro knowhow search "keyword"
                              /manage-knowhow search "keyword"
```

### Collaboration with learn-* Commands

The `learn-*` series commands are another entry point into the knowledge loop. They produce learning insights during review and reflection phases:

| Command | Output | Routed To |
|---------|--------|-----------|
| `/learn-retro` | Git activity review, decision review | `specs/learnings.md` (`<spec-entry>`) |
| `/learn-decompose` | Task decomposition experience | knowhow (recipe) |
| `/learn-investigate` | Investigation process records | knowhow (reference / tip) |
| `/learn-follow` | Follow-up learning records | knowhow (reference) |
| `/learn-second-opinion` | Multi-perspective analysis results | wiki / spec |

`quality-retrospective` also writes insights from Phase reviews into `specs/learnings.md`. These entries can subsequently be discovered and routed by harvest again.

### Recommended Workflow

**Daily Development**

```
/maestro-execute → quick note on completion → /manage-knowhow-capture tip "discovered trick"
```

**Milestone Completion**

```
/manage-harvest --recent 30          # Harvest all artifacts
/manage-knowhow-capture compact      # Save current session state
/wiki-connect --fix                  # Connect knowledge graph
```

**Project Handoff**

```
/manage-knowhow list                 # View all knowledge entries
/manage-knowhow search "core concept"     # Search key knowledge
/spec-load --role implement          # Load implementation specs
```
