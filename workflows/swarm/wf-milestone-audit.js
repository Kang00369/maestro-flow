export const meta = {
  name: 'wf-milestone-audit',
  description: 'Parallel cross-phase integration audit via workflow-integration-checker',
  whenToUse: 'Accelerate maestro-milestone-audit with parallel phase coverage, execution completeness, and integration checks',
  phases: [
    { title: 'Audit', detail: 'Parallel 4-dimension milestone audit' },
    { title: 'Report', detail: 'Consolidated audit verdict' },
  ],
}

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    check_type: { type: 'string' },
    passed: { type: 'boolean' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phase: { type: 'string' },
          has_plan: { type: 'boolean' },
          has_execute: { type: 'boolean' },
          has_verify: { type: 'boolean' },
          plan_artifact_id: { type: 'string' },
          execute_artifact_id: { type: 'string' },
          status: { type: 'string', enum: ['complete', 'partial', 'missing'] },
        },
        required: ['phase', 'has_plan', 'has_execute', 'status'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['check_type', 'passed', 'phases', 'summary'],
}

const EXECUTION_SCHEMA = {
  type: 'object',
  properties: {
    check_type: { type: 'string' },
    passed: { type: 'boolean' },
    plans: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          plan_id: { type: 'string' },
          plan_dir: { type: 'string' },
          total_tasks: { type: 'number' },
          completed_tasks: { type: 'number' },
          failed_tasks: { type: 'number' },
          pending_tasks: { type: 'number' },
          incomplete_task_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['plan_id', 'total_tasks', 'completed_tasks'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['check_type', 'passed', 'plans', 'summary'],
}

const INTEGRATION_SCHEMA = {
  type: 'object',
  properties: {
    check_type: { type: 'string' },
    passed: { type: 'boolean' },
    interfaces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          interface_name: { type: 'string' },
          producer_phase: { type: 'string' },
          consumer_phase: { type: 'string' },
          status: { type: 'string', enum: ['pass', 'fail', 'warning'] },
          issue: { type: 'string' },
        },
        required: ['interface_name', 'producer_phase', 'consumer_phase', 'status'],
      },
    },
    data_contract_issues: { type: 'array', items: { type: 'object', properties: { contract: { type: 'string' }, mismatch: { type: 'string' }, affected_phases: { type: 'array', items: { type: 'string' } } }, required: ['contract', 'mismatch'] } },
    circular_dependencies: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['check_type', 'passed', 'interfaces', 'summary'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    dimension_results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string' },
          passed: { type: 'boolean' },
          issue_count: { type: 'number' },
        },
        required: ['dimension', 'passed'],
      },
    },
    blocking_issues: { type: 'array', items: { type: 'object', properties: { dimension: { type: 'string' }, description: { type: 'string' }, remediation: { type: 'string' } }, required: ['dimension', 'description', 'remediation'] } },
    next_step: { type: 'string', enum: ['milestone-complete', 'plan-gaps', 'execute', 'verify'] },
    summary: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'dimension_results', 'blocking_issues', 'next_step', 'summary'],
}

const milestone = args?.milestone || ''
const isAdhoc = args?.is_adhoc || false

// Phase 1: Parallel 4-dimension audit
phase('Audit')

const checks = [
  // Dimension 1: Phase coverage (skip for adhoc milestones)
  () => agent(
    `Phase Coverage Audit${isAdhoc ? ' (ADHOC — skip roadmap phase checks, only verify artifact chain PLN→EXC exists)' : ''}.
${milestone ? 'Milestone: ' + milestone : 'Use current_milestone from .workflow/state.json'}

${isAdhoc ? `Adhoc milestone: skip roadmap.md parsing. Only check:
1. At least one PLN artifact exists for this milestone
2. Each PLN has a corresponding EXC artifact
3. All are status=completed` : `Standard milestone:
1. Read .workflow/roadmap.md to get milestone → phase mapping
2. Read .workflow/state.json artifacts[] filtered by this milestone
3. For each phase in the milestone:
   - Check: has plan artifact (type=plan, status=completed)?
   - Check: has execute artifact (type=execute, status=completed)?
   - Check: has verify artifact (type=verify)? (optional but noted)
4. Report each phase as complete/partial/missing`}

Set check_type="phase-coverage" in output.`,
    { label: 'audit:coverage', phase: 'Audit', schema: COVERAGE_SCHEMA }
  ),

  // Dimension 2: Execution completeness
  () => agent(
    `Execution Completeness Audit.
${milestone ? 'Milestone: ' + milestone : 'Use current_milestone from .workflow/state.json'}

1. Read .workflow/state.json — find all execute artifacts for this milestone
2. For each execute artifact:
   - Resolve its plan directory (artifact.path)
   - Read all .task/TASK-*.json files in that directory
   - Count: total, completed, failed, pending
   - List any incomplete task IDs
3. Passed only if ALL tasks across ALL plans are completed (no pending/failed)

Set check_type="execution-completeness" in output.`,
    { label: 'audit:execution', phase: 'Audit', schema: EXECUTION_SCHEMA }
  ),

  // Dimension 3: Cross-phase integration
  () => agent(
    `Cross-Phase Integration Audit.
${milestone ? 'Milestone: ' + milestone : 'Use current_milestone from .workflow/state.json'}

Check that phases compose correctly:
1. Scan for shared interfaces, types, APIs across phase boundaries
2. Verify contract compliance:
   - Type definitions match usage across phases
   - API request/response schemas are consistent
   - Event names and payloads align between producer and consumer
3. Check dependency health:
   - Cross-phase imports resolve correctly
   - No circular dependencies across phase boundaries
   - Shared dependency versions are compatible
4. Trace data flow across boundaries:
   - Input/output formats match
   - Error propagation is handled at boundaries

Report each interface check as pass/fail/warning with specific issues.
Set check_type="integration" in output.`,
    { label: 'audit:integration', phase: 'Audit', schema: INTEGRATION_SCHEMA, agentType: 'workflow-integration-checker' }
  ),
]

log(`Running ${checks.length} audit dimensions in parallel...`)
const results = await parallel(checks)
const validResults = results.filter(Boolean)

// Phase 2: Consolidated report
phase('Report')

const coverage = validResults.find(r => r.check_type === 'phase-coverage')
const execution = validResults.find(r => r.check_type === 'execution-completeness')
const integration = validResults.find(r => r.check_type === 'integration')

const auditDigest = `Phase Coverage: ${coverage ? (coverage.passed ? 'PASS' : 'FAIL') + ' — ' + coverage.summary : 'NOT RUN'}

Execution Completeness: ${execution ? (execution.passed ? 'PASS' : 'FAIL') + ' — ' + execution.summary : 'NOT RUN'}
${execution && !execution.passed ? 'Incomplete plans: ' + execution.plans.filter(p => p.pending_tasks > 0 || p.failed_tasks > 0).map(p => p.plan_id + ' (' + p.pending_tasks + ' pending, ' + p.failed_tasks + ' failed)').join('; ') : ''}

Integration: ${integration ? (integration.passed ? 'PASS' : 'FAIL') + ' — ' + integration.summary : 'NOT RUN'}
${integration && !integration.passed ? 'Failed interfaces: ' + integration.interfaces.filter(i => i.status === 'fail').map(i => i.interface_name + ': ' + i.issue).join('; ') : ''}
${integration && integration.data_contract_issues.length > 0 ? 'Data contract issues: ' + integration.data_contract_issues.map(d => d.contract + ' — ' + d.mismatch).join('; ') : ''}`

const report = await agent(
  `Generate consolidated milestone audit report.

${auditDigest}

Determine:
1. Overall verdict: PASS only if ALL dimensions pass
2. Confidence score (0-100)
3. List blocking issues with specific remediation
4. Determine next step:
   - "milestone-complete": all pass → ready to close milestone
   - "plan-gaps": integration issues need new plan
   - "execute": incomplete execution
   - "verify": missing verification artifacts
5. Write summary`,
  { label: 'report', phase: 'Report', schema: REPORT_SCHEMA }
)

return {
  coverage: coverage,
  execution: execution,
  integration: integration,
  report: report,
  metadata: {
    milestone: milestone,
    is_adhoc: isAdhoc,
    dimensions_checked: validResults.length,
    coverage_passed: coverage ? coverage.passed : null,
    execution_passed: execution ? execution.passed : null,
    integration_passed: integration ? integration.passed : null,
    verdict: report ? report.verdict : 'UNKNOWN',
    next_step: report ? report.next_step : null,
  },
}
