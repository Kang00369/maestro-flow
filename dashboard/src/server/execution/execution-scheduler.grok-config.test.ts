import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentConfig } from '../../shared/agent-types.js';
import type { Issue } from '../../shared/issue-types.js';
import { DashboardEventBus } from '../state/event-bus.js';
import { ExecutionScheduler } from './execution-scheduler.js';

describe('ExecutionScheduler Grok config', () => {
  let projectRoot: string;
  let workflowRoot: string;
  let jsonlPath: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'maestro-scheduler-grok-'));
    workflowRoot = join(projectRoot, '.workflow');
    jsonlPath = join(workflowRoot, 'issues', 'issues.jsonl');
    mkdirSync(join(workflowRoot, 'issues'), { recursive: true });
    writeFileSync(join(workflowRoot, 'config.json'), JSON.stringify({
      settings: {
        agents: {
          grok: {
            model: 'grok-4.5',
            reasoningEffort: 'high',
            approvalMode: 'suggest',
          },
        },
      },
    }));
    const issue: Issue = {
      id: 'ISS-GROK',
      title: 'Verify Grok scheduler config',
      description: 'Use configured Grok values for a write execution.',
      type: 'task',
      priority: 'high',
      status: 'open',
      created_at: '2026-07-14T00:00:00.000Z',
      updated_at: '2026-07-14T00:00:00.000Z',
    };
    writeFileSync(jsonlPath, `${JSON.stringify(issue)}\n`);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('uses configured Grok model/effort with explicit auto workspace write semantics', async () => {
    const spawn = vi.fn(async (_type: string, config: AgentConfig) => ({
      id: 'scheduler-proc',
      type: config.type,
      status: 'running' as const,
      config,
      startedAt: '2026-07-14T00:00:01.000Z',
    }));
    const eventBus = new DashboardEventBus();
    const agentManager = {
      spawn,
      stop: vi.fn(),
      getEntries: vi.fn(() => []),
    };
    const scheduler = new ExecutionScheduler(
      agentManager as never,
      eventBus,
      jsonlPath,
      { workspace: { enabled: false, useWorktree: false, autoCleanup: false, strict: false } },
      undefined,
      undefined,
      undefined,
      workflowRoot,
    );

    await scheduler.executeIssue('ISS-GROK', 'grok');

    expect(spawn).toHaveBeenCalledWith('grok', expect.objectContaining({
      type: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'auto',
    }));
  });

  it('rejects an unconfigured provider before spawning any process', async () => {
    const spawn = vi.fn();
    const eventBus = new DashboardEventBus();
    const scheduler = new ExecutionScheduler(
      {
        spawn,
        stop: vi.fn(),
        getEntries: vi.fn(() => []),
      } as never,
      eventBus,
      jsonlPath,
      { workspace: { enabled: false, useWorktree: false, autoCleanup: false, strict: false } },
      undefined,
      undefined,
      undefined,
      workflowRoot,
    );

    await expect(scheduler.executeIssue('ISS-GROK', 'qwen'))
      .rejects.toThrow(/Agent provider is not configured: qwen/);
    expect(spawn).not.toHaveBeenCalled();

    const stored = JSON.parse(readFileSync(jsonlPath, 'utf8').trim()) as Issue;
    expect(stored.execution).toMatchObject({
      status: 'failed',
      retryCount: 0,
      lastError: expect.stringContaining('Agent provider is not configured: qwen'),
    });
  });

  it('releases not-yet-dispatched batch claims after a permanent provider config error', async () => {
    const secondIssue: Issue = {
      id: 'ISS-SECOND',
      title: 'Retry after batch config failure',
      description: 'Must remain dispatchable after the preceding batch item fails.',
      type: 'task',
      priority: 'medium',
      status: 'open',
      created_at: '2026-07-14T00:00:00.000Z',
      updated_at: '2026-07-14T00:00:00.000Z',
    };
    const existingIssue = readFileSync(jsonlPath, 'utf8').trim();
    writeFileSync(jsonlPath, `${existingIssue}\n${JSON.stringify(secondIssue)}\n`);

    const spawn = vi.fn(async (_type: string, config: AgentConfig) => ({
      id: 'scheduler-proc',
      type: config.type,
      status: 'running' as const,
      config,
      startedAt: '2026-07-14T00:00:01.000Z',
    }));
    const scheduler = new ExecutionScheduler(
      {
        spawn,
        stop: vi.fn(),
        getEntries: vi.fn(() => []),
      } as never,
      new DashboardEventBus(),
      jsonlPath,
      { workspace: { enabled: false, useWorktree: false, autoCleanup: false, strict: false } },
      undefined,
      undefined,
      undefined,
      workflowRoot,
    );

    await expect(scheduler.executeBatch(['ISS-GROK', 'ISS-SECOND'], 'qwen', 2))
      .rejects.toThrow(/Agent provider is not configured: qwen/);

    await scheduler.executeIssue('ISS-SECOND', 'grok');

    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledWith('grok', expect.objectContaining({
      type: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
    }));
  });

  it('passes the same configured resolver into scheduler GraphWalker execution', async () => {
    const issue = JSON.parse(readFileSync(jsonlPath, 'utf8').trim()) as Issue;
    issue.solution = {
      steps: [],
      chain: 'test-chain',
    };
    writeFileSync(jsonlPath, `${JSON.stringify(issue)}\n`);

    const scheduler = new ExecutionScheduler(
      {
        spawn: vi.fn(),
        stop: vi.fn(),
        getEntries: vi.fn(() => []),
      } as never,
      new DashboardEventBus(),
      jsonlPath,
      { workspace: { enabled: false, useWorktree: false, autoCleanup: false, strict: false } },
      undefined,
      undefined,
      undefined,
      workflowRoot,
    );

    const create = vi.fn(async (config: {
      resolveExecutionConfig?: (request: Record<string, unknown>) => Promise<AgentConfig>;
    }) => {
      const resolved = await config.resolveExecutionConfig?.({
        provider: 'grok',
        prompt: 'chain prompt',
        workDir: projectRoot,
        mode: 'write',
        runtime: { approvalMode: 'auto' },
      });
      expect(resolved).toMatchObject({
        type: 'grok',
        model: 'grok-4.5',
        reasoningEffort: 'high',
        approvalMode: 'auto',
      });
      return {
        walker: {
          start: vi.fn(async () => ({ status: 'completed', history: [] })),
        },
      };
    });
    (scheduler as unknown as { factory: { create: typeof create } }).factory = { create };

    await scheduler.executeIssue('ISS-GROK', 'grok');

    expect(create).toHaveBeenCalledOnce();
  });

  it('does not retry a permanent provider config error from the GraphWalker path', async () => {
    const issue = JSON.parse(readFileSync(jsonlPath, 'utf8').trim()) as Issue;
    issue.solution = {
      steps: [],
      chain: 'test-chain',
    };
    writeFileSync(jsonlPath, `${JSON.stringify(issue)}\n`);

    const scheduler = new ExecutionScheduler(
      {
        spawn: vi.fn(),
        stop: vi.fn(),
        getEntries: vi.fn(() => []),
      } as never,
      new DashboardEventBus(),
      jsonlPath,
      { workspace: { enabled: false, useWorktree: false, autoCleanup: false, strict: false } },
      undefined,
      undefined,
      undefined,
      workflowRoot,
    );

    const create = vi.fn(async (config: {
      resolveExecutionConfig?: (request: Record<string, unknown>) => Promise<AgentConfig>;
    }) => {
      await config.resolveExecutionConfig?.({
        provider: 'qwen',
        prompt: 'must fail once',
        workDir: projectRoot,
        mode: 'write',
        runtime: { approvalMode: 'auto' },
      });
      throw new Error('unreachable');
    });
    (scheduler as unknown as { factory: { create: typeof create } }).factory = { create };

    await expect(scheduler.executeIssue('ISS-GROK', 'qwen'))
      .rejects.toThrow(/Agent provider is not configured: qwen/);

    const stored = JSON.parse(readFileSync(jsonlPath, 'utf8').trim()) as Issue;
    expect(stored.execution).toMatchObject({
      status: 'failed',
      retryCount: 0,
      lastError: expect.stringContaining('Agent provider is not configured: qwen'),
    });
    expect((scheduler as unknown as { retryQueue: Map<string, unknown> }).retryQueue.size).toBe(0);
    expect((scheduler as unknown as { claimed: Set<string> }).claimed.has('ISS-GROK')).toBe(false);
  });
});
