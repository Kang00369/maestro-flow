import { existsSync, readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig, NormalizedEntry } from '../../shared/agent-types.js';

const spawnMock = vi.fn();
const killProcessTreeMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('./env-file-loader.js', () => ({
  loadEnvFile: vi.fn(() => ({})),
}));

vi.mock('./env-cleanup.js', () => ({
  cleanSpawnEnv: vi.fn((overrides: Record<string, string>) => ({
    ...process.env,
    ...overrides,
  })),
}));

vi.mock('./process-tree-kill.js', () => ({
  killProcessTree: (...args: unknown[]) => killProcessTreeMock(...args),
}));

import { GrokCliAdapter } from './grok-cli-adapter.js';

function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    killed: boolean;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 24680;
  child.killed = false;
  return child;
}

function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    type: 'grok',
    prompt: 'Inspect the delegate path',
    workDir: '/tmp/test',
    ...overrides,
  };
}

async function flushEvents(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function promptPathFromSpawn(): string {
  const args = spawnMock.mock.calls[0][1] as string[];
  return args[args.indexOf('--prompt-file') + 1];
}

describe('GrokCliAdapter', () => {
  let adapter: GrokCliAdapter;
  let fakeChild: ReturnType<typeof createFakeChild>;

  beforeEach(() => {
    adapter = new GrokCliAdapter();
    fakeChild = createFakeChild();
    spawnMock.mockReset();
    killProcessTreeMock.mockReset();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => fakeChild.emit('spawn'));
      return fakeChild;
    });
  });

  afterEach(() => {
    fakeChild.emit('exit', 0, null);
    vi.restoreAllMocks();
  });

  it.each(['linux', 'win32'] as const)(
    'uses direct executable+argv with shell=false on %s and leaves native subagents enabled',
    async (platform) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
      await adapter.spawn(baseConfig());

      const [command, args, options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { shell: boolean },
      ];
      const promptPath = promptPathFromSpawn();

      expect(command).toBe('grok');
      expect(options.shell).toBe(false);
      expect(args.slice(0, 4)).toEqual([
        '--prompt-file',
        promptPath,
        '--output-format',
        'streaming-json',
      ]);
      expect(args).not.toContain(['--no', 'subagents'].join('-'));
      expect(args).not.toContain('Inspect the delegate path');
      expect(readFileSync(promptPath, 'utf8')).toBe('Inspect the delegate path');
    },
  );

  it.each(['low', 'medium', 'high', 'max'] as const)(
    'forwards valid reasoning effort %s',
    async (reasoningEffort) => {
      await adapter.spawn(baseConfig({ reasoningEffort }));
      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args.slice(args.indexOf('--reasoning-effort'), args.indexOf('--reasoning-effort') + 2))
        .toEqual(['--reasoning-effort', reasoningEffort]);
    },
  );

  it('rejects invalid effort before spawning', async () => {
    const config = baseConfig({ reasoningEffort: 'extreme' as AgentConfig['reasoningEffort'] });
    await expect(adapter.spawn(config)).rejects.toThrow(/Invalid Grok reasoning effort.*extreme/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('forwards model and maps write mode to the workspace sandbox', async () => {
    await adapter.spawn(baseConfig({
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'auto',
    }));

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2))
      .toEqual(['--model', 'grok-4.5']);
    expect(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2))
      .toEqual(['--permission-mode', 'bypassPermissions']);
    expect(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2))
      .toEqual(['--sandbox', 'workspace']);
  });

  it('maps analysis mode to the read-only sandbox', async () => {
    await adapter.spawn(baseConfig({ approvalMode: 'suggest' }));

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2))
      .toEqual(['--permission-mode', 'default']);
    expect(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2))
      .toEqual(['--sandbox', 'read-only']);
  });

  it('does not register before spawn and rejects error-before-spawn without leaking the prompt', async () => {
    spawnMock.mockReturnValue(fakeChild);
    const spawnPromise = adapter.spawn(baseConfig());
    const promptPath = promptPathFromSpawn();

    expect(adapter.listProcesses()).toEqual([]);
    expect(existsSync(promptPath)).toBe(true);

    fakeChild.emit('error', new Error('ENOENT'));

    await expect(spawnPromise).rejects.toThrow(/Failed to spawn Grok CLI: ENOENT/);
    expect(adapter.listProcesses()).toEqual([]);
    expect(existsSync(promptPath)).toBe(false);
  });

  it('normalizes thoughts, final text, usage, and session metadata', async () => {
    const proc = await adapter.spawn(baseConfig());
    const entries: NormalizedEntry[] = [];
    adapter.onEntry(proc.id, (entry) => entries.push(entry));

    fakeChild.stdout.write(`${JSON.stringify({ type: 'thought', data: 'Inspecting ' })}\n`);
    fakeChild.stdout.write(`${JSON.stringify({ type: 'thought', data: 'code' })}\n`);
    fakeChild.stdout.write(`${JSON.stringify({ type: 'text', data: 'Done' })}\n`);
    fakeChild.stdout.write(`${JSON.stringify({ type: 'text', data: ' safely' })}\n`);
    fakeChild.stdout.write(`${JSON.stringify({
      type: 'end',
      stopReason: 'EndTurn',
      sessionId: 'grok-session',
      requestId: 'grok-request',
      usage: {
        input_tokens: 120,
        output_tokens: 30,
        cache_read_input_tokens: 40,
      },
    })}\n`);
    await flushEvents();

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'thinking', content: 'Inspecting code' }),
      expect.objectContaining({ type: 'assistant_message', content: 'Done', partial: true }),
      expect.objectContaining({
        type: 'assistant_message',
        content: 'Done safely',
        partial: false,
      }),
      expect.objectContaining({
        type: 'token_usage',
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 40,
      }),
      expect.objectContaining({
        type: 'status_change',
        status: 'running',
        reason: expect.stringContaining('grok.sessionId=grok-session'),
      }),
    ]));
    const assistantEntries = entries.filter((entry) => entry.type === 'assistant_message');
    expect(assistantEntries.at(-1)).toEqual(expect.objectContaining({ partial: false }));
  });

  it('keeps child exit authoritative even when stdout closes first', async () => {
    vi.useFakeTimers();
    try {
      const proc = await adapter.spawn(baseConfig());
      const entries: NormalizedEntry[] = [];
      adapter.onEntry(proc.id, (entry) => entries.push(entry));

      fakeChild.stdout.end();
      await vi.runAllTicks();
      await vi.advanceTimersByTimeAsync(600);

      expect(adapter.getProcess(proc.id)?.status).toBe('running');
      expect(entries).not.toContainEqual(expect.objectContaining({
        type: 'status_change',
        status: 'stopped',
      }));

      fakeChild.emit('exit', 2, null);
      fakeChild.emit('close', 2, null);

      const terminalEntries = entries.filter(
        (entry) => entry.type === 'status_change' && ['stopped', 'error'].includes(entry.status),
      );
      expect(terminalEntries).toEqual([
        expect.objectContaining({ status: 'error', reason: 'Exited with code: 2' }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for child termination before completing stop and emits stopped once', async () => {
    const proc = await adapter.spawn(baseConfig());
    const entries: NormalizedEntry[] = [];
    adapter.onEntry(proc.id, (entry) => entries.push(entry));

    let stopResolved = false;
    const stopPromise = adapter.stop(proc.id).then(() => {
      stopResolved = true;
    });
    await flushEvents();

    expect(stopResolved).toBe(false);
    expect(adapter.getProcess(proc.id)?.status).toBe('stopping');
    expect(entries).not.toContainEqual(expect.objectContaining({
      type: 'status_change',
      status: 'stopped',
    }));
    expect(killProcessTreeMock).toHaveBeenCalledWith(fakeChild.pid, 'SIGTERM');

    fakeChild.emit('exit', null, 'SIGTERM');
    fakeChild.emit('close', null, 'SIGTERM');
    await stopPromise;

    expect(entries.filter(
      (entry) => entry.type === 'status_change' && entry.status === 'stopped',
    )).toHaveLength(1);
  });

  it('cleans the prompt after normal exit and child error', async () => {
    await adapter.spawn(baseConfig());
    const firstPromptPath = promptPathFromSpawn();
    expect(existsSync(firstPromptPath)).toBe(true);
    fakeChild.emit('exit', 0, null);
    expect(existsSync(firstPromptPath)).toBe(false);

    adapter = new GrokCliAdapter();
    fakeChild = createFakeChild();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => fakeChild.emit('spawn'));
      return fakeChild;
    });
    const proc = await adapter.spawn(baseConfig());
    const secondPromptPath = promptPathFromSpawn();
    const entries: NormalizedEntry[] = [];
    adapter.onEntry(proc.id, (entry) => entries.push(entry));

    fakeChild.emit('error', new Error('pipe failed'));

    expect(existsSync(secondPromptPath)).toBe(false);
    expect(entries).toContainEqual(expect.objectContaining({
      type: 'status_change',
      status: 'error',
      reason: 'Spawn error: pipe failed',
    }));
  });
});
