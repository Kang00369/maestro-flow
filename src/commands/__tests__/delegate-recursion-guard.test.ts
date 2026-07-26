import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentConfig, NormalizedEntry } from '../../../shared/agent-types.js';
import {
  assertDelegateEntryAllowed,
  buildDelegateAgentEnv,
  MAESTRO_DELEGATE_CONTEXT_ENV,
  RecursiveDelegateError,
} from '../../agents/delegate-execution-context.js';

describe.sequential('delegate recursion guard', () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'maestro-delegate-recursion-'));
  const originalContext = process.env[MAESTRO_DELEGATE_CONTEXT_ENV];
  const originalMaestroHome = process.env.MAESTRO_HOME;
  const originalExitCode = process.exitCode;
  let CliAgentRunner: typeof import('../../agents/cli-agent-runner.js').CliAgentRunner;
  let registerDelegateCommand: typeof import('../delegate.js').registerDelegateCommand;
  let registerCliCommand: typeof import('../cli.js').registerCliCommand;
  let registerCsvWaveCommand: typeof import('../csv-wave.js').registerCsvWaveCommand;

  beforeAll(async () => {
    process.env.MAESTRO_HOME = tempHome;
    // Seed mode protocols so assemblePrompt can load them via MAESTRO_HOME.
    const protocolsDir = join(tempHome, 'templates', 'cli', 'protocols');
    mkdirSync(protocolsDir, { recursive: true });
    writeFileSync(
      join(protocolsDir, 'analysis-protocol.md'),
      '# Analysis Mode Protocol\n\n## Mode Definition\n**Mode**: `analysis` (READ-ONLY)\n',
    );
    writeFileSync(
      join(protocolsDir, 'write-protocol.md'),
      '# Write Mode Protocol\n\n## Mode Definition\n**Mode**: `write`\n',
    );
    ({ CliAgentRunner } = await import('../../agents/cli-agent-runner.js'));
    ({ registerDelegateCommand } = await import('../delegate.js'));
    ({ registerCliCommand } = await import('../cli.js'));
    ({ registerCsvWaveCommand } = await import('../csv-wave.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    if (originalContext === undefined) {
      delete process.env[MAESTRO_DELEGATE_CONTEXT_ENV];
    } else {
      process.env[MAESTRO_DELEGATE_CONTEXT_ENV] = originalContext;
    }
  });

  afterAll(() => {
    rmSync(tempHome, { recursive: true, force: true });
    if (originalMaestroHome === undefined) {
      delete process.env.MAESTRO_HOME;
    } else {
      process.env.MAESTRO_HOME = originalMaestroHome;
    }
  });

  it('allows coordinator entry and rejects a nested Delegate with its parent ID', () => {
    expect(() => assertDelegateEntryAllowed({})).not.toThrow();

    expect(() => assertDelegateEntryAllowed({
      [MAESTRO_DELEGATE_CONTEXT_ENV]: 'parent-exec-123',
    })).toThrowError(RecursiveDelegateError);

    try {
      assertDelegateEntryAllowed({
        [MAESTRO_DELEGATE_CONTEXT_ENV]: 'parent-exec-123',
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E_DELEGATE_RECURSION',
        parentExecId: 'parent-exec-123',
      });
      expect((error as Error).message).toContain('Recursive maestro delegate');
    }
  });

  it('adds an unoverrideable Delegate marker without dropping proxy variables', () => {
    expect(buildDelegateAgentEnv('parent-exec-456', {
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      [MAESTRO_DELEGATE_CONTEXT_ENV]: 'caller-overwrite-attempt',
    })).toEqual({
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      [MAESTRO_DELEGATE_CONTEXT_ENV]: 'parent-exec-456',
    });
  });

  it('stops the nested command before CliAgentRunner can create a child execution', async () => {
    process.env[MAESTRO_DELEGATE_CONTEXT_ENV] = 'parent-command-test';
    const runSpy = vi.spyOn(CliAgentRunner.prototype, 'run');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const program = new Command();
    registerDelegateCommand(program);

    await program.parseAsync([
      'node',
      'test',
      'delegate',
      'nested work',
      '--to',
      'codex',
      '--mode',
      'analysis',
    ]);

    expect(process.exitCode).toBe(1);
    expect(runSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('parent-command-test'));
  });

  it('rejects terminal Delegate before config, history, broker, or child execution', async () => {
    delete process.env[MAESTRO_DELEGATE_CONTEXT_ENV];
    const runSpy = vi.spyOn(CliAgentRunner.prototype, 'run');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const program = new Command();
    registerDelegateCommand(program);

    await program.parseAsync([
      'node',
      'test',
      'delegate',
      'terminal work',
      '--to',
      'codex',
      '--mode',
      'analysis',
      '--backend',
      'terminal',
    ]);

    expect(process.exitCode).toBe(1);
    expect(runSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recursion guard context'));
  });

  it('marks only real Delegate agent children and preserves ordinary CLI runs', async () => {
    const captured: AgentConfig[] = [];
    let processSequence = 0;
    const adapter = {
      async spawn(config: AgentConfig) {
        captured.push(config);
        processSequence += 1;
        return {
          id: `proc-${processSequence}`,
          type: config.type,
          status: 'running' as const,
          config,
          startedAt: '2026-07-14T00:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: NormalizedEntry) => void) {
        queueMicrotask(() => cb({
          id: `${processId}-stop`,
          processId,
          timestamp: '2026-07-14T00:00:01.000Z',
          type: 'status_change',
          status: 'stopped',
        }));
        return () => undefined;
      },
    };
    const runner = new CliAgentRunner({
      createAdapter: async () => adapter,
      renderEntry: () => undefined,
    });

    expect(await runner.run({
      execId: 'delegate-child',
      prompt: 'bounded task',
      tool: 'codex',
      mode: 'analysis',
      workDir: tempHome,
      sync: true,
      proxyEnv: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      delegateExecutionContext: 'delegate-child',
    })).toBe(0);

    expect(await runner.run({
      execId: 'ordinary-cli-child',
      prompt: 'ordinary cli task',
      tool: 'codex',
      mode: 'analysis',
      workDir: tempHome,
      sync: true,
    })).toBe(0);

    expect(captured[0].env).toEqual({
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      [MAESTRO_DELEGATE_CONTEXT_ENV]: 'delegate-child',
    });
    expect(captured[1].env).toBeUndefined();
  });

  it('prefixes the assembled prompt with Delegate worker identity when context is set', async () => {
    const captured: AgentConfig[] = [];
    const adapter = {
      async spawn(config: AgentConfig) {
        captured.push(config);
        return {
          id: 'proc-identity',
          type: config.type,
          status: 'running' as const,
          config,
          startedAt: '2026-07-14T00:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: NormalizedEntry) => void) {
        queueMicrotask(() => cb({
          id: `${processId}-stop`,
          processId,
          timestamp: '2026-07-14T00:00:01.000Z',
          type: 'status_change',
          status: 'stopped',
        }));
        return () => undefined;
      },
    };
    const runner = new CliAgentRunner({
      createAdapter: async () => adapter,
      renderEntry: () => undefined,
    });

    expect(await runner.run({
      execId: 'identity-child',
      prompt: 'bounded identity task',
      tool: 'codex',
      mode: 'analysis',
      workDir: tempHome,
      sync: true,
      delegateExecutionContext: 'parent-exec-identity-42',
    })).toBe(0);

    expect(captured).toHaveLength(1);
    expect(captured[0].prompt.startsWith('[DELEGATE WORKER IDENTITY]')).toBe(true);
    expect(captured[0].prompt).toContain('Parent execution: parent-exec-identity-42');
    expect(captured[0].prompt).toContain('You are a Maestro Delegate worker, not the coordinator');
    expect(captured[0].prompt).toContain('`maestro csv-wave verify` and `maestro csv-wave contract` are read-only');
    expect(captured[0].prompt).not.toContain('`maestro csv-wave`, or');
  });

  it('omits Delegate identity and keeps mode protocol first without context', async () => {
    const captured: AgentConfig[] = [];
    const adapter = {
      async spawn(config: AgentConfig) {
        captured.push(config);
        return {
          id: 'proc-ordinary',
          type: config.type,
          status: 'running' as const,
          config,
          startedAt: '2026-07-14T00:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: NormalizedEntry) => void) {
        queueMicrotask(() => cb({
          id: `${processId}-stop`,
          processId,
          timestamp: '2026-07-14T00:00:01.000Z',
          type: 'status_change',
          status: 'stopped',
        }));
        return () => undefined;
      },
    };
    const runner = new CliAgentRunner({
      createAdapter: async () => adapter,
      renderEntry: () => undefined,
    });

    expect(await runner.run({
      execId: 'ordinary-identity',
      prompt: 'ordinary identity task',
      tool: 'codex',
      mode: 'analysis',
      workDir: tempHome,
      sync: true,
    })).toBe(0);

    expect(captured).toHaveLength(1);
    expect(captured[0].prompt).not.toContain('[DELEGATE WORKER IDENTITY]');
    expect(captured[0].prompt.startsWith('# Analysis Mode Protocol')).toBe(true);
  });

  it('rejects nested maestro cli when MAESTRO_DELEGATE_CONTEXT is set', async () => {
    process.env[MAESTRO_DELEGATE_CONTEXT_ENV] = 'parent-cli-guard';
    const runSpy = vi.spyOn(CliAgentRunner.prototype, 'run');
    const loadConfig = vi.fn(async () => {
      throw new Error('config must not load under recursion guard');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const program = new Command();
    registerCliCommand(program, {
      loadConfig,
      createRunner: () => ({
        async run() {
          throw new Error('runner must not run under recursion guard');
        },
      }),
      exit(code): never {
        throw new Error(`unexpected exit:${code}`);
      },
    });

    await program.parseAsync([
      'node',
      'test',
      'cli',
      '-p',
      'nested cli work',
      '--tool',
      'codex',
      '--mode',
      'analysis',
    ]);

    expect(process.exitCode).toBe(1);
    expect(runSpy).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('parent-cli-guard'));
  });

  it('allows maestro cli when MAESTRO_DELEGATE_CONTEXT is empty', async () => {
    delete process.env[MAESTRO_DELEGATE_CONTEXT_ENV];
    const calls: unknown[] = [];
    class ExitError extends Error {
      constructor(readonly code: number) {
        super(`exit:${code}`);
      }
    }
    const program = new Command();
    registerCliCommand(program, {
      loadConfig: async () => ({
        version: '1.0.0',
        tools: {
          codex: {
            enabled: true,
            primaryModel: 'gpt-5',
            tags: ['fullstack'],
            type: 'builtin',
          },
        },
      }),
      createRunner: () => ({
        async run(options) {
          calls.push(options);
          return 0;
        },
      }),
      exit(code): never {
        throw new ExitError(code);
      },
    });

    try {
      await program.parseAsync([
        'node',
        'test',
        'cli',
        '-p',
        'ordinary cli work',
        '--tool',
        'codex',
        '--mode',
        'analysis',
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(ExitError);
      expect((error as ExitError).code).toBe(0);
    }

    expect(calls).toHaveLength(1);
  });

  it('allows read-only maestro csv-wave validation inside a Delegate worker', async () => {
    process.env[MAESTRO_DELEGATE_CONTEXT_ENV] = 'parent-csv-validation';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const program = new Command();
    registerCsvWaveCommand(program);

    await program.parseAsync([
      'node',
      'test',
      'csv-wave',
      'contract',
    ]);

    expect(process.exitCode).not.toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    expect(String(logSpy.mock.calls[0]?.[0] ?? '')).toContain('csv-wave');
  });
});
