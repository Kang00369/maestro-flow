import { describe, expect, it, vi } from 'vitest';
import type { SpawnFn } from '../coordinator/cli-executor.js';
import { ParallelCliRunner } from './parallel-cli-runner.js';

function successfulSpawn() {
  return vi.fn<SpawnFn>(async () => ({
    output: 'ok',
    success: true,
    execId: 'exec-test',
    durationMs: 1,
  }));
}

describe('ParallelCliRunner provider routing', () => {
  it('propagates provider, model, and reasoning effort to every direct worker', async () => {
    const spawn = successfulSpawn();
    const runner = new ParallelCliRunner(spawn);

    await runner.runAll([
      {
        id: 'grok-worker',
        prompt: 'grok task',
        tool: 'grok',
        workDir: '/tmp/grok',
        mode: 'write',
        model: 'grok-4.5',
        reasoningEffort: 'high',
      },
      {
        id: 'codex-worker',
        prompt: 'codex task',
        tool: 'codex',
        workDir: '/tmp/codex',
        mode: 'analysis',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'max',
      },
    ], { joinStrategy: 'all', maxConcurrency: 2 });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls.map(([config]) => config)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'grok',
        model: 'grok-4.5',
        reasoningEffort: 'high',
        approvalMode: 'auto',
      }),
      expect.objectContaining({
        type: 'codex',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'max',
        approvalMode: 'suggest',
      }),
    ]));
  });

  it('maps every supported provider explicitly', async () => {
    const spawn = successfulSpawn();
    const runner = new ParallelCliRunner(spawn);
    const expected = [
      ['gemini', 'gemini'],
      ['qwen', 'qwen'],
      ['codex', 'codex'],
      ['grok', 'grok'],
      ['claude', 'claude-code'],
      ['claude-code', 'claude-code'],
      ['opencode', 'opencode'],
    ] as const;

    await runner.runAll(expected.map(([tool], index) => ({
      id: `worker-${index}`,
      prompt: tool,
      tool,
      workDir: `/tmp/${index}`,
      mode: 'analysis' as const,
    })), { joinStrategy: 'all', maxConcurrency: expected.length });

    expect(spawn.mock.calls.map(([config]) => config.type).sort())
      .toEqual(expected.map(([, agentType]) => agentType).sort());
  });

  it('rejects Grok terminal before any direct spawn or terminal adapter creation', async () => {
    const spawn = successfulSpawn();
    const terminalBackend = {} as ConstructorParameters<typeof ParallelCliRunner>[1];
    const runner = new ParallelCliRunner(spawn, terminalBackend);

    await expect(runner.runAll([{
      id: 'grok-terminal',
      prompt: 'must fail closed',
      tool: 'grok',
      workDir: '/tmp/grok',
      mode: 'write',
      backend: 'terminal',
    }], { joinStrategy: 'all' })).rejects.toThrow(/Grok terminal backend is unsupported/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider without spawning a fallback', async () => {
    const spawn = successfulSpawn();
    const runner = new ParallelCliRunner(spawn);

    await expect(runner.runAll([{
      id: 'unknown',
      prompt: 'must fail closed',
      tool: 'mystery-provider',
      workDir: '/tmp/unknown',
      mode: 'analysis',
    }], { joinStrategy: 'all' })).rejects.toThrow(/Unknown CLI provider: mystery-provider/);
    expect(spawn).not.toHaveBeenCalled();
  });
});
