export const meta = {
  name: 'wf-review',
  description: 'Multi-dimension parallel code review via workflow-reviewer with adversarial verification',
  whenToUse: 'Accelerate quality-review with parallel dimension-specific scanning and finding verification',
  phases: [
    { title: 'Scan', detail: 'Parallel dimension scanning via workflow-reviewer' },
    { title: 'Verify', detail: 'Adversarial verification of critical findings' },
    { title: 'Report', detail: 'Consolidated review report with verdict' },
  ],
}

// Aligned with workflow-reviewer.md dimension definitions
const REVIEW_DIMENSIONS = [
  { key: 'correctness', prefix: 'COR', prompt: 'Dimension: correctness. Focus: Logic errors, off-by-one, null handling, missing error propagation, type mismatches, unhandled edge cases, broken invariants, incorrect conditions.' },
  { key: 'security', prefix: 'SEC', prompt: 'Dimension: security. Focus: Injection vectors (SQL/command/XSS), auth bypass, hardcoded secrets, missing input validation, data exposure in logs/errors, SSRF, IDOR, insecure crypto.' },
  { key: 'performance', prefix: 'PRF', prompt: 'Dimension: performance. Focus: O(n^2+) algorithms, N+1 queries, missing pagination, resource leaks (unclosed handles/streams), synchronous blocking, missing caching, bundle size impact.' },
  { key: 'architecture', prefix: 'ARC', prompt: 'Dimension: architecture. Focus: Layer violations (UI calling DB directly), circular dependencies, god classes/functions, inconsistent patterns, tight coupling, missing abstractions.' },
  { key: 'maintainability', prefix: 'MNT', prompt: 'Dimension: maintainability. Focus: Functions >50 lines, cyclomatic complexity >10, duplicated logic, unclear naming, dead code, missing error context, poor separation of concerns.' },
  { key: 'best-practices', prefix: 'BPR', prompt: 'Dimension: best-practices. Focus: Deprecated API usage, framework anti-patterns, inconsistent style with codebase, missing TypeScript strict checks, raw `any` types, missing documentation for public APIs.' },
]

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dimension: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['id', 'dimension', 'severity', 'title', 'file', 'description'],
      },
    },
  },
  required: ['dimension', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    finding_id: { type: 'string' },
    is_real: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    reasoning: { type: 'string' },
    adjusted_severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'false-positive'] },
  },
  required: ['finding_id', 'is_real', 'confidence', 'reasoning'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'BLOCK'] },
    overall_quality: { type: 'number', minimum: 1, maximum: 5 },
    dimension_summary: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string' },
          finding_count: { type: 'number' },
          max_severity: { type: 'string' },
          assessment: { type: 'string' },
        },
        required: ['dimension', 'finding_count'],
      },
    },
    blocking_issues: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string' }, suggestion: { type: 'string' } }, required: ['id', 'title', 'file', 'severity'] } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'overall_quality', 'dimension_summary', 'blocking_issues', 'summary'],
}

const target = args?.target || 'changed files on current branch'
const scope = args?.scope || ''
const specs = args?.specs || ''
const tier = args?.tier || 'standard'
const dimensions = args?.dimensions
  ? REVIEW_DIMENSIONS.filter(d => args.dimensions.includes(d.key))
  : (tier === 'quick' ? REVIEW_DIMENSIONS.slice(0, 3) : REVIEW_DIMENSIONS)

// Phase 1: Parallel dimension scanning via workflow-reviewer
phase('Scan')
log(`Scanning ${dimensions.length} dimensions in parallel via workflow-reviewer...`)

const scans = await parallel(
  dimensions.map(dim => () =>
    agent(
      `${dim.prompt}

Review target: ${target}
${scope ? 'Files to review: ' + scope : 'Find changed files via git diff and review them.'}
${specs ? 'Project specs/conventions: ' + specs : ''}

Process:
1. Read the target files (use git diff if no explicit file list)
2. Perform structural scan — imports, exports, function signatures, complexity indicators
3. Apply dimension-specific analysis rules
4. Classify severity: Critical (security vuln, data corruption, crash) / High (logic bug, resource leak) / Medium (code smell, maintainability) / Low (style, minor optimization)
5. Return only real, actionable findings with specific file paths, line numbers, and evidence

Finding IDs use format: ${dim.prefix}-{NNN}`,
      { label: `scan:${dim.key}`, phase: 'Scan', schema: FINDING_SCHEMA, agentType: 'workflow-reviewer' }
    )
  )
)

const validScans = scans.filter(Boolean)
const allFindings = validScans.flatMap(s => s.findings)
const criticalHigh = allFindings.filter(f => f.severity === 'critical' || f.severity === 'high')

log(`Found ${allFindings.length} total (${criticalHigh.length} critical/high across ${validScans.length} dimensions)`)

// Phase 2: Adversarial verification of critical/high findings
phase('Verify')

if (criticalHigh.length > 0) {
  log(`Adversarially verifying ${criticalHigh.length} critical/high findings...`)

  const verified = await pipeline(
    criticalHigh,
    (finding) => agent(
      `Adversarially verify this code review finding. Your job is to REFUTE it — find reasons it might be:
- A false positive (the code is actually correct)
- Less severe than claimed (downgrade severity)
- Not applicable in this context

Finding: [${finding.severity}] ${finding.id}: ${finding.title}
File: ${finding.file}${finding.line ? ':' + finding.line : ''}
Description: ${finding.description}
Evidence: ${finding.evidence || 'none provided'}

Read the actual source code at the specified location. Check:
1. Is the code actually doing what the finding claims?
2. Is there handling elsewhere that mitigates this?
3. Is the severity justified?

Default to is_real=false and adjusted_severity=false-positive if uncertain.
Only confirm findings you can verify in the actual code with high confidence.`,
      { label: `verify:${finding.id}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    )
  )

  const confirmedFindings = []
  const falsePositives = []

  verified.filter(Boolean).forEach((verdict, i) => {
    const finding = criticalHigh[i]
    if (verdict.is_real && verdict.confidence >= 60) {
      confirmedFindings.push({ ...finding, verdict: verdict, adjusted_severity: verdict.adjusted_severity || finding.severity })
    } else {
      falsePositives.push({ ...finding, verdict: verdict })
    }
  })

  const lowMedFindings = allFindings.filter(f => f.severity === 'medium' || f.severity === 'low')

  // Phase 3: Consolidated report
  phase('Report')

  const report = await agent(
    `Generate a consolidated code review report.

Confirmed findings (adversarially verified, ${confirmedFindings.length}):
${confirmedFindings.map(f => `- [${f.adjusted_severity}] ${f.id}: ${f.title} @ ${f.file}:${f.line || '?'} (confidence: ${f.verdict.confidence}%)\n  ${f.description}`).join('\n') || 'None'}

False positives filtered: ${falsePositives.length}
${falsePositives.map(f => `- ${f.id}: ${f.title} — ${f.verdict.reasoning}`).join('\n') || ''}

Low/medium findings (not individually verified, ${lowMedFindings.length}):
${lowMedFindings.map(f => `- [${f.severity}] ${f.id}: ${f.title} @ ${f.file}`).join('\n') || 'None'}

Determine verdict:
- APPROVE: no confirmed critical/high findings
- REQUEST_CHANGES: has confirmed high findings but no critical
- BLOCK: has confirmed critical findings

Rate overall quality (1-5) and summarize per dimension.`,
    { label: 'report', phase: 'Report', schema: REPORT_SCHEMA }
  )

  return {
    report: report,
    confirmed: confirmedFindings,
    false_positives: falsePositives,
    low_findings: lowMedFindings,
    metadata: {
      target: target,
      dimensions_scanned: dimensions.length,
      total_findings: allFindings.length,
      verified_count: criticalHigh.length,
      confirmed_count: confirmedFindings.length,
      false_positive_count: falsePositives.length,
      verdict: report ? report.verdict : 'UNKNOWN',
    },
  }
} else {
  phase('Report')
  log('No critical/high findings — generating clean report')

  return {
    report: { verdict: 'APPROVE', overall_quality: 4, dimension_summary: validScans.map(s => ({ dimension: s.dimension, finding_count: s.findings.length, max_severity: s.findings[0]?.severity || 'none', assessment: 'Clean' })), blocking_issues: [], summary: 'No critical or high severity issues found. Code passes review.' },
    confirmed: [],
    false_positives: [],
    low_findings: allFindings,
    metadata: {
      target: target,
      dimensions_scanned: dimensions.length,
      total_findings: allFindings.length,
      verified_count: 0,
      confirmed_count: 0,
      false_positive_count: 0,
      verdict: 'APPROVE',
    },
  }
}
