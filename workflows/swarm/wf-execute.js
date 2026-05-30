export const meta = {
  name: 'wf-execute',
  description: 'Wave-based parallel task execution via workflow-executor agents',
  whenToUse: 'Accelerate maestro-execute with parallel task implementation within waves',
  phases: [
    { title: 'Load', detail: 'Load plan and resolve task dependencies' },
    { title: 'Execute', detail: 'Wave-based parallel task execution via workflow-executor' },
    { title: 'Report', detail: 'Execution summary and status collection' },
  ],
}

const TASK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['completed', 'failed', 'blocked'] },
    files_changed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    convergence_met: { type: 'boolean' },
    unmet_criteria: { type: 'array', items: { type: 'string' } },
    commit_hash: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['task_id', 'status', 'summary'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_RETRY'] },
    total_tasks: { type: 'number' },
    completed: { type: 'number' },
    failed: { type: 'number' },
    blocked: { type: 'number' },
    waves_executed: { type: 'number' },
    files_changed: { type: 'array', items: { type: 'string' } },
    failed_tasks: { type: 'array', items: { type: 'object', properties: { task_id: { type: 'string' }, error: { type: 'string' }, unmet_criteria: { type: 'array', items: { type: 'string' } } }, required: ['task_id'] } },
    summary: { type: 'string' },
  },
  required: ['status', 'total_tasks', 'completed', 'failed', 'summary'],
}

const planDir = args?.plan_dir || ''
const specs = args?.specs || ''
const codebaseContext = args?.codebase_context || ''
const wikiContext = args?.wiki_context || ''
const autoCommit = args?.auto_commit !== false

// Phase 1: Load plan and resolve waves
phase('Load')
log('Loading plan and resolving task dependency waves...')

const planLoad = await agent(
  `Load the execution plan and resolve task waves.

Plan directory: ${planDir || 'Find the most recent pending plan in .workflow/scratch/'}

Steps:
1. Read plan.json to get task_ids[], waves[], approach
2. Read each .task/TASK-{NNN}.json to get: description, scope, focus_paths, depends_on, convergence.criteria, files[], implementation[], read_first[], test.commands
3. Verify dependency order: tasks in wave N must have all depends_on satisfied by waves < N
4. Filter: only include tasks with status="pending" (skip completed/blocked)
5. Return the wave structure with full task context for each pending task

Return the complete wave plan as structured data.`,
  {
    label: 'load:plan',
    phase: 'Load',
    schema: {
      type: 'object',
      properties: {
        plan_dir: { type: 'string' },
        plan_summary: { type: 'string' },
        waves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              wave_index: { type: 'number' },
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string' },
                    description: { type: 'string' },
                    scope: { type: 'string' },
                    focus_paths: { type: 'array', items: { type: 'string' } },
                    depends_on: { type: 'array', items: { type: 'string' } },
                    convergence_criteria: { type: 'array', items: { type: 'string' } },
                    test_commands: { type: 'array', items: { type: 'string' } },
                    files_to_create: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['task_id', 'description'],
                },
              },
            },
            required: ['wave_index', 'tasks'],
          },
        },
        total_pending: { type: 'number' },
      },
      required: ['plan_dir', 'waves', 'total_pending'],
    },
    agentType: 'workflow-planner',
  }
)

if (!planLoad || !planLoad.waves || planLoad.waves.length === 0) {
  log('No pending tasks found')
  return { report: { status: 'DONE', total_tasks: 0, completed: 0, failed: 0, summary: 'No pending tasks.' }, metadata: { waves_executed: 0 } }
}

log(`Plan loaded: ${planLoad.total_pending} pending tasks across ${planLoad.waves.length} waves`)

// Phase 2: Execute waves sequentially, tasks within each wave in parallel
phase('Execute')

const allResults = []
let waveIndex = 0

for (const wave of planLoad.waves) {
  waveIndex++
  log(`Wave ${waveIndex}/${planLoad.waves.length}: executing ${wave.tasks.length} tasks in parallel...`)

  const waveResults = await parallel(
    wave.tasks.map(task => () =>
      agent(
        `Execute task: ${task.task_id}
Description: ${task.description}
Scope: ${task.scope || 'project root'}
Focus paths: ${(task.focus_paths || []).join(', ') || 'see task JSON'}
Plan directory: ${planLoad.plan_dir}

${specs ? 'Project specs (MUST comply):\n' + specs : ''}
${codebaseContext ? 'Codebase architecture:\n' + codebaseContext : ''}
${wikiContext ? 'Wiki knowledge:\n' + wikiContext : ''}

Process:
1. Read the full task JSON at ${planLoad.plan_dir}/.task/${task.task_id}.json
2. Read all files in read_first[] before any modification
3. Read reference.files for patterns to follow
4. Implement changes following implementation[] steps in order
5. Verify every convergence criterion: ${(task.convergence_criteria || []).join('; ') || 'see task JSON'}
6. Run test commands: ${(task.test_commands || []).join('; ') || 'none defined'}
${autoCommit ? '7. Create atomic git commit with message referencing ' + task.task_id : ''}
8. Write summary to ${planLoad.plan_dir}/.summaries/${task.task_id}-summary.md
9. Update task status to "completed" in the task JSON

Stay within scope. Do not modify files outside focus_paths unless explicitly required by the task.`,
        { label: `exec:${task.task_id}`, phase: 'Execute', schema: TASK_RESULT_SCHEMA, agentType: 'workflow-executor', isolation: 'worktree' }
      )
    )
  )

  allResults.push(...waveResults.filter(Boolean))

  const waveFailed = waveResults.filter(r => r && r.status === 'failed')
  if (waveFailed.length > 0) {
    log(`Wave ${waveIndex}: ${waveFailed.length} tasks failed — ${waveFailed.map(f => f.task_id).join(', ')}`)
  }
}

// Phase 3: Execution report
phase('Report')

const completed = allResults.filter(r => r.status === 'completed')
const failed = allResults.filter(r => r.status === 'failed')
const blocked = allResults.filter(r => r.status === 'blocked')

const report = await agent(
  `Generate execution report.

Results: ${completed.length} completed, ${failed.length} failed, ${blocked.length} blocked out of ${planLoad.total_pending} total.

Completed tasks:
${completed.map(r => `- ${r.task_id}: ${r.summary} (${(r.files_changed || []).length} files)`).join('\n') || 'None'}

Failed tasks:
${failed.map(r => `- ${r.task_id}: ${r.error || r.summary}\n  Unmet: ${(r.unmet_criteria || []).join(', ') || 'unknown'}`).join('\n') || 'None'}

Determine:
- DONE: all tasks completed, no failures
- DONE_WITH_CONCERNS: some failures but majority succeeded
- NEEDS_RETRY: critical failures blocking downstream work

Summarize what was accomplished and what needs attention.`,
  { label: 'report', phase: 'Report', schema: REPORT_SCHEMA }
)

return {
  report: report,
  results: allResults,
  metadata: {
    plan_dir: planLoad.plan_dir,
    waves_executed: waveIndex,
    total_tasks: planLoad.total_pending,
    completed: completed.length,
    failed: failed.length,
    blocked: blocked.length,
    all_files_changed: completed.flatMap(r => r.files_changed || []),
  },
}
