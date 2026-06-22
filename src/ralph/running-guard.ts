import { listRunningRalphSessions, type ResolvedSession } from './status-store.js';

export interface RunningGuardOptions {
  command: string;
  sessionId?: string;
  allowConcurrent?: boolean;
}

export interface RunningGuardResult {
  ok: boolean;
  running: ResolvedSession[];
}

export function checkRunningSessionGuard(
  workflowRoot: string,
  opts: RunningGuardOptions,
): RunningGuardResult {
  const running = listRunningRalphSessions(workflowRoot);
  if (opts.allowConcurrent) return { ok: true, running };

  if (opts.sessionId) {
    if (running.length > 1) {
      printRunningWarning(opts.command, running, { explicit: true });
    }
    return { ok: true, running };
  }

  if (running.length > 1) {
    printRunningWarning(opts.command, running, { explicit: false });
    return { ok: false, running };
  }

  return { ok: true, running };
}

export function guardNewSession(
  workflowRoot: string,
  opts: { command: string; allowConcurrent?: boolean },
): RunningGuardResult {
  const running = listRunningRalphSessions(workflowRoot);
  if (opts.allowConcurrent || running.length === 0) {
    return { ok: true, running };
  }

  printCreateBlocked(opts.command, running);
  return { ok: false, running };
}

function printRunningWarning(
  command: string,
  running: ResolvedSession[],
  opts: { explicit: boolean },
): void {
  const ids = running.map(s => s.sessionId).join(', ');
  console.error(`[${command}] W003: multiple running maestro/ralph sessions detected: ${ids}`);
  if (opts.explicit) {
    console.error(`[${command}] continuing because --session was specified.`);
  } else {
    console.error(`[${command}] refusing implicit session selection. Pass --session <id> for the intended session.`);
  }
  console.error(`[${command}] Pause or finish stale sessions before continuing, or use --allow-concurrent only when concurrent execution is intentional.`);
}

function printCreateBlocked(command: string, running: ResolvedSession[]): void {
  const ids = running.map(s => s.sessionId).join(', ');
  console.error(`[${command}] W003: running maestro/ralph session already exists: ${ids}`);
  console.error(`[${command}] New sessions are blocked by default to avoid multiple running chains.`);
  console.error(`[${command}] Pause or finish the existing session first, or pass --allow-concurrent if this is intentional.`);
}
