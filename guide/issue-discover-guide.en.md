# Issue Discovery Guide

A complete manual for the Maestro Issue system, covering issue discovery, management, and the full closure workflow.

---

## 1. Overview

### Positioning of the Issue System

The Maestro Issue system is a problem-tracking mechanism independent of the Phase pipeline. The Phase pipeline (analyze → plan → execute → verify) drives predefined development tasks, while the Issue system captures and manages problems discovered in the codebase — whether security vulnerabilities, performance bottlenecks, reliability defects, or maintainability concerns.

The two can operate independently or work in concert:

- **Independent operation**: Discover and manage Issues directly without affecting Phase progress
- **Linked mode**: Issues are injected into the Phase pipeline via the `--gaps` parameter to drive root cause analysis and remediation

### The Role of discover

`/manage-issue-discover` is the entry point of the Issue system, responsible for automatically discovering problems from the codebase. It provides two discovery modes:

- **Multi-perspective full scan**: 8 specialized perspectives analyze in parallel, providing comprehensive coverage of code quality dimensions
- **Prompt-driven exploration**: Deep, targeted exploration around user-specified concerns

Discovery results are automatically deduplicated, Issue records are generated, and they enter the Issue closure workflow.

---

## 2. manage-issue-discover in Detail

### Basic Usage

```bash
# Interactive mode selection
/manage-issue-discover

# Multi-perspective full scan
/manage-issue-discover multi-perspective

# Prompt-driven exploration
/manage-issue-discover by-prompt "Check API error handling completeness"

# Auto mode (skip confirmation)
/manage-issue-discover multi-perspective -y

# Specify file scope
/manage-issue-discover multi-perspective --scope=src/auth/**

# Deep exploration (by-prompt mode)
/manage-issue-discover by-prompt "Database query performance" --depth=deep
```

### Parameter Reference

| Parameter | Description | Default |
|-----------|-------------|---------|
| _(no parameter)_ | Interactive mode selection | — |
| `multi-perspective` | 8-perspective parallel scan | — |
| `by-prompt "..."` | Prompt-driven exploration | — |
| `-y` / `--yes` | Skip confirmation prompts | Confirmation required |
| `--scope=<pattern>` | File scan scope | `**/*` |
| `--depth=standard\|deep` | Exploration depth (by-prompt only) | `standard` |

---

### 8-Perspective Full Scan Mode

Full scan mode launches parallel analysis from 8 specialized perspectives, each handled by an independent Agent:

#### Perspective Definitions

| Perspective | Focus Area | Core Question |
|-------------|-----------|---------------|
| **SECURITY** | Authentication, authorization, input validation, secret management, injection attacks | What security vulnerabilities or unsafe patterns exist? |
| **PERFORMANCE** | N+1 queries, infinite loops, missing caches, memory leaks, large payloads | What performance bottlenecks or inefficient patterns exist? |
| **RELIABILITY** | Error handling, retry logic, race conditions, data integrity, graceful degradation | What failure modes are unhandled or could cause data loss? |
| **MAINTAINABILITY** | Code duplication, tight coupling, missing abstractions, unclear naming, dead code | What makes the codebase harder to understand or modify? |
| **SCALABILITY** | Hardcoded limits, single-thread bottlenecks, stateful assumptions, schema rigidity | What will break as load/data/users grow? |
| **UX** | Confusing flows, missing feedback, inconsistent behavior, accessibility gaps | What causes friction or confusion for end users? |
| **ACCESSIBILITY** | Screen readers, keyboard navigation, color contrast, ARIA labels, focus management | What barriers exist for users with disabilities? |
| **COMPLIANCE** | Missing logging, audit trails, data retention, privacy controls, regulatory requirements | Which regulatory or policy requirements are unmet? |

#### Execution Flow

The full scan runs in two concurrent batches (4 Agents per batch):

```
Batch 1: security, performance, reliability, maintainability
Batch 2: scalability, ux, accessibility, compliance
```

Each perspective Agent will:

1. Scan source files within the specified scope
2. Identify issues and record `file:line` evidence
3. Assess severity (critical / high / medium / low)
4. Suggest remediation direction

#### Result Deduplication

Raw findings from all perspectives are merged and deduplicated:

- Grouped by `file:line`
- Entries with description similarity > 80% are merged
- The record with the higher severity is retained

#### Output Example

```
Discovery Session: DBP-20260513-143022
Mode: multi-perspective
Raw findings: 47
Unique issues: 31

Per-perspective breakdown:
  SECURITY:        8 → 5 unique
  PERFORMANCE:     7 → 5 unique
  RELIABILITY:     6 → 4 unique
  MAINTAINABILITY: 5 → 4 unique
  SCALABILITY:     5 → 4 unique
  UX:              6 → 4 unique
  ACCESSIBILITY:   5 → 3 unique
  COMPLIANCE:      5 → 2 unique

Severity breakdown:
  critical:  3
  high:      8
  medium:   12
  low:       8

Next steps:
  /manage-issue list --severity critical
  /manage-issue list
  /manage-issue-discover by-prompt "..."
```

---

### by-prompt Mode

Prompt-driven mode performs deep, targeted exploration around user-specified concerns, suitable for focused investigation.

#### Execution Flow

1. **Decompose exploration dimensions**: The CLI delegate breaks the user Prompt into 3-5 searchable exploration dimensions, each containing a search pattern, file pattern, and finding criteria
2. **Collect code context**: For each dimension, perform semantic search and pattern search, collecting matching code snippets
3. **Iterative exploration loop** (up to 3 rounds):
   - Round 1: Analyze context, identify issues and coverage gaps
   - Round 2: Refine search patterns for gaps, search adjacent files, merge findings
   - Round 3: Final sweep covering undiscovered high-severity patterns and cross-module interactions
4. **Generate Issues**: Deduplicate and create Issue records

#### Use Cases

- Investigate problems in specific functional modules (e.g., "Check payment flow reliability")
- Targeted security audits (e.g., "Find SQL injection risks")
- Dependency analysis before code refactoring (e.g., "Analyze coupling between modules")
- Systematic investigation of user-reported issues

#### Options When No Prompt Is Specified

If no text is provided after `by-prompt`, the system prompts selection from preset directions:

- Error handling gaps
- API contract violations
- Test coverage gaps
- Custom (custom input)

---

### Artifact Paths

Each discovery session creates a complete artifact record under `.workflow/issues/discoveries/{SESSION_ID}/`:

| File | Description |
|------|-------------|
| `discovery-state.json` | Session metadata and progress tracking |
| `discovery-issues.jsonl` | Issues created in this session |
| `{PERSPECTIVE}-findings.json` | Raw findings per perspective (full scan mode) |
| `exploration-plan.json` | Exploration dimension definitions (by-prompt mode) |
| `{dimension}-context.md` | Code context collected per dimension |
| `exploration-log.md` | Round-by-round exploration log |

Session ID format: `DBP-{YYYYMMDD}-{HHmmss}`, e.g., `DBP-20260513-143022`.

---

### How Discovery Results Become Issues

The discovery workflow automatically performs the following conversion:

1. Raw findings are mapped to priority by severity: `critical → 1`, `high → 2`, `medium → 3`, `low → 4`
2. An Issue ID is generated (`ISS-YYYYMMDD-NNN` format), scanning existing Issues to avoid conflicts
3. A complete Issue record is constructed (including `context.location`, `fix_direction`, `tags`, etc.)
4. The record is written to two locations simultaneously:
   - `.workflow/issues/issues.jsonl` (global Issue list)
   - `.workflow/issues/discoveries/{SESSION_ID}/discovery-issues.jsonl` (session record)
5. The Issue starts in `registered` status, with source marked as `discovery`

---

## 3. manage-issue in Detail

`/manage-issue` manages the full Issue lifecycle with 6 subcommands.

### Basic Usage

```bash
# Create
/manage-issue create --title "Memory leak" --severity high

# List
/manage-issue list
/manage-issue list --severity critical --status open

# Details
/manage-issue status ISS-20260513-001

# Update
/manage-issue update ISS-20260513-001 --status in_progress --priority 1

# Close
/manage-issue close ISS-20260513-001 --resolution "Fixed memory leak"

# Link to task
/manage-issue link ISS-20260513-001 --task TASK-003
```

---

### Subcommand Details

#### create — Create an Issue

```bash
/manage-issue create --title "Title" [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--title TEXT` | Issue title (**required**, interactive prompt if missing) | — |
| `--severity VALUE` | critical / high / medium / low | `medium` |
| `--source VALUE` | planned / supplement / bug / review / verification / discovery / manual | `manual` |
| `--phase VALUE` | Phase reference, e.g., `01-auth` | — |
| `--milestone VALUE` | Milestone reference, e.g., `MVP` (auto-derived from `state.json`) | — |
| `--description TEXT` | Detailed description | Interactive prompt |
| `--priority NUMBER` | 1-5, lower is higher priority | `3` |
| `--tags TAG1,TAG2` | Tag list | — |

After creation, the system will:

1. Auto-generate an ID (`ISS-YYYYMMDD-NNN`, incrementing by date)
2. Prompt for additional context (background, reproduction steps, related Issues)
3. Check for cross-Milestone conflicts on `supplement` type Issues

#### list — List Issues

```bash
/manage-issue list [filter options]
```

| Option | Description |
|--------|-------------|
| `--status VALUE` | Filter by status: open / in_progress / completed / failed / deferred |
| `--phase VALUE` | Filter by Phase reference |
| `--milestone VALUE` | Filter by Milestone reference |
| `--severity VALUE` | Filter by severity |
| `--source VALUE` | Filter by source |
| `--all` | Include closed Issues (read from `issue-history.jsonl`) |

Output is sorted by priority ascending, severity descending.

#### status — View Issue Details

```bash
/manage-issue status ISS-20260513-001
```

Displays the full Issue details: title, status, severity, priority, description, fix direction, context, tags, affected components, history, and feedback.

#### update — Update an Issue

```bash
/manage-issue update ISS-20260513-001 [field options]
```

| Option | Description |
|--------|-------------|
| `--status VALUE` | New status: open / in_progress |
| `--priority NUMBER` | New priority: 1-5 |
| `--severity VALUE` | New severity |
| `--tags TAG1,TAG2` | Replace tags |
| `--add-tag TAG` | Append a tag |
| `--phase VALUE` | Set Phase reference |
| `--milestone VALUE` | Set Milestone reference |
| `--fix-direction TEXT` | Set fix direction |
| `--description TEXT` | Update description |
| `--note TEXT` | Add a feedback entry |

Status changes are automatically recorded in `issue_history`.

#### close — Close an Issue

```bash
/manage-issue close ISS-20260513-001 --resolution "Fix description" [--status completed]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--resolution TEXT` | Resolution description (**required**) | Interactive prompt |
| `--status VALUE` | Final status: completed / failed / deferred | `completed` |

Closing moves the Issue from the active list to the history list.

#### link — Link an Issue to a Task

```bash
/manage-issue link ISS-20260513-001 --task TASK-003
```

Creates a bidirectional link:

- The Task ID is added to the Issue's `affected_components`
- The Issue ID is added to the Task's `issue_refs`

---

### issues.jsonl Format

All Issues are stored in JSONL (one JSON object per line), based on the `issue.json` template:

```json
{
  "id": "ISS-20260513-001",
  "title": "Refresh token not rotating correctly",
  "status": "registered",
  "priority": 1,
  "severity": "critical",
  "source": "discovery",
  "phase_ref": "01-auth",
  "milestone_ref": "MVP",
  "gap_ref": null,
  "description": "Refresh token does not rotate correctly under concurrent request scenarios...",
  "fix_direction": "Use database locks to ensure atomic token rotation",
  "context": {
    "location": "src/auth/token.ts:45",
    "suggested_fix": "Introduce optimistic locking mechanism...",
    "notes": "Discovered by SECURITY in DBP-20260513-143022"
  },
  "tags": ["SECURITY", "auth"],
  "affected_components": ["src/auth/token.ts"],
  "feedback": [],
  "issue_history": [
    {
      "timestamp": "2026-05-13T14:30:22.000Z",
      "from_status": null,
      "to_status": "registered",
      "actor": "discovery-agent",
      "note": "Issue created"
    }
  ],
  "created_at": "2026-05-13T14:30:22.000Z",
  "updated_at": "2026-05-13T14:30:22.000Z",
  "resolved_at": null,
  "resolution": null
}
```

**Storage locations**:

| File | Description |
|------|-------------|
| `.workflow/issues/issues.jsonl` | Active Issues (not closed) |
| `.workflow/issues/issue-history.jsonl` | Closed Issues (archived) |

---

### Status Transitions

The complete Issue status lifecycle:

```
registered → open → in_progress → completed
                                → failed
                                → deferred
```

| Status | Description | Typical Trigger |
|--------|-------------|-----------------|
| `registered` | Initial state, created by discover | Auto-discovery |
| `open` | Confirmed, pending action | Manual creation or confirmation of discovery results |
| `in_progress` | Being worked on | Remediation started |
| `completed` | Resolved | Fix completed and verified |
| `failed` | Remediation failed | Fix attempt unsuccessful |
| `deferred` | Postponed | Low priority or dependencies not ready |

Each status change records the timestamp, before/after status, actor, and note in `issue_history`.

---

## 4. Issue Closure Workflow

### Complete Process

The standard closure workflow from discovery to resolution:

```
discover → create → analyze → plan → execute → verify → close
```

#### 1. Discover Issues

```bash
# Full scan
/manage-issue-discover multi-perspective

# Or targeted exploration
/manage-issue-discover by-prompt "Check authentication module security"
```

#### 2. Review Discovery Results

```bash
# Filter by severity
/manage-issue list --severity critical

# View details
/manage-issue status ISS-20260513-001
```

#### 3. Root Cause Analysis

```bash
# Perform root cause analysis on a single Issue
/maestro-analyze --gaps ISS-20260513-001
```

The `--gaps` parameter injects the Issue as an analysis target into the Phase pipeline, generating a root cause report and Gap record.

#### 4. Solution Planning

```bash
# Generate a remediation plan based on Gaps
/maestro-plan --gaps
```

#### 5. Execute Fix

```bash
/maestro-execute
```

#### 6. Close Issue

```bash
/manage-issue close ISS-20260513-001 --resolution "Ensured atomic token rotation via optimistic locking"
```

### Shortcut Path

For urgent or simple issues, use `maestro-quick` to skip steps:

```bash
# Quick fix
/maestro-quick "Fix token rotation race condition"

# Then close
/manage-issue close ISS-20260513-001 --resolution "Fixed via maestro-quick"
```

### Integration with Roadmap/Milestone

The Issue system integrates deeply with the Roadmap/Milestone framework:

#### Milestone Association

- Specify the owning Milestone via `--milestone` when creating an Issue
- When unspecified, it is auto-derived from `current_milestone` in `.workflow/state.json`
- `supplement` type Issues automatically check for cross-Milestone file conflicts

#### Phase Association

- Issues can be linked to specific Phases via `--phase`
- The `--gaps` parameter converts Issues into Gaps injected into the Phase analysis flow
- Issues discovered during Phase execution can be bidirectionally linked to Tasks via the `link` command

#### Roadmap Feedback

Issue statistics (count, severity distribution, fix rate) inform Roadmap planning:

- Phases with high Issue density may need splitting or priority adjustment
- Cross-Milestone Issues require remediation time to be reserved during planning
- `supplement` type Issues can serve as requirement inputs for the next Milestone

#### Commander Agent Auto-Advancement

The Commander Agent automatically identifies unanalyzed Issues and advances their processing, eliminating the need for manual step-by-step operation. Combined with Hook automation, a fully automated closure workflow from discovery to resolution can be achieved.
