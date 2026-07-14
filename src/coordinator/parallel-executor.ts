// ---------------------------------------------------------------------------
// Parallel Executor — Bridge between GraphWalker fork/join and ParallelCliRunner.
// Wraps ParallelCliRunner.runAll() behind a GraphWalker-friendly interface.
// ---------------------------------------------------------------------------

import type { AgentType, ReasoningEffort } from './graph-types.js';
import type { ParallelCliRunner } from '../agents/parallel-cli-runner.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface BranchTask {
  branchId: string;
  nodeId: string;
  prompt: string;
  workDir: string;
  agentType: AgentType;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}

export interface BranchResult {
  branchId: string;
  success: boolean;
  output: string;
  durationMs: number;
}

export interface ParallelCommandExecutor {
  executeBranches(
    branches: BranchTask[],
    joinStrategy: 'all' | 'any' | 'majority',
    signal?: AbortSignal,
  ): Promise<BranchResult[]>;
}

// ---------------------------------------------------------------------------
// AgentType -> tool name mapping (reverse of parallel-cli-runner)
// ---------------------------------------------------------------------------

export function resolveParallelTool(agentType: AgentType): string {
  switch (agentType) {
    case 'gemini': return 'gemini';
    case 'qwen': return 'qwen';
    case 'codex': return 'codex';
    case 'grok': return 'grok';
    case 'claude':
    case 'claude-code': return 'claude';
    case 'opencode': return 'opencode';
    default:
      throw new Error(`Unknown parallel provider: ${String(agentType)}`);
  }
}

// ---------------------------------------------------------------------------
// DefaultParallelExecutor
// ---------------------------------------------------------------------------

export class DefaultParallelExecutor implements ParallelCommandExecutor {
  constructor(private readonly runner: ParallelCliRunner) {}

  async executeBranches(
    branches: BranchTask[],
    joinStrategy: 'all' | 'any' | 'majority',
    signal?: AbortSignal,
  ): Promise<BranchResult[]> {
    const tasks = branches.map((b) => ({
      id: b.branchId,
      prompt: b.prompt,
      tool: resolveParallelTool(b.agentType),
      workDir: b.workDir,
      mode: 'write' as const,
      model: b.model,
      reasoningEffort: b.reasoningEffort,
    }));

    const { results } = await this.runner.runAll(tasks, {
      joinStrategy,
      signal,
    });

    return results.map((r) => ({
      branchId: r.id,
      success: r.success,
      output: r.output,
      durationMs: r.durationMs,
    }));
  }
}
