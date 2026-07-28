import { describe, expect, it, vi } from 'vitest';
import {
  buildDetachedDelegateWorkerArgs,
  delegateRequiresExplicitModelEffort,
  launchDetachedDelegateWorker,
  resolveDelegateModelAndEffort,
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

describe('resolveDelegateModelAndEffort fail-closed routing', () => {
  it('requires codex and claude (including aliases) to pin model and effort', () => {
    expect(delegateRequiresExplicitModelEffort('codex')).toBe(true);
    expect(delegateRequiresExplicitModelEffort('claude')).toBe(true);
    expect(delegateRequiresExplicitModelEffort('claude-analysis', 'claude')).toBe(true);
    expect(delegateRequiresExplicitModelEffort('codex-server')).toBe(true);
    expect(delegateRequiresExplicitModelEffort('codex', 'custom-wrapper')).toBe(true);
    expect(delegateRequiresExplicitModelEffort('grok')).toBe(false);
    expect(delegateRequiresExplicitModelEffort('gemini')).toBe(false);
  });

  it('fails before execution when Codex omits --model', () => {
    expect(() =>
      resolveDelegateModelAndEffort({
        tool: 'codex',
        effortOverride: 'max',
        configuredModel: 'gpt-5.6-sol',
        configuredEffort: 'high',
      }),
    ).toThrow(/--model is required.*codex/i);
  });

  it('fails before execution when Claude omits --effort', () => {
    expect(() =>
      resolveDelegateModelAndEffort({
        tool: 'claude',
        modelOverride: 'claude-sonnet-4-6',
        configuredModel: 'claude-sonnet-4-6',
        configuredEffort: 'medium',
      }),
    ).toThrow(/--effort is required.*claude/i);
  });

  it('fails on empty/whitespace model or effort for Codex', () => {
    expect(() =>
      resolveDelegateModelAndEffort({
        tool: 'codex',
        modelOverride: '   ',
        effortOverride: 'low',
        configuredModel: 'gpt-5.6-sol',
      }),
    ).toThrow(/--model is required/i);

    expect(() =>
      resolveDelegateModelAndEffort({
        tool: 'codex',
        modelOverride: 'gpt-5.6-sol',
        effortOverride: '',
        configuredModel: 'gpt-5.6-sol',
      }),
    ).toThrow(/--effort is required/i);
  });

  it('does not fall back to configured defaults for Codex even when present', () => {
    expect(() =>
      resolveDelegateModelAndEffort({
        tool: 'codex',
        configuredModel: 'gpt-5.6-sol',
        configuredEffort: 'max',
      }),
    ).toThrow(/--model is required/i);
  });

  it('accepts explicit Codex model and effort without using config', () => {
    expect(
      resolveDelegateModelAndEffort({
        tool: 'codex',
        modelOverride: 'gpt-5.6-terra',
        effortOverride: 'medium',
        configuredModel: 'gpt-5.6-sol',
        configuredEffort: 'max',
      }),
    ).toEqual({
      model: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
    });
  });

  it('accepts explicit Claude model and effort', () => {
    expect(
      resolveDelegateModelAndEffort({
        tool: 'claude',
        modelOverride: 'claude-sonnet-4-6',
        effortOverride: 'high',
        configuredModel: 'claude-sonnet-4-6',
      }),
    ).toEqual({
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
    });
  });

  it('rejects invalid explicit effort for Codex', () => {
    expect(() =>
      resolveDelegateModelAndEffort({
        tool: 'codex',
        modelOverride: 'gpt-5.6-sol',
        effortOverride: 'extreme',
        configuredModel: 'gpt-5.6-sol',
      }),
    ).toThrow(/Invalid effort: extreme/);
  });

  it('inherits Grok model and effort from config when flags are omitted', () => {
    expect(
      resolveDelegateModelAndEffort({
        tool: 'grok',
        configuredModel: 'grok-4.5',
        configuredEffort: 'high',
      }),
    ).toEqual({
      model: 'grok-4.5',
      reasoningEffort: 'high',
    });
  });

  it('lets Grok --effort override config while keeping configured model', () => {
    expect(
      resolveDelegateModelAndEffort({
        tool: 'grok',
        effortOverride: 'medium',
        configuredModel: 'grok-4.5',
        configuredEffort: 'high',
      }),
    ).toEqual({
      model: 'grok-4.5',
      reasoningEffort: 'medium',
    });
  });

  it('lets Grok --model override config while keeping configured effort', () => {
    expect(
      resolveDelegateModelAndEffort({
        tool: 'grok',
        modelOverride: 'grok-4',
        configuredModel: 'grok-4.5',
        configuredEffort: 'high',
      }),
    ).toEqual({
      model: 'grok-4',
      reasoningEffort: 'high',
    });
  });
});
