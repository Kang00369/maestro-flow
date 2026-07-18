import { describe, expect, it, vi } from 'vitest';
import {
  buildDetachedDelegateWorkerArgs,
  launchDetachedDelegateWorker,
  type DelegateExecutionRequest,
} from '../delegate.js';

function makeRequest(
  overrides: Partial<DelegateExecutionRequest> = {},
): DelegateExecutionRequest {
  return {
    prompt: 'Locate one symbol',
    tool: 'codex',
    mode: 'analysis',
    workDir: '/tmp/project',
    execId: 'cdx-test',
    backend: 'direct',
    ...overrides,
  };
}

describe('detached delegate model routing', () => {
  it('preserves explicit Codex model and effort as separate argv values', () => {
    const args = buildDetachedDelegateWorkerArgs(
      makeRequest({
        model: 'gpt-5.6-terra',
        reasoningEffort: 'medium',
      }),
      '/opt/maestro/bin.js',
    );

    expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2))
      .toEqual(['--model', 'gpt-5.6-terra']);
    expect(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2))
      .toEqual(['--effort', 'medium']);
  });

  it('does not invent model or effort flags when the caller did not set them', () => {
    const args = buildDetachedDelegateWorkerArgs(
      makeRequest(),
      '/opt/maestro/bin.js',
    );

    expect(args).not.toContain('--model');
    expect(args).not.toContain('--effort');
  });

  it('preserves explicit Grok model and effort without changing the provider', () => {
    const args = buildDetachedDelegateWorkerArgs(
      makeRequest({
        tool: 'grok',
        execId: 'grk-test',
        mode: 'write',
        model: 'grok-4.5',
        reasoningEffort: 'high',
      }),
      '/opt/maestro/bin.js',
    );

    expect(args.slice(args.indexOf('--to'), args.indexOf('--to') + 2))
      .toEqual(['--to', 'grok']);
    expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2))
      .toEqual(['--model', 'grok-4.5']);
    expect(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2))
      .toEqual(['--effort', 'high']);
  });

  it('preserves provider session metadata when relaunching the same execution', () => {
    const providerSessionId = '00000000-0000-4000-8000-000000000021';
    let savedMeta: Record<string, unknown> | undefined;
    const historyStore = {
      loadMeta: vi.fn(() => ({ providerSessionId })),
      saveMeta: vi.fn((_execId: string, meta: Record<string, unknown>) => { savedMeta = meta; }),
    } as never;
    const brokerClient = {
      publishEvent: vi.fn(),
    } as never;
    const child = { pid: 1234, unref: vi.fn() };

    launchDetachedDelegateWorker(
      makeRequest({
        tool: 'grok',
        execId: 'grk-same',
        resume: 'grk-same',
      }),
      {
        historyStore,
        brokerClient,
        entryScript: '/opt/maestro/bin.js',
        spawnProcess: vi.fn(() => child),
        env: {},
        now: () => '2026-07-19T02:00:00.000Z',
      },
    );

    expect(savedMeta).toMatchObject({ providerSessionId });
  });
});
