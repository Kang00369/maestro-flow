export const meta = {
  name: 'wf-analyze',
  description: 'Multi-dimensional parallel analysis aligned with maestro-analyze 6-dimension scoring',
  whenToUse: 'Accelerate maestro-analyze with parallel codebase exploration + dimension scoring + synthesis',
  phases: [
    { title: 'Explore', detail: '3-layer codebase exploration via cli-explore-agent' },
    { title: 'Score', detail: 'Parallel 6-dimension scoring via workflow-analyzer' },
    { title: 'Synthesize', detail: 'Cross-dimension synthesis with Go/No-Go recommendation' },
  ],
}

const DIMENSIONS = [
  { key: 'feasibility', focus: 'Technical difficulty, team capability, time constraints, tooling availability, infrastructure readiness' },
  { key: 'impact', focus: 'User value, business value, tech debt reduction, developer experience improvement, ecosystem contribution' },
  { key: 'risk', focus: 'Failure modes, security vulnerabilities, scalability limits, regression potential, data integrity threats' },
  { key: 'complexity', focus: 'Integration points, dependency count, learning curve, testing difficulty, migration path complexity' },
  { key: 'dependencies', focus: 'External services, internal module coupling, data dependencies, infrastructure requirements, third-party stability' },
  { key: 'alternatives', focus: 'Compare 2+ approaches with tradeoffs, evaluate build-vs-buy, assess migration paths, weigh technology options' },
]

const EXPLORATION_SCHEMA = {
  type: 'object',
  properties: {
    relevant_files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, role: { type: 'string' }, relevance: { type: 'string' } }, required: ['path', 'role'] } },
    call_chains: { type: 'array', items: { type: 'object', properties: { entry: { type: 'string' }, chain: { type: 'array', items: { type: 'string' } }, purpose: { type: 'string' } }, required: ['entry', 'chain'] } },
    data_flows: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, sink: { type: 'string' }, transforms: { type: 'array', items: { type: 'string' } } }, required: ['source', 'sink'] } },
    code_anchors: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'number' }, snippet: { type: 'string' }, significance: { type: 'string' } }, required: ['file', 'significance'] } },
    module_boundaries: { type: 'array', items: { type: 'object', properties: { module: { type: 'string' }, exports: { type: 'array', items: { type: 'string' } }, depends_on: { type: 'array', items: { type: 'string' } } }, required: ['module'] } },
  },
  required: ['relevant_files', 'code_anchors'],
}

const DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    score: { type: 'number', minimum: 1, maximum: 5 },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    evidence: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, source: { type: 'string' }, strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] } }, required: ['claim', 'source', 'strength'] } },
    risks: { type: 'array', items: { type: 'object', properties: { risk: { type: 'string' }, probability: { type: 'string', enum: ['high', 'medium', 'low'] }, impact: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }, mitigation: { type: 'string' } }, required: ['risk', 'probability', 'impact'] } },
    summary: { type: 'string' },
  },
  required: ['dimension', 'score', 'confidence', 'evidence', 'summary'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    overall_score: { type: 'number', minimum: 1, maximum: 5 },
    overall_confidence: { type: 'number', minimum: 0, maximum: 100 },
    recommendation: { type: 'string', enum: ['go', 'conditional-go', 'no-go'] },
    scope_verdict: { type: 'string', enum: ['large', 'medium', 'small'] },
    risk_matrix: { type: 'array', items: { type: 'object', properties: { risk: { type: 'string' }, probability: { type: 'string' }, impact: { type: 'string' }, dimension: { type: 'string' } }, required: ['risk', 'probability', 'impact', 'dimension'] } },
    decisions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, decision: { type: 'string' }, status: { type: 'string', enum: ['locked', 'free', 'deferred'] }, rationale: { type: 'string' }, options_considered: { type: 'array', items: { type: 'string' } } }, required: ['id', 'decision', 'status', 'rationale'] } },
    implementation_scope: { type: 'array', items: { type: 'object', properties: { objective: { type: 'string' }, acceptance_criteria: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] }, target_files: { type: 'array', items: { type: 'string' } } }, required: ['objective', 'priority'] } },
    executive_summary: { type: 'string' },
  },
  required: ['overall_score', 'overall_confidence', 'recommendation', 'scope_verdict', 'risk_matrix', 'decisions', 'executive_summary'],
}

const target = args?.target || 'the current codebase'
const scope = args?.scope || ''
const context = args?.context || ''
const phase = args?.phase || null
const selectedDimensions = args?.dimensions
  ? DIMENSIONS.filter(d => args.dimensions.includes(d.key))
  : DIMENSIONS

// Phase 1: Codebase Exploration via cli-explore-agent
phase('Explore')
log('Launching 3-layer codebase exploration via cli-explore-agent...')

const exploration = await agent(
  `Perform 3-layer codebase exploration for: ${target}
${scope ? 'File scope: ' + scope : 'Explore the full project structure.'}
${context ? 'Additional context: ' + context : ''}
${phase ? 'Phase context: ' + phase : ''}

Layer 1 — Module Discovery (Breadth):
  Search by topic keywords, identify ALL relevant files, map module boundaries.

Layer 2 — Structure Tracing (Depth):
  Top 3-5 key files: trace call chains 2-3 levels deep, identify data flow.

Layer 3 — Code Anchor Extraction (Detail):
  Each key finding: extract code snippet (20-50 lines) with file:line reference.

Return structured exploration results.`,
  { label: 'explore:codebase', phase: 'Explore', schema: EXPLORATION_SCHEMA, agentType: 'cli-explore-agent' }
)

const explorationContext = exploration
  ? `Relevant files: ${exploration.relevant_files.map(f => f.path).join(', ')}
Call chains: ${(exploration.call_chains || []).map(c => c.entry + ' → ' + c.chain.join(' → ')).join('; ')}
Code anchors: ${exploration.code_anchors.map(a => a.file + ':' + (a.line || '?') + ' — ' + a.significance).join('\n')}`
  : 'No exploration results available.'

log(`Exploration complete: ${exploration ? exploration.relevant_files.length : 0} files, ${exploration ? exploration.code_anchors.length : 0} anchors`)

// Phase 2: Parallel 6-Dimension Scoring via workflow-analyzer
phase('Score')
log(`Scoring ${selectedDimensions.length} dimensions in parallel via workflow-analyzer...`)

const scores = await parallel(
  selectedDimensions.map(dim => () =>
    agent(
      `Evaluate dimension: ${dim.key}
Focus areas: ${dim.focus}
Target: ${target}
${phase ? 'Phase: ' + phase : ''}

Codebase exploration context:
${explorationContext}

Score this dimension on a 1-5 scale with specific evidence from the codebase:
- 1: Critical issues, blocks progress
- 2: Significant concerns, requires major effort
- 3: Manageable, standard effort required
- 4: Good position, minor concerns only
- 5: Excellent, minimal risk

Every score must have specific file:line evidence, not general impressions.
Include confidence percentage (0-100) based on evidence strength.
For Risk dimension: include probability × impact matrix entries.`,
      { label: `score:${dim.key}`, phase: 'Score', schema: DIMENSION_SCHEMA, agentType: 'workflow-analyzer' }
    )
  )
)

const validScores = scores.filter(Boolean)
log(`${validScores.length}/${selectedDimensions.length} dimensions scored`)

// Phase 3: Cross-Dimension Synthesis
phase('Synthesize')

const scoreDigest = validScores.map(s =>
  `${s.dimension}: ${s.score}/5 (confidence: ${s.confidence}%)\n  ${s.summary}\n  Evidence: ${s.evidence.slice(0, 3).map(e => e.claim + ' [' + e.strength + ']').join('; ')}\n  Risks: ${(s.risks || []).map(r => r.risk + ' (' + r.probability + '/' + r.impact + ')').join('; ') || 'none identified'}`
).join('\n\n')

const synthesis = await agent(
  `Synthesize multi-dimensional analysis results into a Go/No-Go recommendation.

Target: ${target}
${phase ? 'Phase: ' + phase : ''}

Dimension Scores:
${scoreDigest}

Codebase Exploration:
${explorationContext}

Tasks:
1. Calculate weighted overall score (Feasibility .25, Impact .20, Risk .20, Complexity .15, Dependencies .15, Alternatives .05)
2. Build probability-impact risk matrix from all dimension risks
3. Determine scope_verdict:
   - "large": 3+ independent subsystems or hard serial dependencies
   - "medium": 1-2 subsystems, parallelizable
   - "small": single-file or few-file change
4. Extract decisions (locked/free/deferred) based on findings
5. Define implementation_scope with objectives, acceptance criteria, and target files
6. Make Go/No-Go/Conditional-Go recommendation with confidence level
7. Write executive summary (2-3 paragraphs)

Recommendation rules:
- Any dimension at 1/5 with high confidence → no-go (unless mitigated)
- Average < 2.5 → no-go
- Average 2.5-3.5 with risks → conditional-go (list conditions)
- Average > 3.5 → go`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA, agentType: 'workflow-analyzer' }
)

return {
  exploration: exploration,
  dimensions: validScores,
  synthesis: synthesis,
  metadata: {
    target: target,
    scope: scope,
    phase: phase,
    dimension_count: selectedDimensions.length,
    completed_count: validScores.length,
    overall_score: synthesis ? synthesis.overall_score : null,
    recommendation: synthesis ? synthesis.recommendation : null,
    scope_verdict: synthesis ? synthesis.scope_verdict : null,
  },
}
