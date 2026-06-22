// ---------------------------------------------------------------------------
// `maestro ralph list` — list all ralph / maestro sessions.
// Highlights multiple running sessions so operators can lock commands with
// `--session` instead of relying on mtime-based discovery.
// ---------------------------------------------------------------------------

import { statSync } from 'node:fs';
import { listRalphSessions, resolveSession, workflowRoot } from './status-store.js';

export interface ListCmdOptions {
  json?: boolean;
  strict?: boolean;
}

interface SessionListEntry {
  session_id: string;
  status: string;
  source: string | null;
  lifecycle_position: string | null;
  phase: number | null;
  milestone: string | null;
  progress: string;
  active_step_index: number | null;
  updated_at: string | null;
  intent: string | null;
  error?: string;
}

export async function runList(opts: ListCmdOptions): Promise<number> {
  const root = workflowRoot();
  const names = listRalphSessions(root);
  const sessions: SessionListEntry[] = [];

  for (const name of names) {
    try {
      const resolved = resolveSession(root, name);
      if (!resolved) continue;
      const s = resolved.data;
      const completed = s.steps.filter(step => step.status === 'completed').length;
      const updatedAt = statusUpdatedAt(resolved.statusPath);
      sessions.push({
        session_id: resolved.sessionId,
        status: s.status,
        source: s.source ?? null,
        lifecycle_position: s.lifecycle_position ?? null,
        phase: s.phase ?? null,
        milestone: s.milestone || null,
        progress: `${completed}/${s.steps.length}`,
        active_step_index: s.active_step_index ?? null,
        updated_at: updatedAt,
        intent: compact(s.intent, 96),
      });
    } catch (err) {
      sessions.push({
        session_id: name,
        status: 'unreadable',
        source: null,
        lifecycle_position: null,
        phase: null,
        milestone: null,
        progress: '0/0',
        active_step_index: null,
        updated_at: null,
        intent: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const running = sessions.filter(s => s.status === 'running');
  const warning = running.length > 1
    ? `multiple running sessions (${running.length}): ${running.map(s => s.session_id).join(', ')}`
    : null;

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      ok: !warning,
      running_count: running.length,
      warning,
      sessions,
    }, null, 2) + '\n');
    return opts.strict && warning ? 2 : 0;
  }

  if (sessions.length === 0) {
    console.log('[ralph list] no maestro-* / ralph-* sessions found in .workflow/.maestro/');
    return 0;
  }

  if (warning) {
    console.error(`[ralph list] WARNING: ${warning}`);
    console.error('[ralph list] Use explicit --session for ralph next/check/session/status/complete.');
    console.error('');
  }

  console.log(`Ralph sessions (${sessions.length}):`);
  for (const s of sessions) {
    const mark = s.status === 'running' ? '*' : ' ';
    const active = s.active_step_index === null ? '-' : String(s.active_step_index);
    const updated = s.updated_at ?? '-';
    const phase = s.phase === null ? '-' : String(s.phase);
    const intent = s.error ? `ERROR: ${s.error}` : (s.intent ?? '');
    console.log(`${mark} ${s.session_id}  ${pad(s.status, 10)} progress=${pad(s.progress, 5)} active=${pad(active, 3)} phase=${pad(phase, 3)} updated=${updated}`);
    if (intent) console.log(`    ${intent}`);
  }

  return opts.strict && warning ? 2 : 0;
}

function statusUpdatedAt(statusPath: string): string | null {
  try {
    return new Date(statSync(statusPath).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function compact(value: string | undefined, max: number): string {
  const singleLine = (value ?? '').replace(/\s+/g, ' ').trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, Math.max(0, max - 3))}...`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}
