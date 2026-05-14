---
name: maestro-impeccable
description: Production-grade UI design with knowhow accumulation -- 24 commands + chain orchestration with quality gates + integrated design search
argument-hint: "<command|intent> [target] [--chain build|improve|enhance|harden|live] [--enhance <cmd>] [--threshold <score>] [--max-loops <n>] [--skip-harvest] [--skip-design-explore] [--styles <N>] [--stack <stack>] [-y] [-c]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, request_user_input
---
<purpose>
Production-grade UI design system with two execution modes:

**Direct Mode** — Execute any of 24 sub-commands for the full design lifecycle.
**Chain Mode** — Orchestrate sub-commands via intelligent intent routing + quality gate auto-iteration.
5 chains: build, improve, enhance, harden, live. Critique/audit scores drive automatic command selection and iteration loops.

After each command, automatically harvests design knowledge to `.workflow/knowhow/` (category: ui) for cross-session accumulation.

Includes integrated `search` subcommand for querying UI/UX design knowledge base (BM25 + CSV):
```bash
maestro impeccable search "<query>" -d <domain>          # domain search
maestro impeccable search "<query>" --design-system      # generate design system
```
Domains: style, color, chart, landing, product, ux, typography, icons, react, web, google-fonts.
Stacks: react, nextjs, vue, svelte, astro, swiftui, react-native, flutter, html-tailwind, shadcn.
</purpose>

<sub_commands>
All sub-command workflows: `~/.maestro/workflows/impeccable/{command}.md`

| Category | Commands |
|----------|----------|
| Build | craft, shape, teach, document, extract, explore |
| Evaluate | critique, audit |
| Refine | polish, bolder, quieter, distill, harden, onboard |
| Enhance | animate, colorize, typeset, layout, delight, overdrive |
| Fix | clarify, adapt, optimize |
| Iterate | live |

Reference workflows: brand.md, product.md, design.md, codex.md, heuristics-scoring.md, cognitive-load.md,
color-and-contrast.md, interaction-design.md, motion-design.md, personas.md, responsive-design.md,
spatial-design.md, typography.md, ux-writing.md

Search engine: `workflows/impeccable/ui-search/`
</sub_commands>

<context>
$ARGUMENTS -- sub-command, intent text, or special keywords, with optional flags.

**Flags (direct mode):**
- `--skip-harvest` -- Execute command without knowhow capture
- `-y` -- Auto-confirm where the skill allows

**Flags (chain mode):**
- `--chain <type>` -- Force chain type: build, improve, enhance, harden, live
- `--enhance <cmd>` -- Specific enhance command
- `--threshold <score>` -- Critique pass threshold (default: 26/40)
- `--max-loops <n>` -- Maximum quality gate iterations (default: 3)
- `-c` / `--continue` -- Resume previous chain session
- `--skip-design-explore` / `--skip-design` -- Skip design-explore
- `--styles <N>` -- Number of design system variants (2-5, default 3)
- `--stack <stack>` -- Tech stack for supplementary guidelines (default: html-tailwind)

</context>

<execution>

## Setup

Before any design work:

1. Load context (PRODUCT.md / DESIGN.md) via spec system:
   ```bash
   maestro spec load --category ui
   ```
   This surfaces all design context (product + visual) from `.workflow/specs/ui-conventions.md`.

   If specs are not initialized, fall back to the legacy loader:
   ```bash
   maestro impeccable load-context
   ```
   The loader searches `.workflow/impeccable/` first, then the project root, then `.agents/context/` and `docs/`.
   PRODUCT.md and DESIGN.md are stored at `.workflow/impeccable/`.

2. Identify register (brand vs product) and load matching reference from `~/.maestro/workflows/impeccable/brand.md` or `product.md`.
3. If sub-command invoked, load its reference file from `~/.maestro/workflows/impeccable/{command}.md`.

If PRODUCT.md missing → run `teach` first, then resume original task.

## Command Execution

Route by first argument:
1. **Matches command** → load `~/.maestro/workflows/impeccable/{command}.md`, follow instructions
2. **No argument** → show command menu grouped by category
3. **No match** → general design invocation with full argument as context

## Harvest (Post-Execution)

After command completes (except `live`), unless `--skip-harvest`:

| Command | Knowhow Type | Prefix |
|---------|-------------|--------|
| craft | decision + asset | DCS- + AST- |
| shape | decision | DCS- |
| teach | reference | REF- |
| document, extract | asset | AST- |
| explore | decision + asset | DCS- + AST- |
| critique, audit, polish, harden, onboard, clarify, adapt, optimize | tip | TIP- |
| colorize, typeset, layout, animate, bolder, quieter, distill, delight, overdrive | decision | DCS- |

Write knowhow with `category: ui`. For DCS-/AST- types, also create spec index:
```bash
maestro spec add ui "<title>" "<summary>" --keywords impeccable,<cmd>,... --ref knowhow/<file>
```

## Post-Execution Routing

After harvest, determine whether this command was invoked as part of a larger pipeline by checking conversation context (e.g., brainstorm Step 3.5, ui-craft chain step).

**Pipeline context detected** (called via Skill from brainstorm, ui-craft, etc.): Report result and stop. Do NOT suggest next-step commands — the calling flow owns what happens next.

**Standalone invocation** (user directly ran the command): Show next-step suggestions based on command executed (teach→explore/shape, explore→shape→craft, craft→critique, etc.).

</execution>

<shared_design_laws>

- **Color**: OKLCH only. Never #000/#fff. Pick color strategy first (Restrained → Committed → Full palette → Drenched).
- **Theme**: Write physical scene sentence before choosing dark/light.
- **Typography**: Body 65-75ch. Hierarchy via scale + weight (>=1.25 ratio).
- **Layout**: Vary spacing for rhythm. Cards only when truly best. No nested cards.
- **Motion**: No CSS layout animations. Ease-out exponential curves.
- **Bans**: Side-stripe borders, gradient text, glassmorphism default, hero-metric template, identical card grids, modal as first thought.
- **Copy**: Every word earns its place. No em dashes.
- **AI slop test**: Two-altitude category-reflex check.

</shared_design_laws>

<error_codes>
| Code | Severity | Description |
|------|----------|-------------|
| E001 | error | Invalid sub-command |
| E002 | error | No intent or target specified |
| W001 | warning | Harvest failed (command still succeeded) |
| W002 | warning | PRODUCT.md missing, auto-triggering teach |
</error_codes>

<success_criteria>
- [ ] Sub-command recognized and reference file loaded
- [ ] Context loaded from .workflow/impeccable/ (PRODUCT.md, register identified)
- [ ] Design changes applied to target files
- [ ] Knowhow entry created in .workflow/knowhow/ with category: ui (unless --skip-harvest or live)
- [ ] Spec index entry created for DCS-/AST- types
</success_criteria>
