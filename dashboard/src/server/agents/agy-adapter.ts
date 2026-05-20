// ---------------------------------------------------------------------------
// AgyAdapter — spawns the Antigravity (agy) CLI in non-interactive --print mode
//
// agy output strategy (dual-source):
//   1. stdout = plain text assistant reply (agy has no --json flag)
//   2. transcript.jsonl at ~/.gemini/antigravity-cli/brain/<conv>/.system_generated/
//      logs/transcript.jsonl gets structured tool calls, thinking, results
//
// We treat stdout lines as the streamed assistant message, then after the
// process exits we locate the newest transcript and emit retrospective
// tool_use / thinking entries derived from it. This gives the runner the full
// picture (final text + tool history) without requiring agy to expose JSON.
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type {
  AgentConfig,
  AgentProcess,
  ApprovalDecision,
} from '../../shared/agent-types.js';
import { BaseAgentAdapter } from './base-adapter.js';
import { EntryNormalizer } from './entry-normalizer.js';
import { loadEnvFile } from './env-file-loader.js';
import { StreamMonitor, DEFAULT_STREAM_TIMEOUT_MS } from './stream-monitor.js';
import { createStaleHandler } from './stale-handler.js';
import { killProcessTree } from './process-tree-kill.js';
import { cleanSpawnEnv } from './env-cleanup.js';

// ---------------------------------------------------------------------------
// Transcript schema (subset of fields we use)
// ---------------------------------------------------------------------------

interface AgyTranscriptEntry {
  step_index: number;
  source: 'USER_EXPLICIT' | 'MODEL' | 'SYSTEM' | string;
  type: string; // USER_INPUT | PLANNER_RESPONSE | LIST_DIRECTORY | VIEW_FILE | CODE_ACTION | GENERIC | ERROR_MESSAGE | ...
  status: 'DONE' | 'ERROR' | string;
  created_at: string;
  content?: string;
  thinking?: string;
  tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
  error?: string;
}

// Tool result-bearing entry types (model emits content as the result text).
const TOOL_RESULT_TYPES = new Set([
  'LIST_DIRECTORY',
  'VIEW_FILE',
  'CODE_ACTION',
  'GENERIC',
  'GREP_SEARCH',
  'SEARCH_WEB',
  'RUN_COMMAND',
  'READ_URL_CONTENT',
]);

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const DEFAULT_AGY_BIN_CANDIDATES = (): string[] => {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'agy', 'bin', 'agy.exe'));
  } else {
    candidates.push(join(homedir(), '.local', 'bin', 'agy'));
    candidates.push('/usr/local/bin/agy');
  }
  return candidates;
};

function resolveAgyBinary(): string {
  for (const p of DEFAULT_AGY_BIN_CANDIDATES()) {
    if (existsSync(p)) return p;
  }
  // Fall back to PATH resolution via shell.
  return 'agy';
}

const AGY_BRAIN_DIR = join(homedir(), '.gemini', 'antigravity-cli', 'brain');
const AGY_HISTORY_FILE = join(homedir(), '.gemini', 'antigravity-cli', 'history.jsonl');

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export class AgyAdapter extends BaseAgentAdapter {
  readonly agentType = 'agy' as const;

  private readonly childProcesses = new Map<string, ChildProcess>();
  private readonly readlineInterfaces = new Map<string, ReadlineInterface>();
  private readonly streamMonitors = new Map<string, StreamMonitor>();
  private readonly stoppedEmitted = new Set<string>();
  private readonly spawnTimestamps = new Map<string, number>();
  private readonly textBuffers = new Map<string, string>();

  // --- Lifecycle hooks -----------------------------------------------------

  protected async doSpawn(
    processId: string,
    config: AgentConfig,
  ): Promise<AgentProcess> {
    const args: string[] = ['--print'];

    // --print-timeout: convert ms → "<n>s" (agy uses Go duration format)
    // Floor at 60s to give the agent room; ceiling at config.streamTimeoutMs.
    const timeoutMs = config.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
    const timeoutSec = Math.max(60, Math.floor(timeoutMs / 1000));
    args.push('--print-timeout', `${timeoutSec}s`);

    // approvalMode='auto' (write mode) → bypass permission prompts.
    // 'suggest' (analysis mode) keeps defaults.
    if (config.approvalMode === 'auto') {
      args.push('--dangerously-skip-permissions');
    }

    // includeDirs and resume are threaded through config.metadata by the runner
    // (see src/agents/cli-agent-runner.ts:331). Pick them up here.
    const metadata = (config.metadata ?? {}) as {
      includeDirs?: string[];
      agyConversationId?: string;
      agyResumeLast?: boolean;
    };

    if (metadata.includeDirs && metadata.includeDirs.length > 0) {
      for (const dir of metadata.includeDirs) {
        args.push('--add-dir', dir);
      }
    }

    // Resume: agy supports -c (last) and --conversation <id>.
    if (metadata.agyConversationId) {
      args.push('--conversation', metadata.agyConversationId);
    } else if (metadata.agyResumeLast) {
      args.push('-c');
    }

    // Prompt as positional after --print.
    args.push(config.prompt);

    // Environment
    const envFromFile = config.envFile ? loadEnvFile(config.envFile) : {};
    const envOverrides: Record<string, string | undefined> = { ...envFromFile, ...config.env };
    if (config.apiKey) envOverrides.GEMINI_API_KEY = config.apiKey;
    const childEnv = cleanSpawnEnv(envOverrides);

    const bin = resolveAgyBinary();
    const usesPath = bin === 'agy';
    const spawnedAt = Date.now();
    this.spawnTimestamps.set(processId, spawnedAt);

    const child = spawn(bin, args, {
      cwd: config.workDir,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Use shell only when falling back to PATH lookup; resolved absolute
      // paths spawn directly so killProcessTree owns the whole tree.
      shell: usesPath,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });

    if (!child.stdout || !child.stderr) {
      throw new Error('Failed to spawn agy: stdio streams not available');
    }

    // Stale-stream monitor — shared cascade with other adapters.
    const monitor = new StreamMonitor(
      createStaleHandler({
        processId,
        child,
        timeoutMs,
        onStaleDetected: (message) =>
          this.emitEntry(processId, EntryNormalizer.error(processId, message, 'stream_stale')),
        isStopped: () => this.stoppedEmitted.has(processId),
        emitStopped: (reason) => this.emitStopped(processId, reason),
      }),
      timeoutMs,
    );
    this.streamMonitors.set(processId, monitor);

    // stdout = plain-text assistant reply. We buffer chunks and re-emit each
    // line as a (partial=false) assistant_message so the dashboard / TUI sees
    // the response as it lands. A single combined message is emitted after
    // exit to make the final transcript self-contained.
    this.textBuffers.set(processId, '');
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line: string) => {
      monitor.heartbeat();
      const trimmed = line.trim();
      if (trimmed.length === 0) return;
      const buf = this.textBuffers.get(processId) ?? '';
      this.textBuffers.set(processId, buf.length === 0 ? trimmed : `${buf}\n${trimmed}`);
      this.emitEntry(processId, EntryNormalizer.assistantMessage(processId, trimmed, true));
    });

    // stderr → error entries (skipped for transient progress noise).
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text.length === 0) return;
      // agy prints progress lines like "Thinking..." to stderr — filter them.
      if (/^(thinking|processing|loading|connecting)\b/i.test(text)) return;
      this.emitEntry(processId, EntryNormalizer.error(processId, text, 'stderr'));
    });

    this.setupProcessListeners(child, processId);

    this.childProcesses.set(processId, child);
    this.readlineInterfaces.set(processId, rl);

    return {
      id: processId,
      type: 'agy',
      status: 'running',
      config,
      startedAt: new Date().toISOString(),
      pid: child.pid,
    };
  }

  protected async doStop(processId: string): Promise<void> {
    const child = this.childProcesses.get(processId);
    if (!child) return;

    const proc = this.getProcess(processId);
    if (proc) {
      proc.status = 'stopping';
      this.emitEntry(
        processId,
        EntryNormalizer.statusChange(processId, 'stopping', 'User requested stop'),
      );
    }

    killProcessTree(child.pid, 'SIGTERM');

    const killTimer = setTimeout(() => {
      if (!child.killed) killProcessTree(child.pid, 'SIGKILL');
    }, 5000);
    child.once('exit', () => clearTimeout(killTimer));

    this.cleanup(processId);
  }

  protected async doSendMessage(_processId: string, _content: string): Promise<void> {
    // agy --print is single-shot; interactive mode would require -i (--prompt-interactive)
    // which is out of scope for the headless delegate path.
    throw new Error('agy does not support interactive messages in --print mode');
  }

  protected async doRespondApproval(_decision: ApprovalDecision): Promise<void> {
    // Approvals are gated client-side via --dangerously-skip-permissions.
  }

  // --- Transcript enrichment ----------------------------------------------

  /**
   * After the agy process exits, locate the conversation transcript that was
   * touched during our run and emit tool_use / thinking / file_change entries
   * derived from it. This gives downstream consumers (CliHistoryStore, the
   * dashboard) structured visibility that --print stdout cannot provide.
   */
  private enrichFromTranscript(processId: string): void {
    const spawnedAt = this.spawnTimestamps.get(processId) ?? 0;
    if (!existsSync(AGY_BRAIN_DIR)) return;

    let latest: { path: string; mtime: number } | null = null;
    try {
      for (const entry of readdirSync(AGY_BRAIN_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const transcriptPath = join(AGY_BRAIN_DIR, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (!existsSync(transcriptPath)) continue;
        const mtime = statSync(transcriptPath).mtimeMs;
        if (mtime < spawnedAt - 1000) continue; // only files touched during/after spawn
        if (!latest || mtime > latest.mtime) latest = { path: transcriptPath, mtime };
      }
    } catch {
      return;
    }
    if (!latest) return;

    let content: string;
    try {
      content = readFileSync(latest.path, 'utf8');
    } catch {
      return;
    }

    const lines = content.split('\n');
    // Replay entries written after our spawn. We approximate by walking the
    // file backwards and stopping at the first USER_INPUT step before our
    // spawn timestamp — everything after is "our turn".
    const ourEntries: AgyTranscriptEntry[] = [];
    const cutoff = new Date(spawnedAt).toISOString();
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      let entry: AgyTranscriptEntry;
      try {
        entry = JSON.parse(line) as AgyTranscriptEntry;
      } catch {
        continue;
      }
      if (entry.created_at && entry.created_at >= cutoff) {
        ourEntries.push(entry);
      }
    }

    for (const entry of ourEntries) {
      if (entry.source === 'MODEL' && entry.type === 'PLANNER_RESPONSE') {
        if (entry.thinking && entry.thinking.trim().length > 0) {
          this.emitEntry(processId, EntryNormalizer.thinking(processId, entry.thinking.trim()));
        }
        if (entry.tool_calls && entry.tool_calls.length > 0) {
          for (const call of entry.tool_calls) {
            const name = call.name ?? 'unknown';
            const input = call.args ?? {};
            this.emitEntry(
              processId,
              EntryNormalizer.toolUse(processId, name, input, 'running'),
            );
          }
        }
        continue;
      }

      if (entry.source === 'MODEL' && TOOL_RESULT_TYPES.has(entry.type)) {
        // Result of a previously-emitted tool_use. We don't have a stable
        // mapping from this entry to the originating call_id, so we emit it
        // as a generic tool result placeholder.
        const result = entry.content ?? '';
        const status: 'completed' | 'failed' = entry.status === 'ERROR' ? 'failed' : 'completed';
        this.emitEntry(
          processId,
          EntryNormalizer.toolUse(processId, entry.type.toLowerCase(), {}, status, result.slice(0, 4000)),
        );
        continue;
      }

      if (entry.source === 'SYSTEM' && entry.type === 'ERROR_MESSAGE') {
        const msg = entry.error ?? entry.content ?? 'Unknown agy error';
        this.emitEntry(processId, EntryNormalizer.error(processId, msg, 'agy_transcript_error'));
      }
    }

    // Emit a final consolidated assistant_message so resume / history captures
    // the full reply as one unit, not just per-line partials.
    const buffered = this.textBuffers.get(processId);
    if (buffered && buffered.trim().length > 0) {
      this.emitEntry(processId, EntryNormalizer.assistantMessage(processId, buffered.trim(), false));
    }

    // Record the conversation id so a follow-up `maestro delegate --resume`
    // can pass it via --conversation.
    try {
      if (existsSync(AGY_HISTORY_FILE)) {
        const histLines = readFileSync(AGY_HISTORY_FILE, 'utf8').trim().split('\n').reverse();
        for (const line of histLines) {
          if (line.trim().length === 0) continue;
          const rec = JSON.parse(line) as { conversationId?: string; timestamp?: number };
          if (rec.conversationId && (rec.timestamp ?? 0) >= spawnedAt - 5000) {
            this.emitEntry(
              processId,
              EntryNormalizer.statusChange(processId, 'running', `agy.conversationId=${rec.conversationId}`),
            );
            break;
          }
        }
      }
    } catch {
      // best-effort only
    }
  }

  // --- Helpers -------------------------------------------------------------

  private setupProcessListeners(child: ChildProcess, processId: string): void {
    child.on('exit', (code: number | null, signal: string | null) => {
      const reason = signal ? `Terminated by signal: ${signal}` : `Exited with code: ${code ?? 'unknown'}`;
      this.emitStopped(processId, reason);
    });

    child.on('close', (code: number | null, signal: string | null) => {
      const reason = signal ? `Terminated by signal: ${signal}` : `Exited with code: ${code ?? 'unknown'}`;
      this.emitStopped(processId, reason);
    });

    child.on('error', (err: Error) => {
      this.emitEntry(processId, EntryNormalizer.error(processId, err.message, 'spawn_error'));
      const proc = this.getProcess(processId);
      if (proc) proc.status = 'error';
    });
  }

  private emitStopped(processId: string, reason: string): void {
    if (this.stoppedEmitted.has(processId)) return;
    this.stoppedEmitted.add(processId);

    // Enrich with transcript-derived entries BEFORE emitting the terminal
    // status change so consumers see tool history before stop.
    try {
      this.enrichFromTranscript(processId);
    } catch {
      // enrichment is best-effort and must never block the stop signal
    }

    this.emitEntry(processId, EntryNormalizer.statusChange(processId, 'stopped', reason));

    const proc = this.getProcess(processId);
    if (proc) proc.status = 'stopped';

    this.cleanup(processId);
    this.removeProcess(processId);
  }

  private cleanup(processId: string): void {
    const rl = this.readlineInterfaces.get(processId);
    if (rl) {
      rl.close();
      this.readlineInterfaces.delete(processId);
    }
    const monitor = this.streamMonitors.get(processId);
    if (monitor) {
      monitor.dispose();
      this.streamMonitors.delete(processId);
    }
    this.childProcesses.delete(processId);
    this.spawnTimestamps.delete(processId);
    this.textBuffers.delete(processId);
  }
}
