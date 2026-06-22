// ---------------------------------------------------------------------------
// `maestro ralph` — Ralph step loader & status.json driver.
//
// Subcommands:
//   skills     List effective commands + skills (global + project, project wins)
//   create     Create a ralph session via CLI-owned status.json writer
//   list       List all ralph / maestro sessions and warn on multiple running
//   check      Run health check against current ralph status.json
//   session    Show current ralph session summary
//   next       Load next pending step + required_reading, write status.json
//   complete   Mark current step done / concerns / retry / blocked
//   retry      Sugar for `complete <idx> --status NEEDS_RETRY`
//
// Data contract: drives `.workflow/.maestro/ralph-*/status.json`.
// NOT to be confused with `maestro coordinate` (graph chain walker).
// ---------------------------------------------------------------------------

import type { Command } from 'commander';

// Lazy module loader — keeps cold start cheap and isolates ralph-only deps.
async function loadSkillsCmd() {
  return (await import('../ralph/cmd-skills.js')).runSkills;
}
async function loadListCmd() {
  return (await import('../ralph/cmd-list.js')).runList;
}
async function loadCreateCmd() {
  return (await import('../ralph/cmd-create.js')).runCreate;
}
async function loadCheckCmd() {
  return (await import('../ralph/cmd-check.js')).runCheck;
}
async function loadSessionCmd() {
  return (await import('../ralph/cmd-session.js')).runSession;
}
async function loadNextCmd() {
  return (await import('../ralph/cmd-next.js')).runNext;
}
async function loadCompleteCmd() {
  return (await import('../ralph/cmd-complete.js')).runComplete;
}

const VALID_STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_RETRY', 'BLOCKED'] as const;
export type RalphCompletionStatus = typeof VALID_STATUSES[number];

export function registerRalphCommand(program: Command): void {
  const ralph = program
    .command('ralph')
    .description('Ralph step loader & status.json driver (separate from coordinate)');

  // ── create ──────────────────────────────────────────────────────────────
  ralph
    .command('create <intent>')
    .description('Create a ralph session status.json from high-level step specs')
    .requiredOption('--step <spec>', 'Step spec, repeated. Use "skill args" or "decision:<gate>"', collect, [] as string[])
    .option('--platform <platform>', 'Skill platform: claude | codex | agent | agy', 'codex')
    .option('--position <position>', 'Lifecycle position override')
    .option('--phase <number>', 'Phase number')
    .option('--phase-new', 'Mark phase as newly derived')
    .option('--milestone <id>', 'Milestone id')
    .option('--auto', 'Set session.auto_mode=true')
    .option('--quality <mode>', 'Quality mode: full | standard | quick', 'standard')
    .option('--planning <mode>', 'Planning mode: unified | independent', 'independent')
    .option('--allow-concurrent', 'Allow creating a new session while another is running')
    .option('--json', 'Output created session metadata as JSON')
    .action(async (intent: string, opts: {
      step: string[];
      platform: string;
      position?: string;
      phase?: string;
      phaseNew?: boolean;
      milestone?: string;
      auto?: boolean;
      quality: string;
      planning: string;
      allowConcurrent?: boolean;
      json?: boolean;
    }) => {
      const platform = normalizeEnum(opts.platform, ['claude', 'codex', 'agent', 'agy'], 'platform');
      const quality = normalizeEnum(opts.quality, ['full', 'standard', 'quick'], 'quality');
      const planning = normalizeEnum(opts.planning, ['unified', 'independent'], 'planning');
      if (!platform || !quality || !planning) process.exit(2);
      let phase: number | null = null;
      if (opts.phase !== undefined) {
        phase = Number.parseInt(opts.phase, 10);
        if (!Number.isFinite(phase) || phase < 0) {
          console.error(`[ralph create] --phase must be a non-negative integer (got "${opts.phase}")`);
          process.exit(2);
        }
      }
      const run = await loadCreateCmd();
      const code = await run({
        intent,
        steps: opts.step,
        platform,
        lifecyclePosition: opts.position,
        phase,
        phaseIsNew: !!opts.phaseNew,
        milestone: opts.milestone,
        autoMode: !!opts.auto,
        qualityMode: quality,
        planningMode: planning,
        allowConcurrent: !!opts.allowConcurrent,
        json: !!opts.json,
      });
      process.exit(code);
    });

  // ── skills ──────────────────────────────────────────────────────────────
  ralph
    .command('skills')
    .description('List effective commands + skills (project overrides global)')
    .option('--json', 'Machine-readable output (single JSON line per entry)')
    .option('--quiet', 'Suppress decorative output (for ralph build consumption)')
    .option('--platform <platform>', 'Filter by platform: claude | codex | agent | agy (recommended)')
    .action(async (opts: { json?: boolean; quiet?: boolean; platform?: string }) => {
      const run = await loadSkillsCmd();
      const platform = opts.platform as ('claude' | 'codex' | 'agent' | 'agy' | undefined);
      const code = await run({ json: !!opts.json, quiet: !!opts.quiet, platform });
      process.exit(code);
    });

  // -- list ----------------------------------------------------------------
  ralph
    .command('list')
    .description('List all ralph / maestro sessions and warn when multiple are running')
    .option('--json', 'Output sessions as JSON')
    .option('--strict', 'Exit 2 when multiple running sessions are detected')
    .action(async (opts: { json?: boolean; strict?: boolean }) => {
      const run = await loadListCmd();
      const code = await run({ json: !!opts.json, strict: !!opts.strict });
      process.exit(code);
    });

  // ── check ───────────────────────────────────────────────────────────────
  ralph
    .command('check')
    .description('Health-check the current ralph status.json')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .option('--json', 'Output findings as JSON')
    .action(async (opts: { session?: string; json?: boolean }) => {
      const run = await loadCheckCmd();
      const code = await run({ sessionId: opts.session, json: !!opts.json });
      process.exit(code);
    });

  // ── session ─────────────────────────────────────────────────────────────
  ralph
    .command('session')
    .description('Show current ralph session summary')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .action(async (opts: { session?: string }) => {
      const run = await loadSessionCmd();
      const code = await run({ sessionId: opts.session });
      process.exit(code);
    });

  // ── next ────────────────────────────────────────────────────────────────
  ralph
    .command('next')
    .description('Load next pending step + required_reading, write status.json, print prompt')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .option('--allow-concurrent', 'Allow implicit selection even when multiple sessions are running')
    .action(async (opts: { session?: string; allowConcurrent?: boolean }) => {
      const run = await loadNextCmd();
      const code = await run({ sessionId: opts.session, allowConcurrent: !!opts.allowConcurrent });
      process.exit(code);
    });

  // ── complete ────────────────────────────────────────────────────────────
  ralph
    .command('complete <index>')
    .description('Mark step at <index> complete with a STATUS verdict')
    .requiredOption('--status <status>', `One of: ${VALID_STATUSES.join('|')}`)
    .option('--evidence <path>', 'Artifact path / output excerpt (repeatable)', collect, [] as string[])
    .option('--concerns <text>', 'Concerns text (with DONE_WITH_CONCERNS)')
    .option('--reason <text>', 'Reason (with BLOCKED)')
    .option('--summary <text>', 'One-sentence summary of what this step accomplished')
    .option('--decisions <text>', 'Key decision made (repeatable)', collect, [] as string[])
    .option('--caveats <text>', 'Warnings/notes for downstream steps')
    .option('--deferred <text>', 'Deferred work item (repeatable)', collect, [] as string[])
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .option('--allow-concurrent', 'Allow implicit selection even when multiple sessions are running')
    .action(async (indexArg: string, opts: {
      status: string;
      evidence: string[];
      concerns?: string;
      reason?: string;
      summary?: string;
      decisions?: string[];
      caveats?: string;
      deferred?: string[];
      session?: string;
      allowConcurrent?: boolean;
    }) => {
      const status = opts.status.toUpperCase() as RalphCompletionStatus;
      if (!(VALID_STATUSES as readonly string[]).includes(status)) {
        console.error(`[ralph complete] --status must be one of: ${VALID_STATUSES.join(', ')} (got "${opts.status}")`);
        process.exit(2);
      }
      const index = Number.parseInt(indexArg, 10);
      if (!Number.isFinite(index) || index < 0) {
        console.error(`[ralph complete] <index> must be a non-negative integer (got "${indexArg}")`);
        process.exit(2);
      }
      const run = await loadCompleteCmd();
      const code = await run({
        sessionId: opts.session,
        index,
        status,
        evidence: opts.evidence,
        concerns: opts.concerns,
        reason: opts.reason,
        summary: opts.summary,
        decisions: opts.decisions,
        caveats: opts.caveats,
        deferred: opts.deferred,
        allowConcurrent: !!opts.allowConcurrent,
      });
      process.exit(code);
    });

  // ── retry ───────────────────────────────────────────────────────────────
  ralph
    .command('retry <index>')
    .description('Sugar: mark step at <index> as NEEDS_RETRY')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .option('--allow-concurrent', 'Allow implicit selection even when multiple sessions are running')
    .action(async (indexArg: string, opts: { session?: string; allowConcurrent?: boolean }) => {
      const index = Number.parseInt(indexArg, 10);
      if (!Number.isFinite(index) || index < 0) {
        console.error(`[ralph retry] <index> must be a non-negative integer (got "${indexArg}")`);
        process.exit(2);
      }
      const run = await loadCompleteCmd();
      const code = await run({
        sessionId: opts.session,
        index,
        status: 'NEEDS_RETRY',
        evidence: [],
        allowConcurrent: !!opts.allowConcurrent,
      });
      process.exit(code);
    });
}

function collect(value: string, prior: string[]): string[] {
  return prior.concat(value);
}

function normalizeEnum<T extends string>(value: string, allowed: readonly T[], label: string): T | null {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  console.error(`[ralph create] --${label} must be one of: ${allowed.join(', ')} (got "${value}")`);
  return null;
}
