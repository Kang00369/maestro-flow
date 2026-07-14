import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliRunOptions } from '../../agents/cli-agent-runner.js';
import type { CliToolsConfig, ReasoningEffort } from '../../config/cli-tools-config.js';
import { registerCliCommand } from '../cli.js';

class ExitError extends Error {
  constructor(readonly code: number) {
    super(`exit:${code}`);
  }
}

function configWithEffort(reasoningEffort: unknown): CliToolsConfig {
  return {
    version: '1.0.0',
    tools: {
      grok: {
        enabled: true,
        primaryModel: 'grok-4.5',
        tags: ['fullstack'],
        type: 'builtin',
        reasoningEffort: reasoningEffort as ReasoningEffort,
      },
    },
  };
}

async function runCli(
  args: string[],
  config: CliToolsConfig,
): Promise<{ exitCode: number; calls: CliRunOptions[] }> {
  const calls: CliRunOptions[] = [];
  const program = new Command();
  program.exitOverride();
  registerCliCommand(program, {
    loadConfig: async () => config,
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
    await program.parseAsync(['node', 'test', 'cli', '-p', 'check routing', ...args]);
    return { exitCode: 0, calls };
  } catch (error) {
    if (error instanceof ExitError) return { exitCode: error.code, calls };
    throw error;
  }
}

describe('maestro cli config routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives explicit --effort precedence over the selected provider config', async () => {
    const result = await runCli(
      ['--tool', 'grok', '--effort', 'high'],
      configWithEffort('low'),
    );

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({
      tool: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
    });
  });

  it('inherits reasoning effort from the same selected provider when omitted', async () => {
    const result = await runCli(['--tool', 'grok'], configWithEffort('medium'));

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({
      tool: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'medium',
    });
  });

  it.each([
    ['runtime override', ['--tool', 'grok', '--effort', 'extreme'], 'high'],
    ['provider config', ['--tool', 'grok'], 'extreme'],
  ] as const)('fails closed for invalid effort from %s', async (_source, args, configured) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await runCli([...args], configWithEffort(configured));

    expect(result.exitCode).toBe(1);
    expect(result.calls).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid effort: extreme'));
  });
});
