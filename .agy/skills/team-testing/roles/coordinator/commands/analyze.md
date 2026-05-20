# Analyze Task

Parse user task -> detect testing capabilities -> select pipeline -> design roles.

**CONSTRAINT**: Text-level analysis only. NO source code reading, NO codebase exploration.

## Signal Detection

| Keywords | Capability | Prefix |
|----------|------------|--------|
| strategy, plan, layers, scope | strategist | STRATEGY |
| generate tests, write tests, create tests | generator | TESTGEN |
| run tests, execute, coverage | executor | TESTRUN |
| analyze, report, quality, defects | analyst | TESTANA |

## Pipeline Mode Detection

| Condition | Pipeline |
|-----------|----------|
| fileCount <= 3 AND moduleCount <= 1 | targeted |
| fileCount <= 10 AND moduleCount <= 3 | standard |
| Otherwise | comprehensive |

## Dependency Graph

Natural ordering for testing pipeline:
- Tier 0: strategist (change analysis, no upstream dependency)
- Tier 1: generator (requires strategy)
- Tier 2: executor (requires generated tests; GC loop with generator)
- Tier 3: analyst (requires execution results)

## Pipeline Definitions

```
Targeted:      STRATEGY -> TESTGEN(L1) -> TESTRUN(L1)
Standard:      STRATEGY -> TESTGEN(L1) -> TESTRUN(L1) -> TESTGEN(L2) -> TESTRUN(L2) -> TESTANA
Comprehensive: STRATEGY -> [TESTGEN(L1) || TESTGEN(L2)] -> [TESTRUN(L1) || TESTRUN(L2)] -> TESTGEN(L3) -> TESTRUN(L3) -> TESTANA
```

## Complexity Scoring

| Factor | Points |
|--------|--------|
| Per test layer | +1 |
| Parallel tracks | +1 per track |
| GC loop enabled | +1 |
| Serial depth > 3 | +1 |

Results: 1-2 Low, 3-5 Medium, 6+ High

## Role Minimization

- Cap at 5 roles (coordinator + 4 workers)
- GC loop: generator <-> executor iterate up to 3 rounds per layer

## Output

Write <session>/task-analysis.json:
```json
{
  "task_description": "<original>",
  "pipeline_mode": "<targeted|standard|comprehensive>",
  "capabilities": [{ "name": "<cap>", "prefix": "<PREFIX>", "keywords": ["..."] }],
  "dependency_graph": { "<TASK-ID>": { "role": "<role>", "blockedBy": ["..."], "layer": "L1|L2|L3" } },
  "roles": [{ "name": "<role>", "prefix": "<PREFIX>", "inner_loop": true }],
  "complexity": { "score": 0, "level": "Low|Medium|High" },
  "coverage_targets": { "L1": 80, "L2": 60, "L3": 40 },
  "gc_loop_enabled": true
}
```

<!--
Maestro: converted from .claude/. Semantic differences worth knowing:

- TaskCreate / TaskUpdate / TaskList / TaskGet → file-based at .workflow/tasks/<id>.json
  (agy's manage_task handles run_command async tasks, NOT named-task tracking)
- mcp__ccw-tools__team_msg(log|broadcast|read|get_state) → write_to_file/view_file on
  .workflow/.team/<session>/.msg/messages.jsonl
- Skill(skill=X, args=Y) → user-triggered slash command in agy; cannot be invoked from an agent
- TeamCreate / TeamDelete → no agy equivalent; rely on directory scaffolding at
  .workflow/.team/<session>/
- TodoWrite → write_to_file append on .workflow/todos.jsonl
- send_message Recipient is a ConversationId returned by invoke_subagent, not a role name
-->
