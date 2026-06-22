// ---------------------------------------------------------------------------
// Session-level state changes for stale Ralph/Maestro sessions.
// ---------------------------------------------------------------------------

import { resolveSession, writeStatus, workflowRoot } from './status-store.js';
import { checkRunningSessionGuard } from './running-guard.js';

export interface PauseCmdOptions {
  sessionId?: string;
  reason?: string;
  allowConcurrent?: boolean;
}

export interface FinishCmdOptions {
  sessionId?: string;
  force?: boolean;
  allowConcurrent?: boolean;
}

export async function runPause(opts: PauseCmdOptions): Promise<number> {
  const root = workflowRoot();
  const guard = checkRunningSessionGuard(root, {
    command: 'ralph pause',
    sessionId: opts.sessionId,
    allowConcurrent: opts.allowConcurrent,
  });
  if (!guard.ok) return 2;

  const resolved = resolveSession(root, opts.sessionId, { requireRunning: !opts.sessionId });
  if (!resolved) {
    console.error('[ralph pause] no running maestro-* / ralph-* session found in .workflow/.maestro/');
    return 1;
  }

  resolved.data.status = 'paused';
  if (opts.reason) {
    resolved.data.pause_reason = opts.reason;
    resolved.data.paused_at = new Date().toISOString();
  }
  writeStatus(resolved.statusPath, resolved.data);
  console.error(`[ralph pause] session=${resolved.sessionId} status=paused`);
  return 0;
}

export async function runFinish(opts: FinishCmdOptions): Promise<number> {
  const root = workflowRoot();
  const guard = checkRunningSessionGuard(root, {
    command: 'ralph finish',
    sessionId: opts.sessionId,
    allowConcurrent: opts.allowConcurrent,
  });
  if (!guard.ok) return 2;

  const resolved = resolveSession(root, opts.sessionId, { requireRunning: !opts.sessionId });
  if (!resolved) {
    console.error('[ralph finish] no running maestro-* / ralph-* session found in .workflow/.maestro/');
    return 1;
  }

  const pending = resolved.data.steps.filter(step => step.status !== 'completed' && step.status !== 'skipped');
  if (pending.length > 0 && !opts.force) {
    console.error(`[ralph finish] session has ${pending.length} unfinished step(s); pass --force to mark the session completed anyway`);
    return 2;
  }

  resolved.data.status = 'completed';
  resolved.data.active_step_index = null;
  resolved.data.completed_at = new Date().toISOString();
  writeStatus(resolved.statusPath, resolved.data);
  console.error(`[ralph finish] session=${resolved.sessionId} status=completed`);
  return 0;
}
