# Code Analysis Action Template

Code analysis action template for integrating FastContext-based code location and analysis capabilities into a Skill.

## Purpose

Generate code analysis actions for a Skill, integrating FastContext for semantic search and optional agents for in-depth analysis.

## Usage Context

| Phase | Usage |
|-------|-------|
| Optional | Use when Skill requires code exploration and analysis capabilities |
| Generation Trigger | User selects to add code-analysis action type |
| Agent Types | FastContext locator, cli-explore-agent, universal-executor |

---

## Configuration Structure

```typescript
interface CodeAnalysisActionConfig {
  id: string;                    // "analyze-structure", "explore-patterns"
  name: string;                  // "Code Structure Analysis"
  type: 'code-analysis';         // Action type identifier

  // Analysis scope
  scope: {
    paths: string[];             // Target paths
    patterns: string[];          // Glob patterns
    excludes?: string[];         // Exclude patterns
  };

  // Analysis type
  analysis_type: 'structure' | 'patterns' | 'dependencies' | 'quality' | 'security';

  // Agent config (optional; FastContext is used first)
  agent?: {
    type: 'fastcontext' | 'cli-explore-agent' | 'universal-executor';
    thoroughness: 'quick' | 'medium' | 'very thorough';
  };

  // Output config
  output: {
    format: 'json' | 'markdown';
    file: string;
  };

  // MCP tool enhancement
  mcp_tools?: string[];          // ['']
}
```

---

## Template Generation Function

```javascript
function generateCodeAnalysisAction(config) {
  const { id, name, scope, analysis_type, agent, output, mcp_tools = [] } = config;

  return `
# ${name}

## Action: ${id}

### Analysis Scope

- **Paths**: ${scope.paths.join(', ')}
- **Patterns**: ${scope.patterns.join(', ')}
${scope.excludes ? `- **Excludes**: ${scope.excludes.join(', ')}` : ''}

### Execution Logic

\`\`\`javascript
async function execute${toPascalCase(id)}(context) {
  const workDir = context.workDir;
  const results = [];

  // 1. File discovery
  const files = await discoverFiles({
    paths: ${JSON.stringify(scope.paths)},
    patterns: ${JSON.stringify(scope.patterns)},
    excludes: ${JSON.stringify(scope.excludes || [])}
  });

  console.log(\`Found \${files.length} files to analyze\`);

  // 2. Semantic search using FastContext
  ${mcp_tools.length > 0 ? \`
  const semanticResults = await mcp__fast-context__fast_context_search({
    project_path: context.projectRoot,
    query: '\${getQueryForAnalysisType(analysis_type)} with file:line evidence',
    exclude_paths: ['node_modules', 'dist', '.git', '.workflow'],
    max_results: 8,
    max_turns: 2
  });
  results.push({ type: 'semantic', data: semanticResults });
  \` : '// No MCP tools configured'}

  // 3. Optional in-depth analysis after FastContext location
  if (agent?.type) {
    const agentResult = await Agent({
      subagent_type: '\${agent.type}',
      prompt: \`
\${generateAgentPrompt(analysis_type, scope)}
      \`,
      run_in_background: false
    });
    results.push({ type: 'agent', data: agentResult });
  }

  // 4. Aggregate results
  const summary = aggregateResults(results);

  // 5. Output results
  const outputPath = \`\${workDir}/${output.file}\`;
  ${output.format === 'json'
    ? \`Write(outputPath, JSON.stringify(summary, null, 2));\`
    : \`Write(outputPath, formatAsMarkdown(summary));\`}

  return {
    success: true,
    output: '${output.file}',
    files_analyzed: files.length,
    analysis_type: '${analysis_type}'
  };
}
\`\`\`;
}

function getQueryForAnalysisType(type) {
  const queries = {
    structure: 'main entry points, module organization, exports',
    patterns: 'design patterns, abstractions, reusable components',
    dependencies: 'imports, external dependencies, coupling',
    quality: 'code complexity, test coverage, documentation',
    security: 'authentication, authorization, input validation, secrets'
  };
  return queries[type] || queries.structure;
}

function generateAgentPrompt(type, scope) {
  const prompts = {
    structure: \`Analyze code structure of the following paths:
\${scope.paths.map(p => \`- \${p}\`).join('\\n')}

Tasks:
1. Identify main modules and entry points
2. Analyze directory organization structure
3. Extract module import/export relationships
4. Generate structure overview diagram (Mermaid)

Output format: JSON
{
  "modules": [...],
  "entry_points": [...],
  "structure_diagram": "mermaid code"
}\`,

    patterns: \`Analyze design patterns in the following paths:
\${scope.paths.map(p => \`- \${p}\`).join('\\n')}

Tasks:
1. Identify design patterns used (Factory, Strategy, Observer, etc.)
2. Analyze abstraction levels
3. Evaluate appropriateness of pattern usage
4. Extract reusable pattern instances

Output format: JSON
{
  "patterns": [{ "name": "...", "location": "...", "usage": "..." }],
  "abstractions": [...],
  "reusable_components": [...]
}\`,

    dependencies: \`Analyze dependencies in the following paths:
\${scope.paths.map(p => \`- \${p}\`).join('\\n')}

Tasks:
1. Extract internal module dependencies
2. Identify external package dependencies
3. Analyze coupling degree
4. Detect circular dependencies

Output format: JSON
{
  "internal_deps": [...],
  "external_deps": [...],
  "coupling_score": 0-100,
  "circular_deps": [...]
}\`,

    quality: \`Analyze code quality in the following paths:
\${scope.paths.map(p => \`- \${p}\`).join('\\n')}

Tasks:
1. Assess code complexity
2. Check test coverage
3. Analyze documentation completeness
4. Identify technical debt

Output format: JSON
{
  "complexity": { "avg": 0, "max": 0, "hotspots": [...] },
  "test_coverage": { "percentage": 0, "gaps": [...] },
  "documentation": { "score": 0, "missing": [...] },
  "tech_debt": [...]
}\`,

    security: \`Analyze security in the following paths:
\${scope.paths.map(p => \`- \${p}\`).join('\\n')}

Tasks:
1. Check authentication/authorization implementation
2. Analyze input validation
3. Detect sensitive data handling
4. Identify common vulnerability patterns

Output format: JSON
{
  "auth": { "methods": [...], "issues": [...] },
  "input_validation": { "coverage": 0, "gaps": [...] },
  "sensitive_data": { "found": [...], "protected": true/false },
  "vulnerabilities": [{ "type": "...", "severity": "...", "location": "..." }]
}\`
  };

  return prompts[type] || prompts.structure;
}
\`\`\`

---

## Preset Code Analysis Actions

### 1. Project Structure Analysis

\`\`\`yaml
id: analyze-project-structure
name: Project Structure Analysis
type: code-analysis
scope:
  paths:
    - src/
  patterns:
    - "**/*.ts"
    - "**/*.js"
  excludes:
    - "**/node_modules/**"
    - "**/*.test.*"
analysis_type: structure
mcp_tools:
  - fastcontext
output:
  format: json
  file: structure-analysis.json
\`\`\`

### 2. Design Pattern Extraction

\`\`\`yaml
id: extract-design-patterns
name: Design Pattern Extraction
type: code-analysis
scope:
  paths:
    - src/
  patterns:
    - "**/*.ts"
analysis_type: patterns
agent:
  type: cli-explore-agent
  thoroughness: very thorough
output:
  format: markdown
  file: patterns-report.md
\`\`\`

### 3. Dependency Analysis

\`\`\`yaml
id: analyze-dependencies
name: Dependency Analysis
type: code-analysis
scope:
  paths:
    - src/
    - packages/
  patterns:
    - "**/package.json"
    - "**/*.ts"
analysis_type: dependencies
mcp_tools:
  - fastcontext
output:
  format: json
  file: dependency-graph.json
\`\`\`

### 4. Security Audit

\`\`\`yaml
id: security-audit
name: Security Audit
type: code-analysis
scope:
  paths:
    - src/auth/
    - src/api/
  patterns:
    - "**/*.ts"
analysis_type: security
agent:
  type: universal-executor
  thoroughness: very thorough
output:
  format: json
  file: security-report.json
mcp_tools:
  - fastcontext
\`\`\`

---

## Usage Examples

### Using in Phase

\`\`\`javascript
// phases/01-code-exploration.md

const analysisConfig = {
  id: 'explore-skill-structure',
  name: 'Skill Structure Exploration',
  type: 'code-analysis',
  scope: {
    paths: ['D:\\Claude_dms3\\.claude\\skills\\software-manual'],
    patterns: ['**/*.md'],
    excludes: ['**/node_modules/**']
  },
  analysis_type: 'structure',
  mcp_tools: ['fastcontext'],
  output: {
    format: 'json',
    file: 'skill-structure.json'
  }
};

// Execute
const result = await executeCodeAnalysis(analysisConfig, context);
\`\`\`

### Combining Multiple Analyses

\`\`\`javascript
// Serial execution of multiple analyses
const analyses = [
  { type: 'structure', file: 'structure.json' },
  { type: 'patterns', file: 'patterns.json' },
  { type: 'dependencies', file: 'deps.json' }
];

for (const analysis of analyses) {
  await executeCodeAnalysis({
    ...baseConfig,
    analysis_type: analysis.type,
    output: { format: 'json', file: analysis.file }
  }, context);
}

// Parallel execution (independent analyses)
const parallelResults = await Promise.all(
  analyses.map(a => executeCodeAnalysis({
    ...baseConfig,
    analysis_type: a.type,
    output: { format: 'json', file: a.file }
  }, context))
);
\`\`\`

---

## Agent Selection Guide

| Analysis Type | Recommended Agent | Thoroughness | Reason |
|-------------|-----------------|--------------|--------|
| structure | FastContext | medium | Quick semantic structure retrieval |
| patterns | cli-explore-agent | very thorough | Requires deep code understanding |
| dependencies | FastContext | medium | Locate dependency surfaces before exact verification |
| quality | universal-executor | medium | Requires running analysis tools |
| security | universal-executor | very thorough | Requires comprehensive scanning |

---

## MCP Tool Integration

### Semantic Search Enhancement

\`\`\`javascript
// Use FastContext for semantic code location
const semanticContext = await mcp__fast-context__fast_context_search({
  project_path: projectRoot,
  query: 'authentication logic, user session management with file:line evidence',
  exclude_paths: ['node_modules', 'dist', '.git', '.workflow'],
  max_results: 8,
  max_turns: 2
});

// Verify FastContext results with Read/Grep before using them as evidence.
\`\`\`

### smart_search Integration

\`\`\`javascript
// Use smart_search for exact matching
const exactMatches = await mcp__ccw_tools__smart_search({
  action: 'search',
  query: 'class.*Controller',
  mode: 'ripgrep',
  path: 'src/'
});

// Use find_files for file discovery
const configFiles = await mcp__ccw_tools__smart_search({
  action: 'find_files',
  pattern: '**/*.config.ts',
  path: 'src/'
});
\`\`\`

---

## Results Aggregation

\`\`\`javascript
function aggregateResults(results) {
  const aggregated = {
    timestamp: new Date().toISOString(),
    sources: [],
    summary: {},
    details: []
  };

  for (const result of results) {
    aggregated.sources.push(result.type);

    if (result.type === 'semantic') {
      aggregated.summary.semantic_matches = result.data.length;
      aggregated.details.push({
        source: 'semantic',
        data: result.data.slice(0, 10)  // Top 10
      });
    }

    if (result.type === 'agent') {
      aggregated.summary.agent_findings = extractKeyFindings(result.data);
      aggregated.details.push({
        source: 'agent',
        data: result.data
      });
    }
  }

  return aggregated;
}

function extractKeyFindings(agentResult) {
  // Extract key findings from Agent result
  // Implementation depends on Agent output format
  return {
    modules: agentResult.modules?.length || 0,
    patterns: agentResult.patterns?.length || 0,
    issues: agentResult.issues?.length || 0
  };
}
\`\`\`

---

## Best Practices

1. **Scope Control**
   - Use precise patterns to reduce analysis scope
   - Configure excludes to ignore irrelevant files

2. **Agent Selection**
   - Use FastContext for quick semantic location
   - Use cli-explore-agent for in-depth analysis
   - Use universal-executor when execution is required

3. **MCP Tool Combination**
   - First use FastContext for semantic context
   - Then use cli-explore-agent or universal-executor for in-depth analysis
   - Finally use smart_search for exact matching

4. **Result Caching**
   - Persist analysis results to workDir
   - Subsequent phases can read directly, avoiding re-analysis

5. **Brief Returns**
   - Agent returns path + summary, not full content
   - Prevents context overflow
