# Workflow: Brainstorm

Unified brainstorming workflow with dual-mode operation: auto pipeline (full multi-role analysis) and single role analysis mode.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  /maestro-brainstorm                    │
│           Unified Entry Point + Interactive Routing      │
└───────────────────────┬─────────────────────────────────┘
                        │
              ┌─────────┴─────────┐
              ↓                   ↓
    ┌─────────────────┐  ┌──────────────────┐
    │   Auto Mode     │  │ Single Role Mode │
    └────────┬────────┘  └────────┬─────────┘
             │                    │
    ┌────────┬──────────┬───────┐    │
    ↓        ↓          ↓       ↓    ↓
 Phase 2  Phase 3    Phase 4 Phase 5 Phase 3
Artifacts N×Role     Cross-  Apply  1×Role
          Design     Role    Resol. Design
                     Review
```

## Dual-Mode Routing

### Auto Mode (full pipeline)
Triggered by `--yes`/`-y` flag or user selection.

```
Phase 1: Mode Detection → Parse args, detect mode
Phase 1.5: Terminology & Boundary → Extract terms, collect Non-Goals
Phase 2: Interactive Framework → 7 sub-phases (context → topic → roles → questions → conflicts → check → spec)
Phase 3: Parallel Role Design → N concurrent design/{role}.md via role-design-author
Phase 4: Cross-Role Review → cross-role-reviewer agent finds conflicts / gaps / synergies (read-only)
Phase 5: Apply Resolutions → AskUserQuestion per finding → patch guidance §11 + design/{role}.md
```

### Single Role Mode
Triggered when first arg is a valid role name.

```
Phase 1: Mode Detection → Parse args, detect mode
Phase 3: Single Role Design → Detection → Context → Agent → Validation
```

## Input

- `$ARGUMENTS`: topic text (auto mode) or role name (single role mode)
- All output goes to `.workflow/scratch/brainstorm-{slug}-{date}/`
- Registers artifact (type=brainstorm) in state.json on completion

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--yes`, `-y` | Auto mode, skip all questions | - |
| `--count N` | Number of roles to select | 3 |
| `--session ID` | Use existing session | - |
| `--update` | Update existing analysis | - |
| `--include-questions` | Interactive context gathering | - |
| `--skip-questions` | Use default answers | - |
| `--style-skill PKG` | Style package for ui-designer | - |
| `--review-only` | Skip Phase 3 (role design); run only Step 4.5 + Step 5 on existing `design/*.md` | - |

### Available Roles

| Role ID | Title | Focus Area |
|---------|-------|------------|
| `data-architect` | 数据架构师 | Data models, storage strategies, data flow |
| `product-manager` | 产品经理 | Product strategy, roadmap, prioritization |
| `product-owner` | 产品负责人 | Backlog management, user stories, acceptance criteria |
| `scrum-master` | 敏捷教练 | Process facilitation, impediment removal |
| `subject-matter-expert` | 领域专家 | Domain knowledge, business rules, compliance |
| `system-architect` | 系统架构师 | Technical architecture, scalability, integration |
| `test-strategist` | 测试策略师 | Test strategy, quality assurance |
| `ui-designer` | UI设计师 | Visual design, mockups, design systems |
| `ux-expert` | UX专家 | User research, information architecture, journey |

## Output

### Directory Structure

All brainstorm output goes to scratch:
```
.workflow/scratch/brainstorm-{slug}-{date}/
├── guidance-specification.md     # Phase 2 output — machine contract (downstream consumes this)
├── design-research.md            # Optional Step 1.7 output
└── design/                       # Phase 3 per-role design
    ├── system-architect.md
    ├── ux-expert.md
    ├── data-architect.md
    └── {role}.md                 # one file per selected role
```

Clarifications and audit trail live in `guidance-specification.md` §11 Appendix.

---

## Process

### Step 1: Parse & Route (Mode Detection)

Parse $ARGUMENTS to determine execution mode:

**Mode Detection (ordered by priority)**:
1. `--review-only` flag → **Review-Only Mode** (requires `--session ID`; runs Step 4.5 + Step 5 only)
2. `--yes` or `-y` flag → **Auto Mode** (no question asked)
3. First non-flag arg matches valid role name → **Single Role Mode**
4. First non-flag arg is a number → **Phase Mode** (resolve phase dir, then auto)
5. Text provided without flags → Ask user via AskUserQuestion:
   - "自动模式 (推荐)" — 完整流程：框架生成 → 多角色并行设计 → 跨角色复审 → 决议回流
   - "单角色设计" — 为单个角色生成 design/{role}.md
   - "跨角色复审" — 已有多个 design/{role}.md，仅运行复审与决议回流

**Parameter Parsing**:
- `--count N`: cap at 9, default 3
- `--session ID`: target specific session
- `--style-skill PKG`: validate `.claude/skills/style-{PKG}/SKILL.md` exists
- Missing/empty args without flags = error E001

**Session Detection**:
- Check `.workflow/scratch/brainstorm-*/` for existing sessions
- Multiple → AskUserQuestion to select | Single → use it
- None + auto mode → will create new session
- None + single role mode → error E002

**Output Directory Resolution**:
- Phase mode (number): resolve `state.json.artifacts[phase == phaseNum].path` → `.workflow/{path}/.brainstorming/` (ERROR if phase not found)
- All output: `.workflow/scratch/brainstorm-{slug}-{date}/`
- Existing session: use existing session directory

---

### Step 1.5: Load Project Specs

```
specs_content = maestro spec load --category arch
```

Pass to role-design-author in Step 4 for architecture-aware role design.

---

### Auto Mode Steps (Phase 1.5 → Phase 1.7 → Phase 2 → Phase 3 → Phase 4)

### Step 1.7: External Research — Design Routes (Auto Mode, Optional)

Spawn `workflow-external-researcher` agent to discover design alternatives, architecture patterns, and competitive approaches for the brainstorm topic. This enriches the framework generation and role analyses with external knowledge.

**Trigger**: Always in auto mode. Skip if `--skip-questions` and no tech keywords detected.

**Auto-suggest when**: Topic contains technology keywords, architecture terms, or "design" / "pattern" / "alternative" in the description.

```
// Step 1.7.1: Spawn external researcher for design routes
Agent(
  subagent_type="workflow-external-researcher",
  prompt="""
<objective>
Research design alternatives and architecture patterns for: {topic}
Mode: Design Research
</objective>

<context>
Project specs: {specs_content or "none"}
Topic keywords: {extracted_keywords}
</context>

<task>
Search for:
1. Reference projects — how 2-3 similar projects/products solve this problem (architecture, key decisions, what worked)
2. Extractable patterns — reusable design patterns distilled from those projects, with applicability notes
3. Architecture approaches (at least 2-3 alternatives with trade-offs)
4. UX/UI patterns if applicable (interaction models, layout strategies)
5. Common design pitfalls and anti-patterns to avoid

IMPORTANT: Output MUST include "Reference Projects / Implementations" and "Extractable Patterns" sections.
Focus on design ROUTES — alternative approaches the brainstorm roles can evaluate.
Be prescriptive where evidence is strong, present alternatives where trade-offs exist.
Return structured markdown only — do NOT write files.
</task>
  """,
  run_in_background=false
)

// Step 1.7.2: Store as designResearchContext (in-memory)
designResearchContext = agent_output
```

`designResearchContext` is passed into:
- Step 2 (Terminology): enriches domain term extraction
- Step 3 Phase 1 (Topic Analysis): provides external design alternatives
- Step 4 (Parallel Role Design): each role-design-author receives design research as additional context

Also persisted to `{output_dir}/design-research.md` for future reference.

If research fails (W005): `designResearchContext = null`, continue without external context.

---

### Step 1.8: Load Project Context (if `.workflow/` exists)

Load existing project history to ground brainstorming in what's already been built:

- From `.workflow/project.md`: `### Validated` → already_shipped, `### Active` → current_scope, `## Context` → project_history
- From `.workflow/state.json.accumulated_context`: `deferred[]` → deferred_items, `key_decisions[]` → existing_constraints

Pass `project_context` into Step 2 (terminology) and Step 3 (framework generation):
- `already_shipped` informs what exists — brainstorm should explore extensions, not re-invent
- `deferred_items` are high-value brainstorming seeds
- `lessons_learned` surface pitfalls to avoid

---

### Step 2: Terminology & Boundary Definition (Auto Mode)

Extract core terminology and define scope boundaries before framework generation.

1. Analyze topic description and any project context (project.md, roadmap.md, project_context from Step 1.8)
2. Extract 5-10 core domain terms:
   - term (canonical), definition, aliases, category (core|technical|business)
3. AskUserQuestion for Non-Goals (multiSelect=true):
   - Generate 4-5 context-aware exclusion candidates based on topic
   - Include "其他（请补充）" option for custom exclusions
   - If user selects "其他", follow up with free-text question
4. Store terminology table and non_goals to session state

**Skip if**: `--yes` flag (use auto-generated terms, empty non-goals)

### Step 3: Interactive Framework Generation (Auto Mode)

Seven sub-phases producing guidance-specification.md:

**Phase 0: Context Collection**
- Read init outputs directly: `.workflow/project.md` (tech stack, requirements, decisions), `.workflow/state.json` (project state), `.workflow/specs/` (conventions)
- If `.workflow/` does not exist: continue without project context

**Phase 1: Topic Analysis**
- Load Phase 0 context (tech_stack, modules, conflict_risk)
- Deep topic analysis (entities, challenges, constraints, metrics)
- Generate 2-4 context-aware probing questions via AskUserQuestion
- Questions MUST reference topic keywords (no generic questions)
- Store to `session.intent_context`

**Phase 2: Role Selection**
- Analyze Phase 1 keywords → recommend count+2 roles with rationale
- AskUserQuestion (multiSelect=true) for user to select `count` roles
- If `--yes`: auto-select recommended roles
- Store to `session.selected_roles`

**Phase 3: Role-Specific Questions**
- FOR each selected role, generate 3-4 deep questions mapping role expertise to Phase 1 challenges
- AskUserQuestion per role (sequential, one role at a time)
- Questions must include: implementation depth, trade-offs, edge cases
- Store to `session.role_decisions[role]`
- If `--yes`: skip all role questions

**Phase 4: Conflict Resolution**
- Analyze Phase 3 answers for contradictions, missing integrations, implicit dependencies
- Generate clarification questions referencing SPECIFIC Phase 3 choices
- AskUserQuestion (max 4 per round)
- If NO conflicts detected: skip with notification
- Store to `session.cross_role_decisions`

**Phase 4.5: Final Clarification + Feature Decomposition**
- Ask: "是否有前面未澄清的重点需要补充？" (无需补充 / 需要补充)
- If "需要补充": progressive questions until resolved
- Extract candidate features from all Phase 1-4 decisions (max 8)
- Each feature: F-{3-digit} ID, kebab-case slug, description, related roles, priority
- Validate: independence, completeness, granularity balance, boundary clarity
- AskUserQuestion for user to confirm or adjust feature list
- Store to `session.feature_list`

**Phase 5: Generate Specification**
- Load all decisions + terminology + non_goals + feature_list
- Transform Q&A to declarative statements (CONFIRMED/SELECTED)
- Apply RFC 2119 keywords (MUST, SHOULD, MAY, MUST NOT, SHOULD NOT)
- Write `guidance-specification.md` with sections:
  1. Project Positioning & Goals
  2. Concepts & Terminology (table)
  3. Non-Goals (Out of Scope)
  4-N. [Role] Decisions (with RFC 2119)
  Cross-Role Integration
  Risks & Constraints
  Feature Decomposition (table)
  Appendix: Decision Tracking
- Validate: no interrogative sentences, all decisions traceable, RFC keywords applied

**Output**: `{output_dir}/guidance-specification.md`, session metadata (workflow-session.json)

### Step 3.5: Visual Style Foundation (Auto Mode, conditional)

When `ui-designer` is among the selected roles, establish the project's visual direction before role analysis begins. This ensures all downstream UX analysis works within a confirmed design system.

**Condition**: Skip if `.workflow/impeccable/DESIGN.md` already exists (visual direction already locked).

**Execution** (sequential):

1. **Product context** — if `.workflow/impeccable/PRODUCT.md` missing:
   ```
   Skill({ skill: "maestro-impeccable", args: "teach" })
   ```
   This runs the teach interview to establish brand, users, personality, anti-references.

2. **Visual exploration** — multi-style comparison and selection:
   ```
   Skill({ skill: "maestro-impeccable", args: "explore" })
   ```
   This generates multiple design system variants as HTML prototypes, launches visual comparison, and lets the user select/mix. Produces DESIGN.md on completion.

3. Record in session metadata: `design_system_established: true`, `design_md_path: ".workflow/impeccable/DESIGN.md"`

**`--yes` mode**: `explore` auto-selects variant 1 without visual comparison. `teach` still requires minimal input if PRODUCT.md is missing.

**Skip mode**: If user explicitly passes `--skip-design` to brainstorm, skip this step entirely. ui-designer role will generate its own independent theme in Phase 2.

### Step 4: Parallel Role Design (Auto Mode)

For EACH selected role, spawn a `role-design-author` agent in parallel. Each agent produces exactly one file: `{output_dir}/design/{role}.md`.

```
Agent({
  subagent_type: "role-design-author",
  prompt: """
    role_name: {role}
    role_template_path: ~/.maestro/templates/planning-roles/{role}.md
    guidance_path: {output_dir}/guidance-specification.md
    output_path: {output_dir}/design/{role}.md
    feature_list: <F-id + slug + title rows from guidance §10>
    design_research: {output_dir}/design-research.md if exists, else null
    project_specs: {specs_content or null}
    user_context: {session.role_decisions[role] if any}
    style_skill: {style_skill_path if role == ui-designer and provided}

    Write the design document per the role template's "Brainstorming Analysis Structure".
    Reference guidance decisions by ID (e.g., SA-03) — do NOT copy decision text.
    All behavioural statements MUST use RFC 2119 keywords.
  """,
  run_in_background: false
})
```

**Output Contract**: each agent writes exactly one file at `design/{role}.md` with three sections:
1. **Role Mandate** (≤ 200 words) — what this role decides, what it defers
2. **Cross-Cutting Foundations** — per the role template's required subsections (data model, FSM, etc. for system-architect; pitfall taxonomy etc. for SME; information architecture etc. for ux-expert)
3. **Per-Feature Design** — one subsection per feature in feature_list, each referencing ≥ 1 guidance decision ID

See `.claude/agents/role-design-author.md` for the full output contract.

**Quality Validation** (orchestrator self-check after each agent returns):
- Verify `design/{role}.md` exists and is non-empty
- Grep for RFC 2119 keywords (MUST / SHOULD / MAY / MUST NOT / SHOULD NOT) — warn if < 5 occurrences
- If feature_list available: verify §3 has one subsection per feature ID
- Check line count — warn if > 1500 lines (hard cap per agent contract)
- system-architect specifically: verify §2 contains "Data Model" and "State Machine" headings

**Parallel Safety**: Each agent writes only to its own `design/{role}.md`. No shared output, no cross-agent dependencies.

### Step 4.5: Cross-Role Review (Auto Mode)

After all role design files are produced, spawn ONE `cross-role-reviewer` agent to identify conflicts / gaps / synergies across the role files. The agent is read-only and returns structured text.

```
Agent({
  subagent_type: "cross-role-reviewer",
  prompt: """
    design_files:
      - {output_dir}/design/{role_1}.md
      - {output_dir}/design/{role_2}.md
      - ...
    guidance_path: {output_dir}/guidance-specification.md
    feature_list: <F-id + slug + title rows from guidance §10>

    Identify conflicts, gaps, and synergy opportunities across these role design files.
    Cite role files by section. Reference guidance decisions by ID.
    Return the structured report — do NOT write files.
  """,
  run_in_background: false
})
```

**Agent output** (parsed by orchestrator):
- `conflicts[]` — C-IDs with role-A vs role-B contradictions, suggested resolution, confidence
- `gaps[]` — G-IDs naming an owner role to fill the missing definition
- `synergies[]` — S-IDs with concrete patch suggestions (which file, which section, what text)

Store as `review_findings` in session memory. Skip Step 5 entirely if all three arrays are empty.

If `--yes` flag set: auto-apply each finding's suggested resolution without AskUserQuestion (still proceed to Step 5 writeback).

### Step 5: Apply Cross-Role Resolutions (Auto Mode)

Consume `review_findings` from Step 4.5 and apply user-confirmed resolutions to both `guidance-specification.md` and the relevant `design/{role}.md` files.

**Sub-phase 5.1: Interactive Confirmation (skip if `--yes`)**
- For each finding (conflicts → gaps → synergies, in that order), call AskUserQuestion (max 4 per round):
  - **Conflict question** options: "Accept suggested resolution" (recommended) / "Pick role A's stance" / "Pick role B's stance" / "Defer to TODO"
  - **Gap question** options: "Accept suggested addition" (recommended) / "Skip this gap" / "Defer to TODO"
  - **Synergy question** options: "Apply patch" (recommended) / "Skip"
- Question text MUST cite the exact role file + `target_heading` from the agent output (heading text, not section number).
- Store user choices as `resolutions[]`.

**Sub-phase 5.2: Apply Patches to Role Files**

The reviewer's output includes a `patch_targets[]` block per finding with closed-vocabulary `edit_type` (`annotate_after_heading` / `annotate_and_strikeout` / `append_to_section`). The orchestrator consumes these directly — do NOT re-parse the prose.

For each accepted finding, iterate over its `patch_targets[]`:

**Conflict patches** (edit_type usually `annotate_and_strikeout`):
- Locate `target_heading` in `target_file` via Edit string match (heading text MUST match verbatim).
- Insert `edit_content` (a `> blockquote` Cross-Role Resolution line) immediately after the matched heading.
- Wrap the original paragraph below the heading in `<!-- superseded by C-XXX -->` … `<!-- /superseded -->` HTML comments so the original text stays readable but downstream tooling treats it as non-authoritative.
- If the user chose "Pick role A's stance" → strikeout role B's site only; vice versa. If "Accept suggested resolution" → strikeout BOTH role-A and role-B sites (both supersede to the new resolution).

**Gap patches** (edit_type pair: `annotate_after_heading` at reference site + `append_to_section` at owner site):
- At reference site: insert the breadcrumb annotation pointing to the owner site.
- At owner site: append the actual definition content (1-3 lines from `edit_content`).
- Both edits MUST succeed; if owner-site append fails, roll back reference-site annotation.

**Synergy patches** (edit_type `annotate_after_heading` × 2):
- Insert cross-reference annotations in BOTH role files. Synergy is symmetric — alignment must be visible from either entry point.
- Original content untouched.

**Edit failure handling**:
- If `target_heading` does not match verbatim, log the finding ID and target, skip the patch, and surface to the user in Step 7 final report ("3 patches skipped — heading drift").
- Never invent the heading; refusal to patch is safer than wrong patch.

**Sub-phase 5.3: Append to guidance §11**
Append a new subsection to `guidance-specification.md` §11 Appendix capturing the audit trail:
```markdown
### Cross-Role Resolutions (added {date})
| ID | Type | Source(s) | Resolution | Applied to |
|---|---|---|---|---|
| C-001 | conflict | system-architect.md "### 3.4 F-002 — Skill Engine" / sme.md "### 3.4 F-002 — Skill Engine" | {answer} | system-architect.md "### 3.4 F-002 — Skill Engine" |
| G-001 | gap | ux-expert.md "### 3.2 F-005 — Ink TUI Frontend" | {answer} | data-architect.md "### 2.3 YAML Schemas" |
| S-001 | synergy | ux-expert.md "### 8. Pruned-Frame Expand" / sme.md "### 6. NDJSON Transcript" | applied | both annotated |
```

**Sub-phase 5.4: Finalization**
- Update session metadata (`review_findings_count`, `resolutions_applied`, `completion_status`).
- Emit completion report (see Step 7).

---

### Single Role Mode Steps

### Step 6: Single Role Design

Execute design for ONE specified role with optional interactive context gathering.

**Step 6.1: Detection & Validation**
- Validate role_name against VALID_ROLES list
- Detect session (--session or find existing)
- Check for guidance-specification.md → framework_mode
- Extract feature list from guidance §10 → feature_mode
- Check existing `design/{role}.md` → update_mode (ask: update/regenerate/cancel)

**Step 6.2: Interactive Context Gathering**
- Skip if `--skip-questions`
- Force if `--include-questions`
- Generate 3-5 role-specific questions (Chinese, with business context)
- AskUserQuestion per batch (max 4 per round)
- Pass collected answers as `user_context` to the agent (in-memory; not persisted to a separate file)

**Step 6.3: Agent Execution**
- Spawn role-design-author with full Inputs block (see Step 4 schema)
- Agent writes `{output_dir}/design/{role}.md`

**Step 6.4: Validation**
- Verify `design/{role}.md` exists and is non-empty
- Check framework reference if framework_mode
- Update session metadata with completion status
- Report results with next step suggestions

---

### Review-Only Mode Steps

### Step 6.5: Review-Only Mode

Triggered by `--review-only --session ID`. Skips Phase 3 entirely; runs only Step 4.5 + Step 5 against the existing `design/*.md` files.

**Step 6.5.1: Validation**
- Require `--session ID`. Error E002 if missing.
- Glob `{output_dir}/design/*.md`. Error E006 if zero files found (nothing to review).
- Require `guidance-specification.md` to exist (for decision-ID context). Error E007 if missing.

**Step 6.5.2: Execute Step 4.5 + Step 5**
- Reuse the exact same logic as auto mode Step 4.5 (spawn cross-role-reviewer) and Step 5 (interactive confirmation + patch application + guidance §11 audit).
- Skip Step 5.1 interactive confirmation if `--yes` also passed.

**Step 6.5.3: Report**
- Same as review-only mode report in Step 7.

---

### Step 7: Final Report

**Auto mode report:**
- Session ID and output directory
- Roles designed (N) — list each `design/{role}.md` path
- Features in scope (N, from guidance §10)
- Cross-role review: conflicts / gaps / synergies counts
- Resolutions applied: count + a breakdown by type (C/G/S)
- Next:
  Skill({ skill: "maestro-roadmap", args: "--mode full --from-brainstorm {sessionId}" })  — Generate full spec package
  Skill({ skill: "maestro-analyze", args: "{topic}" })   — Evaluate feasibility + lock decisions
  Skill({ skill: "maestro-analyze", args: "{phase} -q" })   — Quick decision extraction only
  Skill({ skill: "maestro-plan", args: "{phase}" })       — Plan directly (if scope is clear)

**Single role mode report:**
- Role designed
- Framework alignment status (does design reference guidance decisions?)
- Context questions answered (count)
- Output file: `design/{role}.md`
- Next:
  - Run more roles: `Skill({ skill: "maestro-brainstorm", args: "{another-role} --session {sessionId}" })`
  - When 2+ roles are done, trigger review: `Skill({ skill: "maestro-brainstorm", args: "--review-only --session {sessionId}" })`

**Review-only mode report:**
- Session ID and existing roles found (N)
- Cross-role review: conflicts / gaps / synergies counts
- Resolutions applied: count + breakdown by type (C/G/S)
- Patches skipped due to heading drift: count (if any)
- Same Next-step routing as auto mode

---

## Quality Criteria

- If `designResearchContext` is set: guidance-specification.md references external design findings
- guidance-specification.md uses RFC 2119 keywords (MUST/SHOULD/MAY)
- Concepts & Terminology section with 5-10 core terms
- Non-Goals section with rationale
- Feature Decomposition table (max 8 features, independently implementable)
- Each `design/{role}.md` follows the role template's structure and references guidance decisions by ID
- system-architect's `design/system-architect.md` §2 includes: Data Model, State Machine, Error Handling, Observability
- Each `design/{role}.md` ≤ 1500 lines (hard cap per agent contract)
- Cross-role review runs (Step 4.5) and produces structured findings (conflicts / gaps / synergies) with `patch_targets[]` blocks
- **If review yielded findings**: each accepted resolution is annotated in the affected `design/{role}.md` AND logged in guidance §11 "Cross-Role Resolutions" subsection
- **If review yielded zero findings**: guidance §11 unchanged; final report explicitly notes "No cross-role issues detected"
- Heading-drift patch failures (if any) are surfaced in the final report, not silently dropped
