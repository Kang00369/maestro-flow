export const meta = {
  name: 'wf-brainstorm',
  description: 'Multi-role parallel brainstorm with cross-role reviewer synthesis, aligned with maestro-brainstorm',
  whenToUse: 'Accelerate maestro-brainstorm with parallel role analysis and cross-role conflict/synergy detection',
  phases: [
    { title: 'Analyze', detail: 'Parallel multi-role analysis via role-design-author' },
    { title: 'CrossReview', detail: 'Cross-role conflict detection via cross-role-reviewer' },
    { title: 'Synthesize', detail: 'Resolution synthesis into guidance specification' },
  ],
}

const VALID_ROLES = [
  { key: 'system-architect', focus: 'System design, scalability, maintainability, module boundaries, technical debt, design patterns, infrastructure' },
  { key: 'product-manager', focus: 'User value, market fit, MVP scope, prioritization, success metrics, stakeholder management, feature ROI' },
  { key: 'test-strategist', focus: 'Testability, quality assurance, test pyramid, coverage strategy, risk-based testing, regression prevention' },
  { key: 'ux-expert', focus: 'User experience, interaction patterns, accessibility, cognitive load, information architecture, user flows' },
  { key: 'subject-matter-expert', focus: 'Domain knowledge, business rules, industry standards, compliance requirements, edge cases from domain' },
  { key: 'data-architect', focus: 'Data modeling, storage strategy, query patterns, migration paths, data integrity, caching, consistency' },
  { key: 'ui-designer', focus: 'Visual design, component hierarchy, design tokens, responsive layout, motion, color and typography' },
  { key: 'product-owner', focus: 'Business priorities, backlog management, acceptance criteria, stakeholder value, sprint planning' },
  { key: 'scrum-master', focus: 'Process efficiency, team dynamics, impediment removal, delivery cadence, continuous improvement' },
]

const ROLE_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    decision_digest: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          feature: { type: 'string' },
          stance: { type: 'string' },
          priority: { type: 'string', enum: ['must-have', 'should-have', 'nice-to-have'] },
          rationale: { type: 'string' },
        },
        required: ['id', 'feature', 'stance', 'priority'],
      },
    },
    interfaces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          contract: { type: 'string' },
          consumers: { type: 'array', items: { type: 'string' } },
          provider: { type: 'string' },
        },
        required: ['contract', 'consumers'],
      },
    },
    cross_cutting_positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          position: { type: 'string' },
          strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
        },
        required: ['topic', 'position', 'strength'],
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string' },
          impact: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['finding', 'impact'],
      },
    },
    key_insight: { type: 'string' },
  },
  required: ['role', 'decision_digest', 'cross_cutting_positions', 'findings', 'key_insight'],
}

const CROSS_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          topic: { type: 'string' },
          stances: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, stance: { type: 'string' } }, required: ['role', 'stance'] } },
          resolution_suggestion: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'significant', 'minor'] },
        },
        required: ['id', 'roles', 'topic', 'stances', 'severity'],
      },
    },
    synergies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          roles: { type: 'array', items: { type: 'string' } },
          topic: { type: 'string' },
          combined_value: { type: 'string' },
        },
        required: ['roles', 'topic', 'combined_value'],
      },
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          missing_perspective: { type: 'string' },
          impact: { type: 'string' },
        },
        required: ['area', 'missing_perspective'],
      },
    },
  },
  required: ['conflicts', 'synergies', 'gaps'],
}

const GUIDANCE_SCHEMA = {
  type: 'object',
  properties: {
    guidelines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          guideline: { type: 'string' },
          category: { type: 'string', enum: ['must', 'must-not', 'should', 'should-not', 'may'] },
          source_roles: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
          resolved_conflict: { type: 'string' },
        },
        required: ['id', 'guideline', 'category', 'source_roles', 'rationale'],
      },
    },
    resolved_conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          conflict_id: { type: 'string' },
          resolution: { type: 'string' },
          rationale: { type: 'string' },
          winner_role: { type: 'string' },
        },
        required: ['conflict_id', 'resolution', 'rationale'],
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
    executive_summary: { type: 'string' },
  },
  required: ['guidelines', 'resolved_conflicts', 'executive_summary'],
}

const topic = args?.topic || 'the proposed system'
const context = args?.context || ''
const roleCount = args?.count || 3
const selectedRoles = args?.roles
  ? VALID_ROLES.filter(r => args.roles.includes(r.key))
  : VALID_ROLES.slice(0, roleCount)

// Phase 1: Parallel multi-role analysis via role-design-author
phase('Analyze')
log(`Launching ${selectedRoles.length} role analyses in parallel via role-design-author...`)

const analyses = await parallel(
  selectedRoles.map(role => () =>
    agent(
      `You are the ${role.key} role analyzing: ${topic}
${context ? 'Context: ' + context : ''}

Your focus areas: ${role.focus}

Produce a structured role analysis with:
1. Decision Digest — your stances on each feature/aspect (id, feature, stance, priority, rationale)
2. Interfaces — contracts you propose/consume (contract, consumers, provider)
3. Cross-Cutting Positions — your stance on shared topics (topic, position, strength)
4. Findings — discoveries with impact and evidence
5. Key Insight — your single most important observation

Read relevant source files if needed to ground your analysis in reality.
Be specific and opinionated — take clear stances with rationale.`,
      { label: `role:${role.key}`, phase: 'Analyze', schema: ROLE_ANALYSIS_SCHEMA, agentType: 'role-design-author' }
    )
  )
)

const validAnalyses = analyses.filter(Boolean)
log(`${validAnalyses.length}/${selectedRoles.length} role analyses completed`)

// Phase 2: Cross-role review via cross-role-reviewer
phase('CrossReview')
log('Cross-role conflict and synergy detection...')

const analysesDigest = validAnalyses.map(a => {
  const decisions = a.decision_digest.map(d => `  ${d.id}: [${d.priority}] ${d.feature} — ${d.stance}`).join('\n')
  const positions = a.cross_cutting_positions.map(p => `  ${p.topic}: ${p.position} [${p.strength}]`).join('\n')
  const findings = a.findings.map(f => `  - ${f.finding} (impact: ${f.impact})`).join('\n')
  return `## ${a.role}\nKey insight: ${a.key_insight}\n\nDecisions:\n${decisions}\n\nPositions:\n${positions}\n\nFindings:\n${findings}`
}).join('\n\n---\n\n')

const crossReview = await agent(
  `Compare these ${validAnalyses.length} role analyses for conflicts, gaps, and synergies.

${analysesDigest}

Identify:
1. CONFLICTS: Same feature/topic with contradictory stances between roles. Include severity (blocking/significant/minor).
2. SYNERGIES: Compatible positions that reinforce each other when combined.
3. GAPS: Areas where an important perspective is missing — a topic addressed by one role but not by another that should.

For each conflict, suggest a resolution direction.`,
  { label: 'cross-review', phase: 'CrossReview', schema: CROSS_REVIEW_SCHEMA, agentType: 'cross-role-reviewer' }
)

// Phase 3: Synthesis into guidance specification
phase('Synthesize')
log('Synthesizing guidance specification...')

const conflictDigest = crossReview.conflicts.map(c =>
  `[${c.severity}] ${c.topic}: ${c.stances.map(s => s.role + '→' + s.stance).join(' vs ')}\n  Suggestion: ${c.resolution_suggestion}`
).join('\n')

const synergyDigest = crossReview.synergies.map(s =>
  `${s.roles.join(' + ')}: ${s.topic} — ${s.combined_value}`
).join('\n')

const guidance = await agent(
  `Synthesize a unified guidance specification from multi-role brainstorm results.

Topic: ${topic}

Role Analyses:
${analysesDigest}

Cross-Review Findings:
Conflicts (${crossReview.conflicts.length}):
${conflictDigest || 'None'}

Synergies (${crossReview.synergies.length}):
${synergyDigest || 'None'}

Gaps: ${crossReview.gaps.map(g => g.area + ' — missing ' + g.missing_perspective).join('; ') || 'None'}

Produce:
1. Unified guidelines using RFC-2119 categories (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)
2. For each conflict: resolve by weighing evidence strength, severity, and downstream impact
3. Attribute each guideline to source roles
4. List remaining open questions that need user input
5. Executive summary (2-3 paragraphs)

Priority rules for conflict resolution:
- Security > correctness > user experience > performance > convenience
- "must-have" from multiple roles > "must-have" from single role
- Stances with strong evidence > moderate > weak`,
  { label: 'guidance', phase: 'Synthesize', schema: GUIDANCE_SCHEMA }
)

return {
  analyses: validAnalyses,
  crossReview: crossReview,
  guidance: guidance,
  metadata: {
    topic: topic,
    role_count: selectedRoles.length,
    completed_count: validAnalyses.length,
    conflict_count: crossReview.conflicts.length,
    blocking_conflicts: crossReview.conflicts.filter(c => c.severity === 'blocking').length,
    synergy_count: crossReview.synergies.length,
    gap_count: crossReview.gaps.length,
    guideline_count: guidance ? guidance.guidelines.length : 0,
  },
}
