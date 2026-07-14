import { describe, expect, it, vi } from 'vitest';
import type { ParallelCliRunner, ParallelTask } from '../../agents/parallel-cli-runner.js';
import type { AgentType } from '../graph-types.js';
import { DefaultParallelExecutor } from '../parallel-executor.js';

describe('DefaultParallelExecutor provider routing', () => {
  it('preserves branch provider, model, and reasoning effort exactly', async () => {
    const captured: ParallelTask[][] = [];
    const runner = {
      async runAll(tasks: ParallelTask[]) {
        captured.push(tasks);
        return {
          success: true,
          results: tasks.map((task) => ({
            id: task.id,
            success: true,
            output: 'ok',
            execId: `exec-${task.id}`,
            durationMs: 1,
          })),
        };
      },
    } as unknown as ParallelCliRunner;
    const executor = new DefaultParallelExecutor(runner);

    await executor.executeBranches([
      {
        branchId: 'grok',
        nodeId: 'node-grok',
        prompt: 'grok branch',
        workDir: '/tmp/grok',
        agentType: 'grok',
        model: 'grok-4.5',
        reasoningEffort: 'high',
      },
      {
        branchId: 'claude-alias',
        nodeId: 'node-claude',
        prompt: 'claude branch',
        workDir: '/tmp/claude',
        agentType: 'claude',
        model: 'claude-opus-4-1',
        reasoningEffort: 'max',
      },
    ], 'all');

    expect(captured).toEqual([[
      expect.objectContaining({
        tool: 'grok',
        model: 'grok-4.5',
        reasoningEffort: 'high',
      }),
      expect.objectContaining({
        tool: 'claude',
        model: 'claude-opus-4-1',
        reasoningEffort: 'max',
      }),
    ]]);
  });

  it('maps every supported branch provider and preserves the claude alias', async () => {
    const runAll = vi.fn(async (tasks: ParallelTask[]) => ({
      success: true,
      results: tasks.map((task) => ({
        id: task.id,
        success: true,
        output: 'ok',
        execId: task.id,
        durationMs: 1,
      })),
    }));
    const executor = new DefaultParallelExecutor({ runAll } as unknown as ParallelCliRunner);
    const agentTypes: AgentType[] = [
      'gemini', 'qwen', 'codex', 'grok', 'claude', 'claude-code', 'opencode',
    ];

    await executor.executeBranches(agentTypes.map((agentType) => ({
      branchId: agentType,
      nodeId: agentType,
      prompt: agentType,
      workDir: '/tmp/project',
      agentType,
    })), 'all');

    expect(runAll.mock.calls[0][0].map((task) => task.tool))
      .toEqual(['gemini', 'qwen', 'codex', 'grok', 'claude', 'claude', 'opencode']);
  });

  it('rejects an unmapped provider before invoking the runner', async () => {
    const runAll = vi.fn();
    const executor = new DefaultParallelExecutor({ runAll } as unknown as ParallelCliRunner);

    await expect(executor.executeBranches([{
      branchId: 'unknown',
      nodeId: 'unknown',
      prompt: 'unknown',
      workDir: '/tmp/project',
      agentType: 'mystery' as AgentType,
    }], 'all')).rejects.toThrow(/Unknown parallel provider: mystery/);
    expect(runAll).not.toHaveBeenCalled();
  });
});
