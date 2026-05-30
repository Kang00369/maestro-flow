export const meta = {
  name: 'wf-grill',
  description: 'Parallel adversarial stress-testing across decision branches',
  whenToUse: 'Accelerate maestro-grill auto mode with parallel branch exploration and contradiction detection',
  phases: [
    { title: 'Explore', detail: 'Codebase evidence gathering via cli-explore-agent' },
    { title: 'Stress', detail: 'Parallel adversarial branch probing' },
    { title: 'Synthesize', detail: 'Contradiction detection and terminology crystallization' },
  ],
}

const BRANCHES = [
  { key: 'scope', focus: 'Scope & Boundaries — What is explicitly in/out? Where are the edges? Challenge vague boundaries with concrete code symbols.' },
  { key: 'data-model', focus: 'Data Model & State — How does data flow? What state transitions exist? Challenge naming conflicts with codebase terminology.' },
  { key: 'edge-cases', focus: 'Edge Cases & Failure Modes — What breaks at scale? What happens on invalid input? What if dependent services fail?' },
  { key: 'integration', focus: 'Integration & Dependencies — What existing systems are touched? What contracts must be honored? What breaks if we change X?' },
  { key: 'scale', focus: 'Scale & Performance — At 10x/100x current load, what breaks first? Which queries degrade? Where are the O(n^2) risks?' },
  { key: 'security', focus: 'Security & Access Control — What is the attack surface? Who can access what? Where is trust assumed but not verified?' },
  { key: 'operations', focus: 'Observability & Operations — How do we know it is working? What alerts fire? How do we debug production issues?' },
  { key: 'migration', focus: 'Migration & Rollback — What is the rollback path? Can we do a zero-downtime deploy? What data migration is needed?' },
]

const EXPLORATION_SCHEMA = {
  type: 'object',
  properties: {
    relevant_symbols: { type: 'array', items: { type: 'object', properties: { symbol: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, type: { type: 'string' } }, required: ['symbol', 'file'] } },
    existing_terminology: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, usage_location: { type: 'string' }, context: { type: 'string' } }, required: ['term', 'usage_location'] } },
    data_flows: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, data_shape: { type: 'string' } }, required: ['from', 'to'] } },
    integration_points: { type: 'array', items: { type: 'object', properties: { system: { type: 'string' }, interface: { type: 'string' }, contract: { type: 'string' } }, required: ['system', 'interface'] } },
  },
  required: ['relevant_symbols', 'existing_terminology'],
}

const BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          code_evidence: { type: 'string' },
          contradiction: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'significant', 'minor'] },
          proposed_resolution: { type: 'string' },
        },
        required: ['question', 'severity'],
      },
    },
    terminology_conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposed_term: { type: 'string' },
          codebase_term: { type: 'string' },
          location: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['proposed_term', 'codebase_term', 'recommendation'],
      },
    },
    assumptions_challenged: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['sound', 'needs-clarification', 'fundamentally-flawed'] },
  },
  required: ['branch', 'challenges', 'terminology_conflicts', 'assumptions_challenged', 'verdict'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    overall_verdict: { type: 'string', enum: ['ready-for-brainstorm', 'needs-refinement', 'back-to-drawing-board'] },
    blocking_issues: { type: 'array', items: { type: 'object', properties: { branch: { type: 'string' }, issue: { type: 'string' }, must_resolve_before: { type: 'string' } }, required: ['branch', 'issue'] } },
    terminology: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' }, code_alignment: { type: 'string' } }, required: ['term', 'definition'] } },
    contradictions: { type: 'array', items: { type: 'object', properties: { between_branches: { type: 'array', items: { type: 'string' } }, description: { type: 'string' }, resolution: { type: 'string' } }, required: ['between_branches', 'description'] } },
    constraints_discovered: { type: 'array', items: { type: 'object', properties: { constraint: { type: 'string' }, source: { type: 'string' }, impact: { type: 'string' }, status: { type: 'string', enum: ['locked', 'free', 'deferred'] } }, required: ['constraint', 'source', 'status'] } },
    executive_summary: { type: 'string' },
  },
  required: ['overall_verdict', 'blocking_issues', 'terminology', 'contradictions', 'constraints_discovered', 'executive_summary'],
}

const topic = args?.topic || ''
const context = args?.context || ''
const depth = args?.depth || 'standard'
const branchCount = depth === 'shallow' ? 3 : depth === 'deep' ? 8 : 5
const selectedBranches = BRANCHES.slice(0, branchCount)

// Phase 1: Codebase evidence gathering
phase('Explore')
log('Gathering codebase evidence for stress-testing...')

const exploration = await agent(
  `Explore the codebase to gather evidence for stress-testing this proposal:
Topic: ${topic}
${context ? 'Context: ' + context : ''}

Find:
1. Relevant symbols — functions, classes, types, variables related to this topic
2. Existing terminology — how the codebase names things in this domain (for conflict detection)
3. Data flows — how data moves through the system in this area
4. Integration points — external systems, internal modules, APIs touched

This evidence will be used to challenge assumptions and detect contradictions.`,
  { label: 'explore:evidence', phase: 'Explore', schema: EXPLORATION_SCHEMA, agentType: 'cli-explore-agent' }
)

const evidenceContext = exploration
  ? `Codebase evidence:
Symbols: ${exploration.relevant_symbols.map(s => s.symbol + ' @ ' + s.file).join(', ')}
Terminology: ${exploration.existing_terminology.map(t => t.term + ' (' + t.usage_location + ')').join(', ')}
Data flows: ${(exploration.data_flows || []).map(d => d.from + ' → ' + d.to).join(', ')}
Integration: ${(exploration.integration_points || []).map(i => i.system + ':' + i.interface).join(', ')}`
  : ''

// Phase 2: Parallel adversarial branch probing
phase('Stress')
log(`Stress-testing ${selectedBranches.length} branches in parallel...`)

const branchResults = await parallel(
  selectedBranches.map(branch => () =>
    agent(
      `You are an adversarial stress-tester for the "${branch.key}" branch.

Proposal being tested: ${topic}
${context ? 'Proposal context: ' + context : ''}
${evidenceContext}

Your focus: ${branch.focus}

Your job is to BREAK this proposal by:
1. Finding contradictions with existing code (cite file:line)
2. Detecting terminology conflicts (proposed names vs codebase names)
3. Challenging unstated assumptions with concrete counter-scenarios
4. Probing for cases the proposal hasn't considered

For each challenge:
- Ground it in code evidence (file paths, symbol names, data shapes)
- Classify severity: blocking (must fix before proceeding), significant (should address), minor (nice to clarify)
- Propose a resolution direction

Be adversarial but fair — only raise real issues backed by evidence.`,
      { label: `stress:${branch.key}`, phase: 'Stress', schema: BRANCH_SCHEMA }
    )
  )
)

const validBranches = branchResults.filter(Boolean)
log(`${validBranches.length}/${selectedBranches.length} branches probed`)

// Phase 3: Cross-branch synthesis
phase('Synthesize')

const branchDigest = validBranches.map(b => {
  const blocking = b.challenges.filter(c => c.severity === 'blocking')
  return `## ${b.branch} [${b.verdict}]
Challenges: ${b.challenges.length} (${blocking.length} blocking)
${blocking.map(c => `  ⚠ ${c.question}${c.contradiction ? ' — ' + c.contradiction : ''}`).join('\n')}
Terminology conflicts: ${b.terminology_conflicts.map(t => t.proposed_term + ' vs ' + t.codebase_term).join(', ') || 'none'}
Assumptions challenged: ${b.assumptions_challenged.join('; ') || 'none'}`
}).join('\n\n')

const synthesis = await agent(
  `Synthesize stress-test results across all branches.

Proposal: ${topic}

Branch Results:
${branchDigest}

Tasks:
1. Identify cross-branch CONTRADICTIONS — where one branch's finding conflicts with another's
2. Compile unified TERMINOLOGY list (proposed term → aligned codebase term → definition)
3. Extract CONSTRAINTS discovered (things that MUST be true based on evidence) — classify as locked/free/deferred
4. List all BLOCKING issues that must resolve before brainstorm/planning
5. Determine overall verdict:
   - "ready-for-brainstorm": no blocking issues, well-scoped
   - "needs-refinement": some blocking issues but fixable
   - "back-to-drawing-board": fundamental flaws detected
6. Write executive summary`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
)

return {
  exploration: exploration,
  branches: validBranches,
  synthesis: synthesis,
  metadata: {
    topic: topic,
    depth: depth,
    branch_count: selectedBranches.length,
    completed_count: validBranches.length,
    blocking_count: synthesis ? synthesis.blocking_issues.length : 0,
    contradiction_count: synthesis ? synthesis.contradictions.length : 0,
    overall_verdict: synthesis ? synthesis.overall_verdict : 'unknown',
  },
}
