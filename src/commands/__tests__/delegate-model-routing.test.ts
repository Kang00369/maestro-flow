import { describe, expect, it } from 'vitest';
import {
  buildDetachedDelegateWorkerArgs,
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
});
