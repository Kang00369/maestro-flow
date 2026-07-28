// ---------------------------------------------------------------------------
// `maestro delegate` — prompt-first task delegation
// ---------------------------------------------------------------------------

import { spawn, type SpawnOptions } from 'node:child_process';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Command, Option } from 'commander';
import { CliAgentRunner } from '../agents/cli-agent-runner.js';
import { CliHistoryStore, type EntryLike } from '../agents/cli-history-store.js';
import type { ExecutionMeta } from '../agents/cli-history-store.js';
import { generateCliExecId } from '../agents/cli-agent-runner.js';
import { assertDelegateEntryAllowed } from '../agents/delegate-execution-context.js';
import {
  loadCliToolsConfig,
  selectTool,
  resolveProxyEnv,
  checkProxyReachable,
  REASONING_EFFORTS,
  type ReasoningEffort,
} from '../config/cli-tools-config.js';
import { paths } from '../config/paths.js';
import { DelegateBrokerClient, MAX_DELEGATE_WAIT_TIMEOUT_MS, type JsonObject, type DelegateJobEvent, type DelegateJobRecord, type DelegateQueuedMessage } from '../async/index.js';
import { handleDelegateMessage } from '../async/delegate-control.js';
import { DelegateExecutionNotFoundError, DelegateWaitService } from '../async/delegate-wait.js';
import { requireValidDelegateExecId } from '../async/delegate-exec-id.js';
import {
  deriveExecutionStatus,
  deriveDelegateStatus,
  padRight,
  truncate,
  readExecutionEntries,
  summarizeBrokerEventCli,
} from '../utils/cli-format.js';

/** Providers that must pin model/effort on every `maestro delegate` call. */
const DELEGATE_EXPLICIT_MODEL_EFFORT_PROVIDERS = new Set([
  'codex',
  'codex-server',
  'claude',
  'claude-code',
]);

/**
 * True when Delegate must not inherit model/effort from cli-tools.json.
 * Uses `baseTool` when the selected entry is an alias of Codex or Claude.
 */
export function delegateRequiresExplicitModelEffort(
  tool: string,
  baseTool?: string,
): boolean {
  return DELEGATE_EXPLICIT_MODEL_EFFORT_PROVIDERS.has(tool)
    || (baseTool !== undefined && DELEGATE_EXPLICIT_MODEL_EFFORT_PROVIDERS.has(baseTool));
}

export interface ResolveDelegateModelEffortInput {
  tool: string;
  baseTool?: string;
  /** CLI `--model` (may be empty/whitespace). */
  modelOverride?: string;
  /** CLI `--effort` (may be empty/whitespace). */
  effortOverride?: string;
  /** Selected tool's configured primaryModel (used only when not fail-closed). */
  configuredModel: string;
  /** Selected tool's configured reasoningEffort (used only when not fail-closed). */
  configuredEffort?: ReasoningEffort;
}

export interface ResolveDelegateModelEffortResult {
  model: string;
  reasoningEffort?: ReasoningEffort;
}

function parseDelegateEffort(raw: string): ReasoningEffort {
  if (!(REASONING_EFFORTS as readonly string[]).includes(raw)) {
    throw new Error(`Invalid effort: ${raw}. Use "low", "medium", "high", or "max".`);
  }
  return raw as ReasoningEffort;
}

/**
 * Resolve model + effort for a Delegate call.
 *
 * Codex/Claude (and their aliases via baseTool) require explicit non-empty
 * `--model` and `--effort` and never fall back to cli-tools.json defaults.
 * Other providers keep configured defaults when flags are omitted.
 * Throws before any exec id / history / process side effects should occur.
 */
export function resolveDelegateModelAndEffort(
  input: ResolveDelegateModelEffortInput,
): ResolveDelegateModelEffortResult {
  const requiresExplicit = delegateRequiresExplicitModelEffort(input.tool, input.baseTool);
  const modelOverride = input.modelOverride?.trim();
  const effortOverride = input.effortOverride?.trim();

  if (requiresExplicit) {
    if (!modelOverride) {
      throw new Error(
        `Error: --model is required for delegate --to ${input.tool}. ` +
        'Codex and Claude do not inherit primaryModel from cli-tools.json.',
      );
    }
    if (!effortOverride) {
      throw new Error(
        `Error: --effort is required for delegate --to ${input.tool}. ` +
        'Codex and Claude do not inherit reasoningEffort from cli-tools.json.',
      );
    }
    return {
      model: modelOverride,
      reasoningEffort: parseDelegateEffort(effortOverride),
    };
  }

  const model = modelOverride || input.configuredModel;
  if (effortOverride) {
    return {
      model,
      reasoningEffort: parseDelegateEffort(effortOverride),
    };
  }
  return {
    model,
    reasoningEffort: input.configuredEffort,
  };
}

let delegateWaitServiceForTests: DelegateWaitService | null = null;

export function __setDelegateWaitServiceForTests(service: DelegateWaitService | null): void {
  delegateWaitServiceForTests = service;
}

function statusLabel(meta: ExecutionMeta): string {
  const s = deriveExecutionStatus(meta);
  return s === 'completed' ? 'done' : s === 'unknown' ? `exit:${meta.exitCode ?? '?'}` : s;
}

function summarizeHistoryEntry(entry: EntryLike): string {
  switch (entry.type) {
    case 'assistant_message':
      return `assistant: ${truncate(String(entry.content ?? ''), 120)}`;
    case 'tool_use':
      return `tool ${String(entry.name ?? '?')}: ${String(entry.status ?? 'unknown')}`;
    case 'error':
      return `error: ${String(entry.message ?? '')}`;
    case 'status_change':
      return `status: ${String(entry.status ?? '')}`;
    default:
      return `${entry.type}`;
  }
}

export interface DelegateExecutionRequest {
  prompt: string;
  tool: string;
  mode: 'analysis' | 'write';
  model?: string;
  workDir: string;
  rule?: string;
  execId: string;
  resume?: string;
  includeDirs?: string[];
  sessionId?: string;
  backend: 'direct' | 'terminal';
  settingsFile?: string;
  baseTool?: string;
  /** Delegate role for spec category mapping */
  role?: string;
  /** Reasoning effort level */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  /** Stale-stream silence window (ms) before force-terminating a silent CLI */
  streamTimeout?: number;
  /** Proxy environment variables resolved from cli-tools.json proxy config */
  proxyEnv?: Record<string, string>;
}

interface ChildProcessLike {
  pid?: number;
  unref(): void;
}

interface SpawnLike {
  (command: string, args: readonly string[], options: SpawnOptions): ChildProcessLike;
}

export interface LaunchDetachedDelegateOptions {
  historyStore?: CliHistoryStore;
  brokerClient?: DelegateBrokerClient;
  spawnProcess?: SpawnLike;
  entryScript?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
}

function createRunningMeta(request: DelegateExecutionRequest, startedAt: string): ExecutionMeta {
  return {
    execId: request.execId,
    tool: request.tool,
    model: request.model,
    mode: request.mode,
    prompt: request.prompt.substring(0, 500),
    workDir: request.workDir,
    startedAt,
  };
}

function saveFailedMeta(
  store: CliHistoryStore,
  request: DelegateExecutionRequest,
  completedAt: string,
): void {
  const existing = store.loadMeta(request.execId);
  store.saveMeta(request.execId, {
    ...(existing ?? createRunningMeta(request, completedAt)),
    completedAt,
    exitCode: 1,
  });
}

function buildJobMetadata(request: DelegateExecutionRequest, workerPid?: number): JsonObject {
  const metadata: JsonObject = {
    tool: request.tool,
    mode: request.mode,
    workDir: request.workDir,
    prompt: request.prompt.substring(0, 200),
    backend: request.backend,
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    cancelReason: null,
  };
  if (request.model) {
    metadata.model = request.model;
  }
  if (request.rule) {
    metadata.rule = request.rule;
  }
  if (request.sessionId) {
    metadata.sessionId = request.sessionId;
  }
  if (workerPid !== undefined) {
    metadata.workerPid = workerPid;
  }
  return metadata;
}

export function buildDetachedDelegateWorkerArgs(
  request: DelegateExecutionRequest,
  entryScript = process.argv[1],
): string[] {
  if (!entryScript) {
    throw new Error('Cannot determine maestro entry script for detached delegate worker.');
  }

  const args = [entryScript, 'delegate', request.prompt, '--worker', '--to', request.tool, '--mode', request.mode, '--cd', request.workDir, '--id', request.execId, '--backend', request.backend];

  if (request.model) {
    args.push('--model', request.model);
  }
  if (request.rule) {
    args.push('--rule', request.rule);
  }
  if (request.resume) {
    args.push('--resume', request.resume);
  }
  if (request.includeDirs && request.includeDirs.length > 0) {
    args.push('--includeDirs', request.includeDirs.join(','));
  }
  if (request.sessionId) {
    args.push('--session', request.sessionId);
  }
  if (request.reasoningEffort) {
    args.push('--effort', request.reasoningEffort);
  }
  if (request.streamTimeout) {
    args.push('--timeout', String(request.streamTimeout));
  }

  return args;
}

export function launchDetachedDelegateWorker(
  request: DelegateExecutionRequest,
  options: LaunchDetachedDelegateOptions = {},
): void {
  const store = options.historyStore ?? new CliHistoryStore();
  const broker = options.brokerClient ?? new DelegateBrokerClient();
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  // A terminal `delegate message` relaunches the same execution ID with
  // `--resume <exec-id>`. Preserve opaque provider metadata while replacing
  // terminal timestamps, otherwise Grok's native session bridge is lost before
  // the worker gets a chance to read it.
  const previousMeta = request.resume === request.execId
    ? store.loadMeta(request.execId)
    : null;
  const runningMeta = {
    ...createRunningMeta(request, startedAt),
    ...(previousMeta?.providerSessionId
      ? { providerSessionId: previousMeta.providerSessionId }
      : {}),
  };
  store.saveMeta(request.execId, runningMeta);

  try {
    const args = buildDetachedDelegateWorkerArgs(request, options.entryScript);
    const spawnProcess = options.spawnProcess ?? spawn;
    const env = {
      ...(options.env ?? process.env),
      MAESTRO_DISABLE_DASHBOARD_BRIDGE: '1',
    };
    const child = spawnProcess(process.execPath, args, {
      cwd: request.workDir,
      detached: true,
      stdio: 'ignore',
      env,
    });
    try {
      broker.publishEvent({
        jobId: request.execId,
        type: 'queued',
        status: 'queued',
        payload: { summary: `${request.tool}/${request.mode} queued` },
        jobMetadata: buildJobMetadata(request, child.pid),
        now: startedAt,
      });
    } catch {
      // Broker initialization is best-effort for detached launch.
    }
    child.unref();
  } catch (error) {
    saveFailedMeta(store, request, now());
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface RelayRecord {
  sessionId?: string;
  pid?: number;
  ownerPid?: number;
  ssePort?: string;
  startedAt?: string;
}

/**
 * Scan the async dir and return live relay records.
 *
 * "Live" requires BOTH:
 *  - `pid` (the MCP server process) is alive
 *  - `ownerPid` (the Claude Code process that spawned it) is alive, when recorded
 *
 * The `ownerPid` check rejects zombie MCP servers whose parent Claude Code
 * exited but whose node process never shut down. Older relay files without
 * `ownerPid` fall back to pid-only liveness (backward compatible).
 *
 * Stale files (dead pid OR dead ownerPid) are unlinked as a side effect.
 */
export function readLiveRelayRecords(asyncDir: string): RelayRecord[] {
  let files: string[];
  try {
    files = readdirSync(asyncDir).filter(
      (f) => f.startsWith('relay-session-') && f.endsWith('.id'),
    );
  } catch {
    return [];
  }

  const live: RelayRecord[] = [];
  for (const file of files) {
    const filePath = join(asyncDir, file);
    let data: RelayRecord;
    try {
      data = JSON.parse(readFileSync(filePath, 'utf-8')) as RelayRecord;
    } catch {
      continue;
    }

    const pidAlive = !data.pid || isProcessAlive(data.pid);
    const ownerAlive = !data.ownerPid || isProcessAlive(data.ownerPid);
    if (!pidAlive || !ownerAlive) {
      try { unlinkSync(filePath); } catch { /* ignore */ }
      continue;
    }
    live.push(data);
  }
  return live;
}

/**
 * Resolve the relay session ID that matches the current Claude Code session.
 *
 * When CLAUDE_CODE_SSE_PORT is available, derives the session ID directly
 * from the port number — this is deterministic and avoids stale relay file
 * issues caused by PID reuse on Windows.
 *
 * Falls back to file-based matching for non-Claude-Code contexts.
 */
function resolveRelaySessionId(): string | undefined {
  const currentSsePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (currentSsePort) {
    return `maestro-mcp-relay-port-${currentSsePort}`;
  }

  // Fallback: find newest live relay session from files
  const records = readLiveRelayRecords(join(paths.data, 'async'));
  if (records.length === 0) return undefined;

  let newest: RelayRecord | undefined;
  for (const record of records) {
    if (!newest || (record.startedAt ?? '') > (newest.startedAt ?? '')) {
      newest = record;
    }
  }
  return newest?.sessionId;
}

/** Check if the MCP notification channel is functional for the current session. */
export function isChannelAvailable(): boolean {
  if (process.env.CLAUDECODE !== '1') return false;
  const currentSsePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (!currentSsePort) return false;

  const records = readLiveRelayRecords(join(paths.data, 'async'));
  return records.some((r) => r.ssePort === currentSsePort);
}

export function registerDelegateCommand(program: Command): void {
  const delegate = program
    .command('delegate [prompt]')
    .description('Delegate a prompt to a CLI agent tool');

  // ---- Main action ---------------------------------------------------------

  delegate
    .option('--to <tool>', 'CLI tool to delegate to (gemini, qwen, codex, claude, grok, opencode)')
    .option('--role <role>', 'Capability role for targeted spec injection (does not select a tool)')
    .option('--mode <mode>', 'Execution mode (analysis or write)', 'analysis')
    .option('--model <model>', 'Model selection (required for Codex/Claude Delegate)')
    .option('--cd <dir>', 'Working directory')
    .option('--rule <template>', 'Template name — auto-loads protocol + template')
    .option('--id <id>', 'Execution ID (auto-generated if omitted)')
    .option('--resume [id]', 'Resume previous session (last if no id)')
    .option('--includeDirs <dirs>', 'Additional directories (comma-separated)')
    .option('--session <id>', 'Claude Code session ID for completion notifications')
    .option('--backend <type>', 'Adapter backend: direct only (terminal is unsupported for Delegate)')
    .option('--effort <level>', 'Reasoning effort (low, medium, high, max; required for Codex/Claude Delegate)')
    .option('--timeout <ms>', 'Stale-stream timeout in ms — force-terminate CLI after this much silence (default 600000 = 10 min); overrides tool config')
    .option('--async', 'Run detached in the background; results delivered via MCP channel notifications (default: synchronous)')
    .addOption(new Option('--worker').hideHelp())
    .action(async (prompt: string | undefined, opts: {
      to?: string;
      role?: string;
      mode: string;
      model?: string;
      cd?: string;
      rule?: string;
      id?: string;
      resume?: string | true;
      includeDirs?: string;
      session?: string;
      backend?: string;
      effort?: string;
      timeout?: string;
      async?: boolean;
      worker?: boolean;
    }) => {
      try {
        assertDelegateEntryAllowed();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exitCode = 1;
        return;
      }

      if (!prompt) {
        console.error('error: prompt is required. Usage: maestro delegate "your prompt"');
        process.exit(1);
      }

      if (opts.backend !== undefined && opts.backend !== 'direct' && opts.backend !== 'terminal') {
        console.error(`Invalid backend: ${opts.backend}. Use "direct".`);
        process.exitCode = 1;
        return;
      }
      if (opts.backend === 'terminal') {
        console.error(
          'Error: Delegate terminal backend is unsupported because the recursion guard context ' +
          'cannot be propagated safely into terminal multiplexer panes. Use --backend direct.',
        );
        process.exitCode = 1;
        return;
      }

      const workDir = resolve(opts.cd ?? process.cwd());
      const config = await loadCliToolsConfig(workDir);

      // Validate config: tools must be a non-empty object
      if (!config.tools || Object.keys(config.tools).length === 0) {
        console.error(
          'Error: cli-tools.json is missing or has no "tools" configured.\n' +
          'Run "maestro config delegate reset" to regenerate with auto-detected tools.',
        );
        process.exit(1);
      }

      if (!opts.to) {
        console.error(
          'Error: delegate agent is required. Pass --to <tool>; ' +
          '--role no longer selects Codex, Claude, or a fallback tool.',
        );
        process.exit(1);
      }

      const selected = selectTool(opts.to, config);
      if (!selected) {
        const tools = config.tools ?? {};
        const exists = opts.to in tools;
        const available = Object.entries(tools)
          .filter(([, e]) => e.enabled)
          .map(([n]) => n);
        if (exists) {
          console.error(
            `Error: delegate agent "${opts.to}" is disabled.\n` +
            `Enable it in cli-tools.json or explicitly choose one of: ${available.join(', ') || '(none)'}`,
          );
        } else {
          console.error(
            `Error: delegate agent "${opts.to}" is not configured.\n` +
            `Enabled agents: ${available.join(', ') || '(none)'}`,
          );
        }
        process.exit(1);
      }

      const toolName = selected.name;
      const mode = opts.mode as 'analysis' | 'write';

      if (mode !== 'analysis' && mode !== 'write') {
        console.error(`Invalid mode: ${opts.mode}. Use "analysis" or "write".`);
        process.exit(1);
      }

      // Fail-closed model/effort for Codex/Claude before exec id / history / process.
      // Other providers (and maestro cli) keep configured defaults.
      let model: string;
      let reasoningEffort: ReasoningEffort | undefined;
      try {
        const resolved = resolveDelegateModelAndEffort({
          tool: toolName,
          baseTool: selected.entry.baseTool,
          modelOverride: opts.model,
          effortOverride: opts.effort,
          configuredModel: selected.entry.primaryModel,
          configuredEffort: selected.entry.reasoningEffort,
        });
        model = resolved.model;
        reasoningEffort = resolved.reasoningEffort;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      // Resolve stale-stream timeout: CLI --timeout overrides cli-tools.json
      let streamTimeout: number | undefined;
      if (opts.timeout !== undefined) {
        const parsed = Number(opts.timeout);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          console.error(`Invalid timeout: ${opts.timeout}. Use a positive number of milliseconds.`);
          process.exit(1);
        }
        streamTimeout = parsed;
      } else {
        streamTimeout = selected.entry.streamTimeoutMs;
      }

      const backend = 'direct' as const;
      const execId = opts.id ?? generateCliExecId(toolName);
      const resume = opts.resume === true ? 'last' : opts.resume;
      const includeDirs = opts.includeDirs?.split(',').map(d => d.trim()).filter(Boolean);
      let proxyEnv = resolveProxyEnv(config, toolName);
      if (Object.keys(proxyEnv).length > 0) {
        const proxyUrl = proxyEnv.HTTP_PROXY || proxyEnv.HTTPS_PROXY;
        if (proxyUrl) {
          const reachable = await checkProxyReachable(proxyUrl);
          if (!reachable) {
            process.stderr.write(
              `Warning: proxy ${proxyUrl} is unreachable, proceeding without proxy.\n`,
            );
            proxyEnv = {};
          }
        }
      }
      const request: DelegateExecutionRequest = {
        prompt,
        tool: toolName,
        mode,
        model,
        workDir,
        rule: opts.rule,
        execId,
        resume,
        includeDirs,
        sessionId: opts.session ?? resolveRelaySessionId(),
        backend,
        settingsFile: selected.entry.settingsFile,
        baseTool: selected.entry.baseTool,
        role: opts.role,
        reasoningEffort,
        streamTimeout,
        proxyEnv,
      };

      try {
        // Default = sync. Async only when --async is explicitly passed.
        // Channel auto-detection is unreliable: CC's --channels mode is not
        // observable from the MCP server side (verified via clientCapabilities
        // diff — both modes announce identical capabilities).
        const useAsync = !opts.worker && opts.async === true;
        if (useAsync) {
          process.stderr.write(`[MAESTRO_EXEC_ID=${execId}]\n`);
          launchDetachedDelegateWorker(request);
          console.log(`Started async delegate: ${execId}`);
          console.log(`Use \`maestro delegate wait ${execId}\` once when the result is needed.`);
          return;
        }

        const runner = new CliAgentRunner();
        const syncMode = !opts.worker;

        // Sync mode: emit exec ID + ONE broker event at start so any active
        // channel subscriber sees a "started" notification. Output and status
        // summary are auto-appended on completion — callers don't need separate
        // `delegate output` or `delegate status` commands.
        if (syncMode) {
          process.stderr.write(`[MAESTRO_EXEC_ID=${execId}]\n`);
          try {
            const broker = new DelegateBrokerClient();
            broker.publishEvent({
              jobId: execId,
              type: 'status_update',
              status: 'running',
              payload: { summary: `${toolName}/${mode} started (sync)` },
              jobMetadata: {
                tool: toolName,
                mode,
                workDir,
                backend,
                ...(request.sessionId ? { sessionId: request.sessionId } : {}),
              },
            });
          } catch {
            // Broker publish is best-effort; sync execution must continue.
          }
        }

        const exitCode = await runner.run({
          ...request,
          sync: syncMode,
          delegateExecutionContext: execId,
        });

        // In sync mode, auto-append status summary + output so callers get
        // everything in a single background callback — no manual `output`/`status`.
        if (syncMode) {
          const store = new CliHistoryStore();
          const finalStatus = exitCode === 130 ? 'cancelled' : exitCode === 0 ? 'completed' : 'failed';
          const finalMeta = store.loadMeta(execId);

          // Status summary line
          process.stderr.write(`\n[DELEGATE ${finalStatus.toUpperCase()}] ${execId} ${toolName}/${mode}\n`);

          // Output
          const output = store.getOutput(execId, { lastReply: true });
          if (output) {
            process.stderr.write('--- Output ---\n');
            process.stdout.write(output);
            if (!output.endsWith('\n')) process.stdout.write('\n');
          }

          // Publish final broker event so `delegate status` reflects completion.
          // The runner skips broker events in sync mode, so we emit it here.
          try {
            const broker = new DelegateBrokerClient();
            broker.publishEvent({
              jobId: execId,
              type: finalStatus,
              status: finalStatus,
              payload: {
                summary: `${toolName}/${mode} ${finalStatus}`,
                exitCode,
                completedAt: new Date().toISOString(),
              },
              jobMetadata: {
                tool: toolName,
                mode,
                workDir,
                backend,
                ...(request.sessionId ? { sessionId: request.sessionId } : {}),
                ...(finalMeta?.providerSessionId
                  ? { providerSessionId: finalMeta.providerSessionId }
                  : {}),
              },
            });
          } catch {
            // Best-effort; sync execution already succeeded.
          }
        }

        process.exit(exitCode);
      } catch (err) {
        saveFailedMeta(new CliHistoryStore(), request, new Date().toISOString());
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Delegate failed: ${message}`);
        process.exit(1);
      }
    });

  // ---- show subcommand -----------------------------------------------------

  delegate
    .command('show')
    .description('List recent delegated executions')
    .option('--all', 'Include full history')
    .action((opts: { all?: boolean }) => {
      const store = new CliHistoryStore();
      const limit = opts.all ? 100 : 20;
      const items = store.listRecent(limit);

      if (items.length === 0) {
        console.log('No recent executions.');
        return;
      }

      const colId = 24;
      const colTool = 10;
      const colMode = 10;
      const colStatus = 10;
      const colPrompt = 50;

      const header = [
        padRight('ID', colId),
        padRight('Tool', colTool),
        padRight('Mode', colMode),
        padRight('Status', colStatus),
        padRight('Prompt', colPrompt),
      ].join('  ');

      console.log(header);
      console.log('-'.repeat(header.length));

      for (const meta of items) {
        const row = [
          padRight(meta.execId, colId),
          padRight(meta.tool, colTool),
          padRight(meta.mode, colMode),
          padRight(statusLabel(meta), colStatus),
          padRight(truncate(meta.prompt, colPrompt), colPrompt),
        ].join('  ');
        console.log(row);
      }
    });

  // ---- output subcommand ---------------------------------------------------

  delegate
    .command('wait <id>')
    .description('Wait for a delegated execution to reach a terminal state')
    .option('--timeout <ms>', 'Limit this wait without cancelling the delegate')
    .action(async (id: string, opts: { timeout?: string }, command: Command) => {
      let execId: string;
      try {
        execId = requireValidDelegateExecId(id);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }
      let timeoutMs: number | undefined;
      const timeoutOption = opts.timeout ?? command.parent?.opts<{ timeout?: string }>().timeout;
      if (timeoutOption !== undefined) {
        timeoutMs = Number(timeoutOption);
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_DELEGATE_WAIT_TIMEOUT_MS) {
          console.error(`Invalid timeout: ${timeoutOption}. Use 1-${MAX_DELEGATE_WAIT_TIMEOUT_MS} milliseconds.`);
          process.exitCode = 1;
          return;
        }
      }

      try {
        const service = delegateWaitServiceForTests ?? new DelegateWaitService();
        const result = await (async () => {
          try {
            return await service.wait(execId, timeoutMs);
          } finally {
            if (!delegateWaitServiceForTests) service.close();
          }
        })();
        process.stderr.write(`[DELEGATE ${result.status.toUpperCase()}] ${execId}\n`);
        if (result.output) {
          process.stdout.write(result.output);
          if (!result.output.endsWith('\n')) process.stdout.write('\n');
        }
        process.exitCode = result.timed_out
          ? 124
          : result.status === 'completed'
            ? 0
            : result.status === 'cancelled'
              ? 130
              : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(error instanceof DelegateExecutionNotFoundError ? message : `Delegate wait failed: ${message}`);
        process.exitCode = 1;
      }
    });

  delegate
    .command('output <id>')
    .description('Get assistant output for a delegated execution')
    .option('--verbose', 'Show full metadata and raw output')
    .option('--all', 'Include thinking/reasoning entries in output')
    .option('--full', 'Return full output instead of just the last reply')
    .option('--offset <n>', 'Character offset to start from (for pagination)')
    .option('--limit <n>', 'Max characters to return (for pagination)')
    .action((id: string, opts: { verbose?: boolean; all?: boolean; full?: boolean; offset?: string; limit?: string }) => {
      const store = new CliHistoryStore();
      const meta = store.loadMeta(id);

      if (!meta) {
        console.error(`Execution not found: ${id}`);
        process.exit(1);
      }

      const offset = opts.offset ? parseInt(opts.offset, 10) : undefined;
      const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;

      if (opts.verbose) {
        console.log(`ID:     ${meta.execId}`);
        console.log(`Tool:   ${meta.tool}`);
        console.log(`Mode:   ${meta.mode}`);
        console.log(`Status: ${statusLabel(meta)}`);
        console.log(`Start:  ${meta.startedAt}`);
        if (meta.providerSessionId) {
          console.log(`Provider session: ${meta.providerSessionId}`);
        }
        if (meta.completedAt) {
          console.log(`End:    ${meta.completedAt}`);
        }
        const totalChars = store.getOutputLength(meta.execId);
        console.log(`Chars:  ${totalChars}`);
        if (offset || limit) {
          console.log(`Page:   offset=${offset ?? 0} limit=${limit ?? 'all'}`);
        }
        console.log('---');
      }

      const output = store.getOutput(id, { includeAll: opts.all, lastReply: !opts.full, offset, limit });
      if (!output) {
        const status = statusLabel(meta);
        if (status === 'running') {
          console.error(`Execution ${id} is still running — no output yet.`);
        } else {
          console.error(`No output available for: ${id}`);
          console.error(`Tip: run "maestro delegate tail ${id}" to see full event history.`);
        }
        process.exit(1);
      }

      process.stdout.write(output);
      if (!output.endsWith('\n')) process.stdout.write('\n');
    });

  delegate
    .command('status <id>')
    .description('Inspect broker + history state for a delegated execution')
    .option('--events <n>', 'Number of recent broker events to show', '5')
    .action((id: string, opts: { events?: string }) => {
      const store = new CliHistoryStore();
      const broker = new DelegateBrokerClient();
      const meta = store.loadMeta(id);
      const job = broker.getJob(id);

      if (!meta && !job) {
        console.error(`Execution not found: ${id}`);
        process.exit(1);
      }

      const eventLimit = Math.max(1, parseInt(opts.events ?? '5', 10) || 5);
      const events = broker.listJobEvents(id).slice(-eventLimit);
      const status = deriveDelegateStatus(meta, job);

      console.log(`ID:     ${id}`);
      console.log(`Status: ${status}`);
      if (meta) {
        console.log(`Tool:   ${meta.tool}`);
        console.log(`Mode:   ${meta.mode}`);
        console.log(`Start:  ${meta.startedAt}`);
        if (meta.providerSessionId) {
          console.log(`Provider session: ${meta.providerSessionId}`);
        }
        if (meta.completedAt) {
          console.log(`End:    ${meta.completedAt}`);
        }
      }
      if (job) {
        console.log(`Job:    ${job.lastEventType} @ ${job.updatedAt}`);
        if (job.metadata?.cancelRequestedAt && typeof job.metadata.cancelRequestedAt === 'string') {
          console.log(`Cancel: requested at ${job.metadata.cancelRequestedAt}`);
        }
        if (job.latestSnapshot && typeof job.latestSnapshot.outputPreview === 'string') {
          console.log(`Preview: ${job.latestSnapshot.outputPreview}`);
        }
      }
      if (events.length > 0) {
        console.log('Recent events:');
        for (const event of events) {
          console.log(`  - ${summarizeBrokerEventCli(event)}`);
        }
      }
    });

  delegate
    .command('tail <id>')
    .description('Show recent broker events and persisted history for a delegated execution')
    .option('--events <n>', 'Number of broker events to show', '10')
    .option('--history <n>', 'Number of history entries to show', '10')
    .action((id: string, opts: { events?: string; history?: string }) => {
      const store = new CliHistoryStore();
      const broker = new DelegateBrokerClient();
      const meta = store.loadMeta(id);
      const events = broker.listJobEvents(id);
      const historyEntries = readExecutionEntries(store, id);

      if (!meta && events.length === 0 && historyEntries.length === 0) {
        console.error(`Execution not found: ${id}`);
        process.exit(1);
      }

      const eventLimit = Math.max(1, parseInt(opts.events ?? '10', 10) || 10);
      const historyLimit = Math.max(1, parseInt(opts.history ?? '10', 10) || 10);
      console.log(`== Broker Events (${Math.min(eventLimit, events.length)}/${events.length}) ==`);
      for (const event of events.slice(-eventLimit)) {
        console.log(summarizeBrokerEventCli(event));
      }
      console.log('');
      console.log(`== History Tail (${Math.min(historyLimit, historyEntries.length)}/${historyEntries.length}) ==`);
      for (const entry of historyEntries.slice(-historyLimit)) {
        console.log(summarizeHistoryEntry(entry));
      }
    });

  delegate
    .command('cancel <id>')
    .description('Request cancellation for an async delegated execution')
    .action((id: string) => {
      const store = new CliHistoryStore();
      const broker = new DelegateBrokerClient();
      const meta = store.loadMeta(id);
      const job = broker.getJob(id);

      if (!meta && !job) {
        console.error(`Execution not found: ${id}`);
        process.exit(1);
      }

      const currentStatus = deriveDelegateStatus(meta, job);
      if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
        console.log(`Delegate ${id} is already ${currentStatus}.`);
        return;
      }

      const updated = broker.requestCancel({
        jobId: id,
        requestedBy: 'cli:delegate:cancel',
      });
      console.log(`Cancellation requested for ${id}.`);
      console.log(`Current status: ${deriveDelegateStatus(meta, updated)}`);
      console.log('Use `maestro delegate status <id>` or `maestro delegate tail <id>` to follow progress.');
    });

  // ---- message subcommand --------------------------------------------------

  delegate
    .command('message <id> <text>')
    .description('Send a follow-up message to a running or completed delegate')
    .option('--delivery <mode>', 'Delivery mode: inject or after_complete', 'inject')
    .action((id: string, text: string, opts: { delivery?: string }) => {
      const delivery = opts.delivery ?? 'inject';
      if (delivery !== 'inject' && delivery !== 'after_complete') {
        console.error(`Invalid delivery mode: ${delivery}. Use "inject" or "after_complete".`);
        process.exit(1);
      }

      let result;
      try {
        result = handleDelegateMessage({
          execId: id,
          message: text,
          delivery: delivery as 'inject' | 'after_complete',
          requestedBy: 'cli:delegate:message',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed: ${message}`);
        process.exit(1);
      }

      console.log(`Message accepted for ${result.execId}`);
      console.log(`Delivery:  ${result.delivery}`);
      console.log(`Status:    ${result.status}`);
      if (result.immediateDispatch) {
        console.log(`Dispatch:  immediate (previous status: ${result.previousStatus})`);
      } else {
        console.log(`Queue:     ${result.queueDepth} message(s) pending`);
      }
    });

  // ---- messages subcommand -------------------------------------------------

  delegate
    .command('messages <id>')
    .description('List queued and dispatched follow-up messages for a delegate')
    .action((id: string) => {
      const store = new CliHistoryStore();
      const broker = new DelegateBrokerClient();
      const meta = store.loadMeta(id);
      const job = broker.getJob(id);

      if (!meta && !job) {
        console.error(`Execution not found: ${id}`);
        process.exit(1);
      }

      const messages = broker.listMessages(id);
      if (messages.length === 0) {
        console.log(`No messages for ${id}.`);
        return;
      }

      const colId = 12;
      const colDelivery = 16;
      const colStatus = 12;
      const colMessage = 60;

      const header = [
        padRight('MessageID', colId),
        padRight('Delivery', colDelivery),
        padRight('Status', colStatus),
        padRight('Message', colMessage),
      ].join('  ');

      console.log(header);
      console.log('-'.repeat(header.length));

      for (const msg of messages) {
        const row = [
          padRight(msg.messageId.slice(0, colId), colId),
          padRight(msg.delivery, colDelivery),
          padRight(msg.status, colStatus),
          padRight(truncate(msg.message, colMessage), colMessage),
        ].join('  ');
        console.log(row);
      }
    });
}
