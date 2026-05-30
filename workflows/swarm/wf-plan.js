export const meta = {
  name: 'wf-plan',
  description: 'Parallel context exploration + task decomposition via workflow-planner',
  whenToUse: 'Accelerate maestro-plan with parallel context gathering and plan generation',
  phases: [
    { title: 'Context', detail: 'Parallel context exploration from multiple sources' },
    { title: 'Plan', detail: 'Task decomposition and wave assignment via workflow-planner' },
    { title: 'Check', detail: 'Plan quality verification via workflow-plan-checker' },
  ],
}

const CONTEXT_SCHEMA = {
  type: 'object',
  properties: {
    source: { type: 'string' },
    decisions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, decision: { type: 'string' }, status: { type: 'string', enum: ['locked', 'free', 'deferred'] }, rationale: { type: 'string' } }, required: ['decision', 'status'] } },
    requirements: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, objective: { type: 'string' }, acceptance_criteria: { type: 'string' }, priority: { type: 'string' }, target_files: { type: 'array', items: { type: 'string' } } }, required: ['objective'] } },
    constraints: { type: 'array', items: { type: 'string' } },
    existing_patterns: { type: 'array', items: { type: 'object', properties: { pattern: { type: 'string' }, file: { type: 'string' }, usage: { type: 'string' } }, required: ['pattern', 'file'] } },
    dependencies: { type: 'array', items: { type: 'string' } },
  },
  required: ['source', 'decisions', 'requirements'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    approach: { type: 'string' },
    complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
    waves: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          wave_index: { type: 'number' },
          rationale: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                task_id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                scope: { type: 'string' },
                focus_paths: { type: 'array', items: { type: 'string' } },
                depends_on: { type: 'array', items: { type: 'string' } },
                convergence_criteria: { type: 'array', items: { type: 'string' } },
                files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, action: { type: 'string', enum: ['create', 'modify', 'delete'] }, change: { type: 'string' } }, required: ['path', 'action'] } },
                issue_id: { type: 'string' },
              },
              required: ['task_id', 'title', 'description', 'convergence_criteria'],
            },
          },
        },
        required: ['wave_index', 'tasks'],
      },
    },
    total_tasks: { type: 'number' },
  },
  required: ['summary', 'approach', 'waves', 'total_tasks'],
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'pass-with-notes', 'needs-revision'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'warning', 'note'] },
          category: { type: 'string' },
          description: { type: 'string' },
          affected_tasks: { type: 'array', items: { type: 'string' } },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'category', 'description'],
      },
    },
    metrics: {
      type: 'object',
      properties: {
        task_count: { type: 'number' },
        wave_count: { type: 'number' },
        avg_convergence_criteria: { type: 'number' },
        dependency_depth: { type: 'number' },
        estimated_parallelism: { type: 'number' },
      },
    },
    summary: { type: 'string' },
  },
  required: ['verdict', 'issues', 'summary'],
}

const contextDir = args?.context_dir || ''
const fromSource = args?.from || ''
const phase_num = args?.phase || null
const scope = args?.scope || ''
const specs = args?.specs || ''
const gaps = args?.gaps || false
const quick = args?.quick || false

// Phase 1: Parallel context exploration
phase('Context')
log('Gathering context from multiple sources in parallel...')

const contextSources = [
  () => agent(
    `Load analysis context for planning.
${contextDir ? 'Context directory: ' + contextDir + ' — read context.md and context-package.json' : ''}
${fromSource ? 'Upstream source: ' + fromSource + ' — resolve and load context-package.json' : ''}
${phase_num ? 'Phase: ' + phase_num + ' — read roadmap.md for phase definition' : ''}
${gaps ? 'Gap-fix mode: load issues from .workflow/issues/issues.jsonl with analysis records' : ''}

Extract:
1. Locked/Free/Deferred decisions from context.md
2. Requirements with acceptance criteria from context-package.json or conclusions.json
3. Constraints from upstream analysis
4. Dependencies identified`,
    { label: 'ctx:analysis', phase: 'Context', schema: CONTEXT_SCHEMA }
  ),
  () => agent(
    `Explore existing codebase patterns relevant to the planned work.
${scope ? 'Scope: ' + scope : phase_num ? 'Phase ' + phase_num + ' scope from roadmap' : 'Full project'}
${specs ? 'Specs to respect: ' + specs : 'Load via: maestro spec load --category arch'}

Find:
1. Existing patterns in the target area (how similar features are implemented)
2. File organization conventions
3. Test patterns used
4. Import/export conventions
5. Error handling patterns

Report as existing_patterns[] with file references.`,
    { label: 'ctx:patterns', phase: 'Context', schema: CONTEXT_SCHEMA, agentType: 'cli-explore-agent' }
  ),
]

const contexts = await parallel(contextSources)
const validContexts = contexts.filter(Boolean)

const mergedDecisions = validContexts.flatMap(c => c.decisions || [])
const mergedRequirements = validContexts.flatMap(c => c.requirements || [])
const mergedPatterns = validContexts.flatMap(c => c.existing_patterns || [])
const mergedConstraints = validContexts.flatMap(c => c.constraints || [])

log(`Context gathered: ${mergedDecisions.length} decisions, ${mergedRequirements.length} requirements, ${mergedPatterns.length} patterns`)

// Phase 2: Plan generation via workflow-planner
phase('Plan')
log('Generating execution plan with task decomposition...')

const contextDigest = `Decisions (${mergedDecisions.length}):
${mergedDecisions.map(d => `- [${d.status}] ${d.decision}${d.rationale ? ' — ' + d.rationale : ''}`).join('\n')}

Requirements (${mergedRequirements.length}):
${mergedRequirements.map(r => `- ${r.objective}${r.acceptance_criteria ? ' (done when: ' + r.acceptance_criteria + ')' : ''}${r.target_files ? ' [' + r.target_files.join(', ') + ']' : ''}`).join('\n')}

Constraints: ${mergedConstraints.join('; ') || 'none'}

Existing patterns:
${mergedPatterns.map(p => `- ${p.pattern} @ ${p.file}`).join('\n') || 'none found'}`

const plan = await agent(
  `Create an execution plan from the following context.
${phase_num ? 'Phase: ' + phase_num : ''}
${scope ? 'Scope: ' + scope : ''}
${quick ? 'MODE: QUICK — one task per feature, minimal waves, fast execution' : 'MODE: STANDARD — full decomposition with convergence criteria'}
${gaps ? 'MODE: GAP-FIX — tasks fix identified issues, link via issue_id' : ''}

Context:
${contextDigest}

Rules:
1. Group work into FEATURE-LEVEL tasks (one feature = one task, even if 3-5 files)
2. Assign independent tasks to same wave (parallel execution)
3. Dependent tasks in later waves — only add depends_on when truly needed
4. Each task needs ≥2 testable convergence criteria (grep-verifiable or command-runnable)
5. Include focus_paths and files[] with specific paths and actions
6. Respect all Locked decisions — they are non-negotiable
7. Free decisions are implementer's choice — don't over-specify
8. Task IDs: TASK-001, TASK-002, etc.

${quick ? 'Quick mode: single wave unless genuine dependency. Batch unrelated small changes into one task.' : ''}`,
  { label: 'plan:generate', phase: 'Plan', schema: PLAN_SCHEMA, agentType: 'workflow-planner' }
)

log(`Plan generated: ${plan ? plan.total_tasks : 0} tasks across ${plan ? plan.waves.length : 0} waves`)

// Phase 3: Plan quality check
phase('Check')
log('Verifying plan quality...')

const check = await agent(
  `Verify this execution plan for quality and completeness.

Plan:
${plan ? `Summary: ${plan.summary}\nApproach: ${plan.approach}\nComplexity: ${plan.complexity}\nTasks: ${plan.total_tasks} across ${plan.waves.length} waves` : 'No plan generated'}

Task details:
${plan ? plan.waves.map(w => `Wave ${w.wave_index}: ${w.tasks.map(t => t.task_id + ': ' + t.title + ' [' + (t.convergence_criteria || []).length + ' criteria]').join(', ')}`).join('\n') : 'none'}

Check:
1. DEPENDENCY CORRECTNESS: Are depends_on relationships correct? Any missing?
2. WAVE EFFICIENCY: Could more tasks be parallelized? Are waves minimized?
3. CONVERGENCE QUALITY: Are criteria specific and testable (not vague)?
4. SCOPE COMPLETENESS: Do tasks cover all requirements?
5. FILE CONFLICTS: Do parallel tasks modify the same files?
6. MISSING TASKS: Are there requirements without corresponding tasks?

Requirements to cover:
${mergedRequirements.map(r => r.objective).join('\n')}`,
  { label: 'check:quality', phase: 'Check', schema: CHECK_SCHEMA, agentType: 'workflow-plan-checker' }
)

return {
  contexts: validContexts,
  plan: plan,
  check: check,
  metadata: {
    phase: phase_num,
    scope: scope,
    decision_count: mergedDecisions.length,
    requirement_count: mergedRequirements.length,
    total_tasks: plan ? plan.total_tasks : 0,
    wave_count: plan ? plan.waves.length : 0,
    check_verdict: check ? check.verdict : 'unknown',
    critical_issues: check ? check.issues.filter(i => i.severity === 'critical').length : 0,
  },
}
