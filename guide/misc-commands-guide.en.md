# Miscellaneous Commands Guide

Auxiliary commands for maintenance, release, and spec management in Maestro workflows.

---

## 1. maestro-amend — Incremental Patching

### Purpose

Signal-driven Overlay generator. Collects workflow defect signals from multiple sources, diagnoses which commands need amendments, and batch-generates targeted Overlay patches. All modifications are applied through the Overlay system (`~/.maestro/overlays/*.json`) — without modifying original command files. The process is idempotent and persists across reinstalls.

Unlike `/maestro-overlay` (explicit single creation), `/maestro-amend` automatically **discovers** what needs fixing by analyzing workflow artifacts.

### Use Cases

- `/maestro-verify` exposed missing command steps (e.g., missing pre-checks, insufficient validation)
- `/quality-review` identified process-level deficiencies (not code bugs)
- Workflow execution deviations traced back to incomplete command definitions
- Issue tracking shows recurring problems rooted in command design

### Signal Sources

| Flag | Source | What It Collects |
|------|--------|-----------------|
| `--from-verify <dir>` | verification.json | Workflow gaps exposed by verification failures |
| `--from-review <dir>` | review.json | Process defects found during code review |
| `--from-session <id>` | Session artifacts | Issues encountered during execution |
| `--from-issues ISS-xxx,...` | issues.jsonl | Issues traced back to command defects |
| `--scan` | Auto-scan .workflow/ | Discover all workflow-related signals |
| _(Positional text)_ | User description | Direct observations and explanations |

Multiple sources can be combined. Running without arguments enters interactive mode (auto-scan + user confirmation).

### Workflow

```
Collect Signals → Diagnose & Classify → Group & Plan → Preview & Confirm → Generate Overlay → Install
```

1. **Collect Signals**: Extract defect signals from specified sources. Signals are classified as "command defect" or "code bug" — the former proceeds, the latter is routed to other fix commands
2. **Diagnose & Map**: For each signal, determine the target command, target section, and patch mode (prepend/append/new-section)
3. **Group & Plan**: Group by target command + section, generate a section map, and display injection points
4. **Preview & Confirm**: Display the injection point map for user confirmation or editing
5. **Generate & Install**: Generate Overlay JSON files and install them into command files via `maestro overlay add`

### Control Options

```bash
# Preview mode (no installation)
/maestro-amend --dry-run

# Skip confirmation
/maestro-amend -y

# CLI target: claude (default) / codex / both
/maestro-amend "cli": "both"
```

### Common Usage

```bash
# Discover command gaps from verification results
/maestro-amend --from-verify .workflow/phases/1

# Extract process improvements from review results
/maestro-amend --from-review .workflow/phases/2

# Auto-scan all signals
/maestro-amend --scan

# Describe the problem directly
/maestro-amend "maestro-execute is missing a CLI compilation verification step"
```

---

## 2. maestro-update — Update Check

### Purpose

Detects the current `.workflow/` schema version, displays available migration plans, and executes version upgrades step by step in interactive mode. Supports incremental version chain upgrades (e.g., 1.0 → 2.0 → 3.0).

### Use Cases

- After a Maestro upgrade, the `.workflow/` directory structure or schema has changed
- Project was initialized early and needs migration to the new format
- Version compatibility check

### Check Scope

- The `version` field in `.workflow/state.json` (defaults to `"1.0"`)
- Migration registry under `src/migrations/` (each migration is a standalone file, e.g., `v1-to-v2.ts`)
- Migration chain is automatically derived: detect current version → traverse chain → apply in order

### Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview migration plan only, do not execute |
| `--force` | Skip confirmation prompts, apply all pending migrations |

### Execution Flow

```
Detect Version → Preview Plan → Step-by-Step Confirm → Execute Migration → Summary Report
```

1. **Detect Version**: Read `.workflow/state.json`, extract the `version` field
2. **Preview Plan**: Run the migration CLI in dry-run mode to display the full migration chain. Exit immediately if already up to date
3. **Step-by-Step Confirm**: Prompt user for each migration step (`--force` skips this). Options: yes / skip / abort
4. **Execute Migration**: Create a `state.json` backup before each step, display change details after execution. Restore from backup on failure
5. **Summary Report**: Display number of applied/skipped migrations and version changes

### Common Usage

```bash
# Check for pending migrations
/maestro-update --dry-run

# Interactive step-by-step upgrade
/maestro-update

# One-command full upgrade
/maestro-update --force
```

### Notes

- Skipping a migration step may break the version chain (the system will issue a warning)
- A backup is automatically created before each migration: `.workflow/state.json.backup-v{from}-{timestamp}`
- To manually restore after a failed migration: `cp .workflow/state.json.backup-v{from}-{timestamp} .workflow/state.json`

---

## 3. spec-remove — Spec Removal

### Purpose

Removes a specified `<spec-entry>` from a specs file. This is the symmetric counterpart to `/spec-add`, using `maestro wiki remove-entry` for atomic deletion with automatic index updates.

### Use Cases

- Spec entry is outdated or no longer applicable
- Spec has been superseded by a higher-priority entry
- Cleaning up duplicate or incorrect specs

### Entry ID Format

```
spec-{file-stem}-{NNN}
```

For example: `spec-learnings-003`, `spec-coding-conventions-001`. This ID is assigned by WikiIndexer when indexing `<spec-entry>` blocks.

### Finding Entry IDs

```bash
# List all spec entries
maestro wiki list --type spec --json

# Search by keyword
/spec-load --keyword auth
```

### Scope of Operation

- Removes the specified `<spec-entry>` block from the container file
- Wiki index is automatically updated
- Requires user confirmation (`-y` to skip)

### Common Usage

```bash
# Remove a specific entry
/spec-remove spec-learnings-003

# Find the target first with spec-load, then remove
/spec-load --keyword "deprecated-pattern"
/spec-remove spec-coding-conventions-001
```

### Notes

- Confirm `.workflow/specs/` is initialized before running (via `/spec-setup`)
- Entry ID must be a child node of the spec type — IDs of other types will be rejected
- Removal is irreversible (preview content with `/spec-load` first)

---

## 4. maestro-milestone-release — Milestone Release

### Purpose

Packages a completed milestone as a releasable version. Performs semver version bumping, generates or appends Changelog entries, creates an annotated git tag, and optionally pushes to the remote. This is the final delivery step in the SDLC cycle.

### Use Cases

- Milestone is complete and audited, ready for formal release
- Version management (patch / minor / major)
- Automated changelog generation

### Prerequisites

| Condition | Description |
|-----------|-------------|
| Milestone completed | `/maestro-milestone-complete` has been executed |
| Audit passed | Audit report verdict is PASS |
| Clean workspace | No uncommitted changes (except with `--dry-run`) |

### Flags

| Flag | Description |
|------|-------------|
| `<version>` | Explicitly specify version number (e.g., `1.2.0`) |
| `--bump patch\|minor\|major` | Increment based on current version (default: `minor`) |
| `--dry-run` | Calculate version, preview Changelog and tag, without writing |
| `--no-tag` | Skip git tag creation (version bump + Changelog only) |
| `--no-push` | Skip `git push --follow-tags` |

### Release Flow

```
Verify Prerequisites → Resolve Version → Collect Changes → Generate Changelog → Write Version → Create Tag → Push
```

1. **Verify Prerequisites**: Confirm milestone is complete, audit passed, and workspace is clean
2. **Resolve Version**: Calculate target version from explicit argument or `--bump`; version must be monotonically increasing
3. **Collect Changes**: Aggregate changes from milestone summary, phase summaries, and git log (since last tag)
4. **Generate Changelog**: Write to `CHANGELOG.md`, grouped by phase / change type
5. **Write Version**: Update manifest file (`package.json` / `pyproject.toml` / `Cargo.toml`, etc. — auto-detected), create a release commit
6. **Create Tag**: Create an annotated git tag `v{version}` with release notes
7. **Push to Remote**: `git push --follow-tags`

### Release Report

On completion, the following is displayed:

```
=== RELEASE COMPLETE ===
Version:   v{previous} → v{new}
Milestone: {milestone_name}
Tag:       v{new} {pushed|local-only}
Changelog: {N} entries written to CHANGELOG.md
Manifest:  {file_path} updated
```

### Relationship to Milestone Lifecycle

The complete milestone lifecycle is:

```
/maestro-milestone-complete  →  /maestro-milestone-audit  →  /maestro-milestone-release
```

- **`/maestro-milestone-complete`**: Archive the current milestone, advance to the next milestone. Generates summary.md
- **`/maestro-milestone-audit`**: Cross-phase integration verification, generates audit-report.md. Verdict must be PASS
- **`/maestro-milestone-release`**: Final release step, depends on the outputs of the previous two steps

The order cannot be reversed: complete produces summary → audit validates based on summary → release publishes based on audit results.

### Common Usage

```bash
# Standard release (minor version bump)
/maestro-milestone-release

# Patch version
/maestro-milestone-release --bump patch

# Explicitly specify version
/maestro-milestone-release 2.0.0

# Preview only, do not execute
/maestro-milestone-release --dry-run

# Release without pushing
/maestro-milestone-release --no-push
```

### Notes

- If the version manifest file does not exist or is unsupported, manually specify the version and use `--no-tag`
- If remote push fails (network/authentication issues), manually run `git push --follow-tags`
- `--dry-run` mode does not write any files or create tags — it only displays calculated results
