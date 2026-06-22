// ---------------------------------------------------------------------------
// `maestro ralph create` — CLI-owned Ralph status.json creation.
//
// This keeps session file creation centralized in CLI code. Skills may still
// decide the chain, but they pass high-level step specs here instead of writing
// `.workflow/.maestro/*/status.json` by hand.
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import type { CommandScope, RalphSession, RalphStep, SessionPlatform } from './status-schema.js';
import { RALPH_PROTOCOL_VERSION } from './status-schema.js';
import { createSessionDir, statusPathFor, workflowRoot, writeStatus } from './status-store.js';
import { findSkill } from './skill-scanner.js';
import { guardNewSession } from './running-guard.js';

export interface CreateCmdOptions {
  intent: string;
  steps: string[];
  platform?: SessionPlatform;
  lifecyclePosition?: string;
  phase?: number | null;
  phaseIsNew?: boolean;
  milestone?: string;
  autoMode?: boolean;
  qualityMode?: 'full' | 'standard' | 'quick';
  planningMode?: 'unified' | 'independent';
  allowConcurrent?: boolean;
  json?: boolean;
}

interface ParsedStepSpec {
  decision: string | null;
  skill: string;
  args: string;
}

export async function runCreate(opts: CreateCmdOptions): Promise<number> {
  const root = workflowRoot();
  const guard = guardNewSession(root, {
    command: 'ralph create',
    allowConcurrent: opts.allowConcurrent,
  });
  if (!guard.ok) return 2;

  if (!opts.intent.trim()) {
    console.error('[ralph create] intent is required');
    return 2;
  }
  if (opts.steps.length === 0) {
    console.error('[ralph create] at least one --step is required');
    return 2;
  }

  const platform = opts.platform ?? 'codex';
  const sessionId = makeSessionId(root);
  let steps: RalphStep[];
  try {
    steps = buildSteps(opts.steps, platform);
  } catch (err) {
    console.error(`[ralph create] ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  const missing = steps.filter(step => !step.decision && step.command_scope === 'missing');
  if (missing.length > 0) {
    console.error('[ralph create] E006: missing command_path for step(s):');
    for (const step of missing) {
      console.error(`  [${step.index}] ${step.skill}`);
    }
    return 1;
  }

  const session: RalphSession = {
    session_id: sessionId,
    source: 'ralph',
    status: 'running',
    ralph_protocol_version: RALPH_PROTOCOL_VERSION,
    active_step_index: null,
    intent: opts.intent,
    lifecycle_position: opts.lifecyclePosition ?? inferLifecyclePosition(steps),
    phase: opts.phase ?? null,
    phase_is_new: opts.phaseIsNew ?? false,
    milestone: opts.milestone ?? '',
    auto_mode: opts.autoMode ?? false,
    quality_mode: opts.qualityMode ?? 'standard',
    planning_mode: opts.planningMode ?? 'independent',
    scope_verdict: null,
    analyze_macro_id: null,
    blueprint_id: null,
    cli_tool: platform === 'codex' ? 'codex' : platform,
    platform,
    passed_gates: [],
    context: {
      issue_id: null,
      scratch_dir: null,
      plan_dir: null,
      analysis_dir: null,
      brainstorm_dir: null,
      blueprint_dir: null,
    },
    steps,
    waves: [],
    current_step: 0,
  };

  const created = createSessionDir(root, sessionId);
  writeStatus(created.statusPath, session);

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      session_id: sessionId,
      status_path: created.statusPath,
      steps: steps.length,
    }, null, 2) + '\n');
  } else {
    console.log(`[ralph create] session=${sessionId}`);
    console.log(`[ralph create] status=${created.statusPath}`);
    for (const step of steps) {
      if (step.decision) {
        console.log(`  ${step.index}. decision:${step.decision}`);
      } else {
        const args = step.args ? ` ${step.args}` : '';
        console.log(`  ${step.index}. ${step.skill}${args} [${step.command_scope}]`);
      }
    }
  }

  return 0;
}

function buildSteps(specs: string[], platform: SessionPlatform): RalphStep[] {
  return specs.map((spec, index) => {
    const parsed = parseStepSpec(spec);
    if (parsed.decision) {
      return baseStep({
        index,
        skill: '',
        args: '',
        stage: 'decision',
        decision: parsed.decision,
        commandScope: null,
        commandPath: null,
      });
    }

    const resolved = findSkill(parsed.skill, undefined, platform);
    return baseStep({
      index,
      skill: parsed.skill,
      args: parsed.args,
      stage: inferStage(parsed.skill, parsed.args),
      decision: null,
      commandScope: resolved ? resolved.scope : 'missing',
      commandPath: resolved?.filePath ?? null,
    });
  });
}

function baseStep(opts: {
  index: number;
  skill: string;
  args: string;
  stage: string;
  decision: string | null;
  commandScope: CommandScope;
  commandPath: string | null;
}): RalphStep {
  return {
    index: opts.index,
    skill: opts.skill,
    args: opts.args,
    stage: opts.stage,
    scope: null,
    decision: opts.decision,
    retry_count: opts.decision ? 0 : undefined,
    max_retries: opts.decision ? 2 : undefined,
    command_scope: opts.commandScope,
    command_path: opts.commandPath,
    milestone_id: null,
    source_artifact_ref: null,
    status: 'pending',
    goal_ref: null,
    completion_confirmed: false,
    completion_status: null,
    completion_evidence: null,
    completed_at: null,
    deferred_reads: [],
    load: undefined,
  };
}

function parseStepSpec(spec: string): ParsedStepSpec {
  const trimmed = spec.trim();
  if (!trimmed) {
    throw new Error('empty step spec');
  }

  if (trimmed.startsWith('decision:')) {
    const decision = trimmed.slice('decision:'.length).trim();
    if (!decision) throw new Error(`empty decision step: ${spec}`);
    return { decision, skill: '', args: '' };
  }

  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) throw new Error(`invalid step spec: ${spec}`);
  return {
    decision: null,
    skill: match[1],
    args: (match[2] ?? '').trim(),
  };
}

function inferStage(skill: string, args: string): string {
  if (skill === 'maestro-grill') return 'grill';
  if (skill === 'maestro-brainstorm') return 'brainstorm';
  if (skill === 'maestro-blueprint') return 'blueprint';
  if (skill === 'maestro-init') return 'init';
  if (skill === 'maestro-analyze') return args.includes('--macro') ? 'analyze-macro' : 'analyze';
  if (skill === 'maestro-roadmap') return 'roadmap';
  if (skill === 'maestro-plan') return 'plan';
  if (skill === 'maestro-execute') return 'execute';
  if (skill === 'quality-review') return 'review';
  if (skill === 'quality-test') return 'test';
  if (skill === 'quality-auto-test') return 'test-gen';
  if (skill === 'maestro-milestone-audit') return 'milestone-audit';
  if (skill === 'maestro-milestone-complete') return 'milestone-complete';
  return skill.replace(/^maestro-/, '').replace(/^quality-/, '');
}

function inferLifecyclePosition(steps: RalphStep[]): string {
  const first = steps.find(step => !step.decision);
  return first?.stage ?? 'unknown';
}

function makeSessionId(root: string): string {
  const now = new Date();
  const base = [
    String(now.getFullYear()),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    '-',
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join('');
  const first = `ralph-${base}`;
  if (!existsSync(statusPathFor(root, first))) return first;
  for (let i = 1; i < 100; i++) {
    const candidate = `${first}-${String(i).padStart(2, '0')}`;
    if (!existsSync(statusPathFor(root, candidate))) return candidate;
  }
  throw new Error('unable to allocate ralph session id');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
