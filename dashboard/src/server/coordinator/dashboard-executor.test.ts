import { describe, expect, it, vi } from 'vitest';
import { AgentExecutionConfigError } from '../config.js';
import { DashboardExecutor } from './dashboard-executor.js';

describe('DashboardExecutor execution config failures', () => {
  it('rethrows permanent resolver errors before spawning an agent', async () => {
    const spawn = vi.fn();
    const executor = new DashboardExecutor(
      {
        spawn,
        stop: vi.fn(),
        getEntries: vi.fn(() => []),
      } as never,
      {
        on: vi.fn(),
        off: vi.fn(),
      } as never,
      async () => {
        throw new AgentExecutionConfigError('Agent provider is not configured: qwen');
      },
    );

    await expect(executor.execute({
      prompt: 'must fail closed',
      agent_type: 'qwen',
      work_dir: '/tmp/project',
      approval_mode: 'auto',
      timeout_ms: 1000,
      node_id: 'test-node',
      cmd: 'test-command',
    })).rejects.toThrow(/Agent provider is not configured: qwen/);
    expect(spawn).not.toHaveBeenCalled();
  });
});
