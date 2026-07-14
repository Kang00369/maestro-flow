import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
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

  beforeAll(async () => {
    process.env.MAESTRO_HOME = tempHome;
    ({ CliAgentRunner } = await import('../../agents/cli-agent-runner.js'));
    ({ registerDelegateCommand } = await import('../delegate.js'));
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
});
