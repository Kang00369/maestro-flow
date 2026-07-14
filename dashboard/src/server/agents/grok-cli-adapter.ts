import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const GROK_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'max']);
const FORCE_KILL_DELAY_MS = 5000;

interface GrokThoughtEvent {
  type: 'thought';
  data?: string;
}

interface GrokTextEvent {
  type: 'text';
  data?: string;
}

interface GrokEndEvent {
  type: 'end';
  stopReason?: string;
  sessionId?: string;
  requestId?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface GrokErrorEvent {
  type: 'error';
  message?: string;
}

type GrokStreamEvent = GrokThoughtEvent | GrokTextEvent | GrokEndEvent | GrokErrorEvent;

type TerminalStatus = 'stopped' | 'error';

export class GrokCliAdapter extends BaseAgentAdapter {
  readonly agentType = 'grok' as const;

  private readonly childProcesses = new Map<string, ChildProcess>();
  private readonly readlineInterfaces = new Map<string, ReadlineInterface>();
  private readonly streamMonitors = new Map<string, StreamMonitor>();
  private readonly terminalStatuses = new Map<string, TerminalStatus>();
  private readonly pendingThoughts = new Map<string, string[]>();
  private readonly pendingMessages = new Map<string, string[]>();
  private readonly promptDirectories = new Map<string, string>();
  private readonly killTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly stopRequested = new Set<string>();
  private readonly terminationWaiters = new Map<string, Set<() => void>>();
  private readonly processListenerCleanups = new Map<string, () => void>();

  protected async doSpawn(
    processId: string,
    config: AgentConfig,
  ): Promise<AgentProcess> {
    this.validateReasoningEffort(config.reasoningEffort);

    const promptDirectory = mkdtempSync(join(tmpdir(), 'maestro-grok-prompt-'));
    const promptPath = join(promptDirectory, 'prompt.txt');
    writeFileSync(promptPath, config.prompt, { encoding: 'utf8', mode: 0o600 });
    this.promptDirectories.set(processId, promptDirectory);

    const args = [
      '--prompt-file',
      promptPath,
      '--output-format',
      'streaming-json',
    ];

    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.reasoningEffort) {
      args.push('--reasoning-effort', config.reasoningEffort);
    }
    if (config.approvalMode === 'auto') {
      args.push('--permission-mode', 'bypassPermissions', '--sandbox', 'workspace');
    } else if (config.approvalMode === 'suggest') {
      args.push('--permission-mode', 'default', '--sandbox', 'read-only');
    }

    const envFromFile = config.envFile ? loadEnvFile(config.envFile) : {};
    const envOverrides: Record<string, string | undefined> = { ...envFromFile, ...config.env };
    if (config.apiKey) envOverrides.XAI_API_KEY = config.apiKey;
    const childEnv = cleanSpawnEnv(envOverrides);

    let child: ChildProcess;
    try {
      child = spawn('grok', args, {
        cwd: config.workDir,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      this.cleanup(processId);
      throw error;
    }

    if (!child.stdout || !child.stderr) {
      this.cleanup(processId);
      throw new Error('Failed to spawn Grok CLI: stdio streams not available');
    }

    let spawned = false;
    let removeStartupListeners = (): void => {};
    try {
      await new Promise<void>((resolve, reject) => {
        const onSpawn = (): void => {
          spawned = true;
          resolve();
        };
        const onError = (error: Error): void => {
          if (!spawned) reject(error);
        };
        removeStartupListeners = (): void => {
          child.off('spawn', onSpawn);
          child.off('error', onError);
        };
        child.once('spawn', onSpawn);
        // Keep an error listener installed across the spawn handshake so an
        // immediate post-spawn error cannot become an unhandled EventEmitter error.
        child.on('error', onError);
      });

      const staleTimeoutMs = config.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
      const monitor = new StreamMonitor(
        createStaleHandler({
          processId,
          child,
          timeoutMs: staleTimeoutMs,
          onStaleDetected: (message) =>
            this.emitEntry(processId, EntryNormalizer.error(processId, message, 'stream_stale')),
          isStopped: () => this.terminalStatuses.has(processId),
          emitStopped: (reason) => this.finalize(processId, 'stopped', reason),
        }),
        staleTimeoutMs,
      );
      this.streamMonitors.set(processId, monitor);

      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line: string) => {
        monitor.heartbeat();
        this.parseGrokEvent(line, processId);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text.length === 0) return;
        monitor.heartbeat();
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          try {
            const event = JSON.parse(trimmed) as GrokStreamEvent;
            if (event.type === 'error') {
              this.emitEntry(
                processId,
                EntryNormalizer.error(processId, event.message ?? trimmed, 'grok_error'),
              );
              continue;
            }
          } catch {
            // Plain stderr is a process-level error from the headless CLI.
          }
          this.emitEntry(processId, EntryNormalizer.error(processId, trimmed, 'stderr'));
        }
      });

      this.childProcesses.set(processId, child);
      this.readlineInterfaces.set(processId, rl);
      this.setupProcessListeners(child, processId);
      removeStartupListeners();

      return {
        id: processId,
        type: 'grok',
        status: 'running',
        config,
        startedAt: new Date().toISOString(),
        pid: child.pid,
        interactive: false,
      };
    } catch (error) {
      removeStartupListeners();
      this.cleanup(processId);
      throw new Error(
        `Failed to spawn Grok CLI: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  protected async doStop(processId: string): Promise<void> {
    const child = this.childProcesses.get(processId);
    if (!child) return;

    this.stopRequested.add(processId);
    const proc = this.getProcess(processId);
    if (proc) {
      proc.status = 'stopping';
      this.emitEntry(
        processId,
        EntryNormalizer.statusChange(processId, 'stopping', 'User requested stop'),
      );
    }

    const terminated = new Promise<void>((resolve) => {
      const waiters = this.terminationWaiters.get(processId) ?? new Set<() => void>();
      waiters.add(resolve);
      this.terminationWaiters.set(processId, waiters);
    });

    killProcessTree(child.pid, 'SIGTERM');
    const killTimer = setTimeout(() => {
      if (!this.terminalStatuses.has(processId)) {
        killProcessTree(child.pid, 'SIGKILL');
      }
    }, FORCE_KILL_DELAY_MS);
    this.killTimers.set(processId, killTimer);

    await terminated;
  }

  protected async doSendMessage(_processId: string, _content: string): Promise<void> {
    throw new Error('GrokCliAdapter does not support interactive messaging');
  }

  protected async doRespondApproval(_decision: ApprovalDecision): Promise<void> {
    // Headless write approval is configured through --permission-mode.
  }

  private validateReasoningEffort(effort: AgentConfig['reasoningEffort']): void {
    if (effort !== undefined && !GROK_REASONING_EFFORTS.has(effort)) {
      throw new Error(
        `Invalid Grok reasoning effort: ${String(effort)}. Expected one of: low, medium, high, max`,
      );
    }
  }

  private parseGrokEvent(line: string, processId: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0 || this.terminalStatuses.has(processId)) return;

    let event: GrokStreamEvent;
    try {
      event = JSON.parse(trimmed) as GrokStreamEvent;
    } catch {
      return;
    }
    if (!event || typeof event !== 'object' || !('type' in event)) return;

    switch (event.type) {
      case 'thought':
        if (event.data) {
          const chunks = this.pendingThoughts.get(processId) ?? [];
          chunks.push(event.data);
          this.pendingThoughts.set(processId, chunks);
        }
        break;
      case 'text':
        this.flushThinking(processId);
        if (event.data) {
          const chunks = this.pendingMessages.get(processId) ?? [];
          chunks.push(event.data);
          this.pendingMessages.set(processId, chunks);
          this.emitEntry(processId, EntryNormalizer.assistantMessage(processId, event.data, true));
        }
        break;
      case 'end':
        this.flushThinking(processId);
        this.flushPendingMessages(processId);
        if (event.usage) {
          this.emitEntry(
            processId,
            EntryNormalizer.tokenUsage(
              processId,
              event.usage.input_tokens ?? 0,
              event.usage.output_tokens ?? 0,
              event.usage.cache_read_input_tokens,
            ),
          );
        }
        this.emitEntry(
          processId,
          EntryNormalizer.statusChange(
            processId,
            'running',
            [
              event.sessionId ? `grok.sessionId=${event.sessionId}` : '',
              event.requestId ? `grok.requestId=${event.requestId}` : '',
              event.stopReason ? `grok.stopReason=${event.stopReason}` : '',
            ].filter(Boolean).join(' '),
          ),
        );
        break;
      case 'error':
        this.emitEntry(
          processId,
          EntryNormalizer.error(processId, event.message ?? 'Unknown Grok error', 'grok_error'),
        );
        break;
    }
  }

  private setupProcessListeners(child: ChildProcess, processId: string): void {
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      this.finalizeFromExit(processId, code, signal);
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      this.finalizeFromExit(processId, code, signal);
    };
    const onError = (error: Error): void => {
      this.emitEntry(processId, EntryNormalizer.error(processId, error.message, 'spawn_error'));
      this.finalize(processId, 'error', `Spawn error: ${error.message}`);
    };

    child.on('exit', onExit);
    child.on('close', onClose);
    child.on('error', onError);
    this.processListenerCleanups.set(processId, () => {
      child.off('exit', onExit);
      child.off('close', onClose);
      child.off('error', onError);
    });
  }

  private finalizeFromExit(
    processId: string,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const reason = signal
      ? `Terminated by signal: ${signal}`
      : `Exited with code: ${code ?? 'unknown'}`;
    const expectedStop = this.stopRequested.has(processId) || code === 0;
    this.finalize(processId, expectedStop ? 'stopped' : 'error', reason);
  }

  private finalize(processId: string, status: TerminalStatus, reason: string): void {
    if (this.terminalStatuses.has(processId)) return;
    this.terminalStatuses.set(processId, status);

    this.flushThinking(processId);
    this.flushPendingMessages(processId);
    this.emitEntry(processId, EntryNormalizer.statusChange(processId, status, reason));

    const proc = this.getProcess(processId);
    if (proc) proc.status = status;

    this.cleanup(processId);
    this.removeProcess(processId);
    this.resolveTermination(processId);
  }

  private flushThinking(processId: string): void {
    const chunks = this.pendingThoughts.get(processId);
    if (!chunks || chunks.length === 0) return;
    this.pendingThoughts.delete(processId);
    this.emitEntry(processId, EntryNormalizer.thinking(processId, chunks.join('')));
  }

  private flushPendingMessages(processId: string): void {
    const chunks = this.pendingMessages.get(processId);
    if (!chunks || chunks.length === 0) return;
    this.pendingMessages.delete(processId);
    this.emitEntry(
      processId,
      EntryNormalizer.assistantMessage(processId, chunks.join(''), false),
    );
  }

  private resolveTermination(processId: string): void {
    const waiters = this.terminationWaiters.get(processId);
    if (!waiters) return;
    this.terminationWaiters.delete(processId);
    for (const resolve of waiters) resolve();
  }

  private cleanup(processId: string): void {
    const killTimer = this.killTimers.get(processId);
    if (killTimer) clearTimeout(killTimer);
    this.killTimers.delete(processId);

    this.processListenerCleanups.get(processId)?.();
    this.processListenerCleanups.delete(processId);
    this.readlineInterfaces.get(processId)?.close();
    this.readlineInterfaces.delete(processId);
    this.streamMonitors.get(processId)?.dispose();
    this.streamMonitors.delete(processId);
    this.childProcesses.delete(processId);
    this.pendingThoughts.delete(processId);
    this.pendingMessages.delete(processId);
    this.stopRequested.delete(processId);

    const promptDirectory = this.promptDirectories.get(processId);
    if (promptDirectory) {
      rmSync(promptDirectory, { recursive: true, force: true });
      this.promptDirectories.delete(processId);
    }
  }
}
