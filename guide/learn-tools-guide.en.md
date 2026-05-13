# Learn Toolkit Guide

A complete reference for Maestro's learning toolkit, covering the principles, usage, and collaboration patterns of 5 `learn-*` commands.

---

## 1. Overview

### Positioning: Knowledge Acquisition Subsystem

The learning toolkit is Maestro's **interactive deep learning** module, focused on extracting structured knowledge from code, documentation, and decision history. Each command follows the scientific method -- hypothesis, evidence, verification, codification -- transforming implicit engineering experience into reusable explicit knowledge.

Core design principles:

- **Forcing question mechanism**: Structured questions prevent shallow reading and ensure depth of understanding
- **Parallel agent analysis**: Multiple roles examine the same target simultaneously, eliminating single-perspective bias
- **Evidence-driven**: All conclusions must be supported by code anchors (file:line)
- **Automatic codification**: Learning outputs are automatically written to `specs/learnings.md` and `.workflow/knowhow/`

### Comparison with manage-learn

| Dimension | learn-* Toolkit | manage-learn |
|-----------|-----------------|-------------|
| Interaction mode | Interactive deep learning, multi-round guidance | Atomic operation, single capture |
| Goal | Systematic acquisition of deep understanding | Quick recording of a single insight |
| Output | Structured reports, pattern catalog, evidence trail | Single `<spec-entry>` |
| Use case | Complex module analysis, architecture decision review, pattern discovery | Meeting notes, sudden insights, quick capture |
| Duration | Minutes, multi-agent parallel | Seconds, instant completion |

Simple rule: **Use learn-* when you need to think, use manage-learn when you need to record**.

---

## 2. Command Reference

### 2.1 learn-retro -- Unified Retrospective

Periodic review of project activities, distilling insights from Git commit history and architecture decisions.

**Use cases**:

- Periodic reviews (weekly / per iteration)
- Technical debt identification (high-churn files, low test coverage areas)
- Decision health checks (are past decisions still valid?)
- Team activity analysis (per-person contributions, session patterns)

**Command syntax**:

```bash
/learn-retro                                    # Default: both lenses, full analysis of last 7 days
/learn-retro --lens git --days 14               # Git analysis only, last 14 days
/learn-retro --lens decision --phase 2          # Decision analysis only, focus on Phase 2
/learn-retro --lens all --author alice --compare # Full analysis, filtered by author, compare with last retro
```

**Parameters**:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--lens` | Analysis perspective: `git` / `decision` / `all` | `all` |
| `--days N` | Number of days to look back for Git lens | 7 |
| `--author <name>` | Filter by author | All |
| `--area <path>` | Filter by directory | All |
| `--compare` | Compare with previous retrospective | Off |
| `--phase N` | Decision lens focus on specific Phase | All |
| `--tag <tag>` | Decision lens filter by tag | All |
| `--id <id>` | Evaluate a specific decision individually | -- |

#### Git Lens -- Activity Analysis

Git Lens extracts quantitative metrics from raw commit history:

| Metric | Calculation | Significance |
|--------|------------|--------------|
| Test ratio | test_insertions / total_insertions | Proportion of test coverage investment |
| Churn rate | Files changed >2 times / total files | Code stability |
| Sessions | Commit clusters grouped by time gaps >2 hours | Work cadence |
| LOC/session-hour | Net lines added per session per hour | Development efficiency |

Analysis output:
- Per-person statistics (commits, LOC, top 3 active areas, test ratio)
- High-churn file list (instability signal)
- Low-test area warnings (< 20%)
- Trend comparison with previous retrospective (changes > 20% are flagged)

#### Decision Lens -- Decision Quality Assessment

Decision Lens collects architecture decisions from the project and evaluates them through 3 parallel agents from different dimensions:

| Agent Role | Evaluation Dimension | Rating |
|-----------|----------------------|--------|
| Technical Soundness | Does the implementation match the intent? Has the context changed? | sound / degraded / violated |
| Cost Assessment | How much complexity was added? Was technical debt introduced? | low-cost / acceptable / expensive / debt-creating |
| Alternative Hindsight | Was it the right choice in hindsight? | confirmed / questionable / should-revisit |

Based on the ratings across all 3 dimensions, decisions are classified as:

| Status | Meaning | Recommendation |
|--------|---------|----------------|
| Validated | Technically sound + cost-controlled + confirmed in hindsight | No action needed |
| Aging | Sound but costly | Schedule technical debt review |
| Questionable | Implementation has drifted or decision is doubtful | Create an issue to track |
| Stale | Environment has changed, needs re-evaluation | Refresh decision document |
| Reversed | Code behavior contradicts the decision | Record the reversal |

**Output paths**:

```
.workflow/knowhow/KNW-retro-{date}.md        # Unified report (Markdown)
.workflow/knowhow/KNW-retro-{date}.json      # Structured metrics (JSON)
specs/learnings.md                            # Appended <spec-entry> blocks
```

---

### 2.2 learn-follow -- Guided Reading

Extract deep understanding from code or documentation through section-by-section guided reading.

**Use cases**:

- Taking over an unfamiliar module, needing to quickly understand design intent
- Reading complex algorithm implementations, decomposing logic layer by layer
- Learning team coding conventions and implicit agreements
- Deeply understanding the design decisions in a wiki document

**Command syntax**:

```bash
/learn-follow src/auth/jwt.ts                     # Follow-read a specific file
/learn-follow src/utils/ --depth deep              # Deep follow-read of entire directory
/learn-follow arch-auth-design --save-wiki          # Follow-read wiki document and save notes
```

**Parameters**:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `<target>` | File path / Wiki ID / topic keyword | Required |
| `--depth shallow\|deep` | Shallow (key structures and patterns) or deep (every function, branch) | `shallow` |
| `--save-wiki` | Save reading notes as wiki entry | Off |

#### Target Resolution

The command automatically identifies the input type:

| Input Format | Resolution Method |
|-------------|-------------------|
| File path (contains `/` or `\`) | Read source file directly |
| Wiki ID (e.g. `spec-auth-flow`) | `maestro wiki get <id>` |
| Topic text | `maestro wiki search` and take the first result; fall back to Grep source code search if not found |

#### 4 Forcing Questions

The core of guided reading is **4 forcing questions**, applied to each section in turn:

| # | Question | What It Extracts |
|---|----------|-----------------|
| 1 | What pattern is used here? | Design patterns, idioms, conventions |
| 2 | Why was this approach chosen over alternatives? | Trade-offs, rejected options |
| 3 | What implicit assumptions does this code depend on? | Implicit contracts, input shapes, execution order |
| 4 | If this changes, what breaks? | Fragility points, downstream impact scope |

These 4 questions ensure reading goes beyond "what does this code do" to "why is it done this way, what are the prerequisites, where are the risks".

#### Context Construction

Guided reading does not read a file in isolation -- the command automatically builds a **1-hop context neighborhood**:

- **Wiki entries**: Automatically loads forward and backward references, reads top 3 related entries
- **Code files**: Parses import dependencies + reverse dependencies, reads top 3 downstream consumers
- **Directories**: Lists file structure, sorted by `entry -> core -> utility -> test`

#### Pattern Extraction

Extracted results are cross-referenced with `coding-conventions.md`:

- Documented patterns -> marked as "confirmed convention"
- Undocumented patterns -> marked as "candidate for spec-add", suggested for spec inclusion

**Output paths**:

```
.workflow/knowhow/KNW-follow-{slug}-{date}.md    # Understanding Map
specs/learnings.md                                # Appended <spec-entry> blocks
```

---

### 2.3 learn-decompose -- Code Pattern Decomposition

Systematically decompose complex code into a reusable design pattern catalog, with parallel analysis across 4 dimensions.

**Use cases**:

- Pattern inventory before module refactoring
- New member onboarding -- quickly understand a module's architecture language
- Extract team-common patterns, build a pattern library
- Post-refactoring documentation -- record newly introduced patterns

**Command syntax**:

```bash
/learn-decompose src/auth/                       # Decompose the auth module
/learn-decompose src/utils/ --patterns "Factory,Observer,Strategy"  # Focus on specified patterns
/learn-decompose src/core/ --save-spec --save-wiki  # Decompose and sync to spec and wiki
```

**Parameters**:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `<target>` | File path / directory / module name | Required |
| `--patterns <list>` | Comma-separated pattern name list for focused analysis | Detect all |
| `--save-spec` | Auto-call `spec-add` for each new pattern | Off |
| `--save-wiki` | Create wiki notes per dimension | Off |

#### 4-Dimension Parallel Analysis

The command launches 4 agents simultaneously, scanning code from different dimensions:

| Agent | Dimension | Detection Scope |
|-------|-----------|----------------|
| 1 -- Structural | Structural patterns | Class hierarchies, composition relationships, DI/IoC, Factory/Builder/Singleton, barrel exports |
| 2 -- Behavioral | Behavioral patterns | Event streams, middleware chains, Observer/Pub-Sub, Command/Strategy, state machines |
| 3 -- Data | Data patterns | Repository/DAO, DTO pipelines, caching strategies (memo/LRU/TTL), serialization, schema validation |
| 4 -- Error | Error patterns | Error boundaries, retry/backoff/circuit-breaker, degradation chains, guard clauses, logging strategies |

Each finding carries: pattern name, dimension attribution, confidence (high/medium/low), code anchor (file:line), description, rationale, trade-offs.

#### Cross-Referencing and Deduplication

After analysis completes, all findings are compared against existing knowledge:

| Status | Condition |
|--------|-----------|
| documented | Already exists in `coding-conventions.md` |
| known | Already exists in `specs/learnings.md` |
| new | Fresh discovery, not seen before |

Duplicate findings across dimensions are automatically merged. Findings that contradict existing documentation are flagged.

#### Integration with specs/wiki

- `--save-spec`: Each new-status pattern automatically generates a spec entry
- `--save-wiki`: Creates wiki notes grouped by dimension, for easy future reference

**Output paths**:

```
.workflow/knowhow/KNW-decompose-{slug}-{date}.md    # Pattern Catalog report
specs/learnings.md                                   # Appended <spec-entry> blocks
```

---

### 2.4 learn-second-opinion -- Multi-Perspective Analysis

Get alternative perspectives on code, decisions, or plans, avoiding blind spots from a single judgment.

**Use cases**:

- Multi-party review before major architecture decisions
- Self-review of your own code
- Solution review -- confirming the soundness of your choice
- "Second opinion" consultation when unsure about an approach

**Command syntax**:

```bash
/learn-second-opinion src/auth/jwt.ts                    # Default review mode
/learn-second-opinion src/core/ --mode challenge          # Adversarial challenge
/learn-second-opinion HEAD --mode consult                 # Interactive Q&A
/learn-second-opinion 2 --mode review                     # Review Phase 2 plan
```

**Parameters**:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `<target>` | File path / Wiki ID / `HEAD` / `staged` / Phase number | Required |
| `--mode` | `review` / `challenge` / `consult` | `review` |

#### Three Modes

**Review mode (default)**: 3 agents review in parallel

| Agent Role | Focus | Core Questions |
|-----------|-------|---------------|
| Pragmatist | Simplicity, YAGNI, maintenance cost | "Simplest viable approach? Maintenance burden?" |
| Purist | Correctness, edge cases, type safety | "Which assumptions could be violated?" |
| Strategist | Extensibility, architectural consistency | "Supports future growth? Fits the architecture?" |

Each agent returns: role name, conclusion (approve/concern/reject), confidence, findings list (with severity, description, location, recommendation), summary.

The final synthesis includes: consensus points, disagreement points, overall verdict, top 3 recommendations.

**Challenge mode**: Single adversarial agent

A dedicated adversarial agent attempts to:

1. Find the weakest assumption
2. Construct concrete failure scenarios
3. Identify the biggest risk points
4. Propose alternatives
5. Apply forcing questions:

   - "What would make this approach fail?"
   - "What is the simplest way to break this?"
   - "What will you regret in 6 months?"
   - "Which implicit contracts are not enforced?"

**Consult mode**: Interactive Q&A

The agent first deeply studies the target content, then enters an interactive loop:

1. Displays "Target loaded, what would you like to know?"
2. User asks question -> Agent responds with code references -> loop
3. User says "done" to end -> compiles Q&A report

**Output paths**:

```
.workflow/knowhow/KNW-opinion-{slug}-{date}.md    # Analysis report
specs/learnings.md                                 # Appended <spec-entry> blocks
```

---

### 2.5 learn-investigate -- Systematic Investigation

Investigate "why" and "how" questions in the codebase using the scientific method -- not bug fixing, but understanding the system.

**Use cases**:

- "What is the execution order of this middleware chain?"
- "Why do database queries slow down under high concurrency?"
- "What would happen if I switched the cache layer from Redis to Memcached?"
- "How does state management work in this module?"

**Command syntax**:

```bash
/learn-investigate "What is the full lifecycle of a JWT refresh token"
/learn-investigate "Why does queue consumption sometimes process duplicates" --scope src/queue/
/learn-investigate "What cache invalidation strategies are used" --max-hypotheses 5
```

**Parameters**:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `<question>` | The question to investigate | Required |
| `--scope <path>` | Limit search scope | Entire project |
| `--max-hypotheses N` | Maximum number of hypotheses; exceeding triggers escalation | 3 |

#### Hypothesis Testing Workflow

Investigate follows the standard scientific method:

```
Define Problem -> Collect Evidence -> Pattern Match -> Generate Hypotheses -> Test Hypotheses -> Synthesize Report
                                                                              ^
                                                                    3-strike escalation mechanism
```

**1. Define Problem (S_FRAME)**

Parse the question, generate a slug, create a working directory, search prior knowledge (wiki + specs/learnings + debug-notes).

**2. Collect Evidence (S_EVIDENCE)**

Execute 4 evidence channels in parallel:

| Channel | Method |
|---------|--------|
| Code search | Grep question keywords |
| File inspection | Read most relevant files |
| Dependency tracing | Follow import chains |
| Git history | `git log --oneline -10 -- <relevant files>` |

**3. Generate Hypotheses (S_HYPOTHESIZE)**

Generate a ranked list based on evidence. Each hypothesis is a specific, testable assertion:

```
[HIGH] JWT refresh uses a rotation strategy; old tokens expire 5 minutes after refresh -- Evidence: src/auth/jwt.ts:42, src/auth/refresh.ts:15
[MEDIUM] Refresh tokens are stored in Redis using SETEX command with TTL -- Evidence: src/store/token-store.ts:28
```

**4. Test Hypotheses (S_TEST)**

Test each hypothesis in priority order:

1. Design test -- what evidence would confirm or refute it?
2. Execute -- code tracing, targeted search, data inspection
3. Record -- append to evidence.ndjson
4. Update -- mark as confirmed / disproved / inconclusive

#### Evidence Log Mechanism

All evidence is recorded in NDJSON format to `evidence.ndjson`:

```json
{"ts": "2026-05-13T14:30:00Z", "type": "code", "source": "src/auth/jwt.ts:42", "relevance": "high", "content": "refreshToken.rotation = true", "note": "Confirms rotation strategy"}
{"ts": "2026-05-13T14:31:00Z", "type": "test", "source": "src/store/token-store.ts:28", "relevance": "high", "content": "await redis.setex(key, ttl, token)", "note": "MEDIUM hypothesis confirmed"}
```

#### 3-Strike Escalation Mechanism

When all hypotheses fail testing (inconclusive), escalation is triggered:

1. Ask the user -- expand scope or provide new hypotheses?
2. User chooses "expand scope" -> return to hypothesis generation phase, restart
3. User chooses "escalate" -> mark as INCONCLUSIVE, generate known-unknown report

**Output paths**:

```
.workflow/knowhow/KNW-investigate-{slug}/
  ├── evidence.ndjson       # Structured evidence log
  ├── understanding.md      # Evolving understanding document
  └── report.md             # Final report
specs/learnings.md          # Appended <spec-entry> blocks
```

---

## 3. Learning Data Flow

### Output Structure

All learning command outputs follow unified storage conventions:

```
project root/
├── .workflow/
│   └── knowhow/                           # Learning output directory
│       ├── KNW-retro-2026-05-13.md        # Retrospective report
│       ├── KNW-retro-2026-05-13.json      # Retrospective metrics
│       ├── KNW-follow-auth-jwt-2026-05-13.md    # Guided reading notes
│       ├── KNW-decompose-auth-2026-05-13.md     # Pattern catalog
│       ├── KNW-opinion-auth-jwt-2026-05-13.md   # Second opinion
│       └── KNW-investigate-token-refresh/        # Investigation directory
│           ├── evidence.ndjson
│           ├── understanding.md
│           └── report.md
└── specs/
    └── learnings.md                       # Unified learning codification
```

### Structure of learnings.md

`specs/learnings.md` is the unified codification target for all learning commands, using the `<spec-entry>` closed-tag format:

```xml
<spec-entry category="coding" keywords="jwt,auth,token-rotation" date="2026-05-13" source="learn-follow:src/auth/jwt.ts">
JWT refresh tokens use a rotation strategy. Old tokens expire 5 minutes after refresh.
Each refresh generates a new token pair; the old token is added to the blacklist.
</spec-entry>
```

Each entry includes:
- `category`: Learning category (coding/arch/debug/learning, etc.)
- `keywords`: Keyword tags for search and correlation
- `date`: Discovery date
- `source`: Source command + target, ensuring traceability

### Knowledge Flow Paths

```
Code/Docs/Git History
        |
        v
+------------------+
|  learn-* commands |  Interactive deep learning
|  (5 commands)     |
+--------+---------+
         |
    +----+----+
    v         v
knowhow/   specs/learnings.md
(KNW-*)    (<spec-entry> blocks)
    |         |
    |    +----+
    |    v
    |  spec-add / manage-learn
    |  (further standardization)
    |    |
    v    v
 wiki/  coding-conventions.md
 (long-term knowledge base)  (project conventions)
```

Key flow rules:
- All learning commands **automatically** write to knowhow reports and specs/learnings.md
- `--save-spec` / `--save-wiki` flags control whether to further sync to the spec system and wiki
- Duplicate findings are automatically deduplicated -- existing knowledge is marked as documented/known; only new entries proceed to codification

---

## 4. Use Case Quick Reference

### Choosing a Command by Intent

| What You Want To Do | Command | Example |
|--------------------|---------|---------|
| Review last week's work quality | `learn-retro` | `/learn-retro --lens git --days 7` |
| Check if architecture decisions are still valid | `learn-retro` | `/learn-retro --lens decision --phase 2` |
| Understand the design of an unfamiliar module | `learn-follow` | `/learn-follow src/auth/ --depth deep` |
| Learn implicit conventions in a code section | `learn-follow` | `/learn-follow src/utils/logger.ts` |
| Inventory a module's design patterns | `learn-decompose` | `/learn-decompose src/core/ --save-spec` |
| Extract a reusable pattern library | `learn-decompose` | `/learn-decompose src/ --save-wiki` |
| Review code quality (multi-perspective) | `learn-second-opinion` | `/learn-second-opinion src/api/` |
| Stress-test a solution | `learn-second-opinion` | `/learn-second-opinion HEAD --mode challenge` |
| Consult AI about an implementation | `learn-second-opinion` | `/learn-second-opinion plan.json --mode consult` |
| Understand "why does it work this way" | `learn-investigate` | `/learn-investigate "What causes cache penetration"` |
| Trace a complete call chain path | `learn-investigate` | `/learn-investigate "Request path from entry to database"` |

### Typical Workflow Combinations

**New Member Onboarding**:

```bash
/learn-follow src/                          # Follow-read source directory, understand overall structure
/learn-decompose src/core/ --save-wiki       # Decompose core module patterns
/learn-retro --lens git --days 30            # Understand recent development activity
```

**Before Architecture Decisions**:

```bash
/learn-follow src/auth/ --depth deep         # Deep understanding of existing implementation
/learn-second-opinion src/auth/ --mode review # Multi-perspective review
/learn-second-opinion src/auth/ --mode challenge  # Adversarial challenge
/learn-investigate "Which modules would be affected if auth is changed to OAuth2"
```

**Iteration Retrospective**:

```bash
/learn-retro --lens all --days 14 --compare  # Full retrospective, compare with last
/learn-investigate "Why is the churn rate so high in Phase 3" --scope src/api/
/learn-decompose src/api/ --save-spec        # Extract new patterns to spec
```

**Issue Investigation (Understanding, Not Fixing)**:

```bash
/learn-investigate "Why does queue consumption latency increase during peak hours" --scope src/queue/
/learn-follow src/queue/worker.ts            # Follow-read key file
/learn-second-opinion src/queue/ --mode consult  # Interactive consultation
```

### Natural Transitions Between Commands

After each learn command completes, it suggests follow-up steps. Common transition paths:

```
learn-follow -> learn-decompose     # From understanding to pattern extraction
learn-follow -> learn-second-opinion # From understanding to multi-perspective validation
learn-decompose -> spec-add          # From pattern discovery to spec inclusion
learn-retro -> learn-investigate     # From retrospective finding to deep investigation
learn-investigate -> learn-follow    # From problem identification to deep reading
learn-second-opinion -> learn-decompose  # From challenge to systematic decomposition
```
