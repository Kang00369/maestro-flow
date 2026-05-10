# Tool Spec Reference

Shared reference for tool spec registration and execution commands.

## Storage

Tool specs are stored in `.workflow/specs/tools.md` as `<spec-entry>` blocks with per-entry `roles` attribute. The `tools.md` file has no primary role — entries are loaded via role matching.

## Entry Format

### Inline mode (short process, <10 steps)

```xml
<spec-entry roles="implement,test" keywords="payment,gateway,idempotency" date="YYYY-MM-DD">

### Tool Name

Use when {trigger condition / timing}.

1. Step one
2. Step two
...

</spec-entry>
```

### Ref mode (long process, >=10 steps or with code examples)

Spec index entry in `tools.md`:
```xml
<spec-entry roles="implement" keywords="oauth,pkce,token" date="YYYY-MM-DD"
  ref="knowhow/RCP-<slug>.md">

### Tool Name

Use when {trigger condition}. {scope summary — must fit within 200 chars for spec load display}.

</spec-entry>
```

Referenced knowhow document (`knowhow/RCP-<slug>.md`):
```yaml
---
title: Tool Name
type: recipe
summary: "Use when {timing}. {scope description}"
tags: [keyword1, keyword2]
roles: [implement]
---

## Prerequisites
...

## Steps
1. ...
```

## Description Rules

- First line after `### Title` must state **when to use** this tool
- For ref entries: `spec load` shows only the first 200 chars after heading — timing must be in that window
- For ref knowhow docs: YAML `summary` field is shown by `wiki list` and wiki-role-loader hook

## Discovery Path

```
Register → tools.md → spec load --role <role> / spec-injector auto-inject → agent discovers tool
```

Agents discover tool specs via:
- `spec load --role <role>` — returns entries matching the role
- `spec-injector` hook — auto-injects at Agent launch based on agent type
- `spec load --keyword <word>` — keyword search across all entries

## Role Reference

| Role | Agent types | Tool examples |
|------|-------------|---------------|
| implement | code-developer, workflow-executor | Build, deploy, integrate |
| test | tdd-developer, test-fix-agent | Test flows, verification steps |
| review | workflow-reviewer | Checklists, audit standards |
| plan | workflow-planner | Design flows, analysis steps |
| analyze | debug-explore-agent | Diagnostic flows, investigation |

## CLI Commands

```bash
# Add inline tool spec
maestro spec add tools "<title>" "<content>" --roles "<csv>" --keywords "<csv>"

# Add ref tool spec with knowhow
maestro spec add tools "<title>" "<summary>" --roles "<csv>" --keywords "<csv>" \
  --ref "knowhow/RCP-<slug>.md" --knowhow-type recipe

# Load tool specs
maestro spec load --role <role>
maestro spec load --role <role> --keyword <word>
```
