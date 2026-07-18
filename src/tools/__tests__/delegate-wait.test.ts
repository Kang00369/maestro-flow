import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DelegateWaitService } from '../../async/delegate-wait.js';
import { __setDelegateWaitServiceForTests, handler, schema } from '../delegate-wait.js';

const terminal = (status: string, output: string, timed_out = false) => ({
  exec_id: 'job-1', status, timed_out, output, meta: null, job: null,
});

afterEach(() => __setDelegateWaitServiceForTests(null));

describe('delegate_wait MCP tool', () => {
  it('uses exec_id and timeout_ms in its schema', () => {
    expect(schema.inputSchema.required).toEqual(['exec_id']);
    expect(schema.inputSchema.properties).toHaveProperty('timeout_ms');
  });

  it('keeps the MCP call pending until a terminal event', async () => {
    let finish!: (value: ReturnType<typeof terminal>) => void;
    const waiting = new Promise<ReturnType<typeof terminal>>((resolve) => { finish = resolve; });
    __setDelegateWaitServiceForTests({ wait: () => waiting } as DelegateWaitService);
    let settled = false;
    const call = handler({ exec_id: 'job-1' }).then((result) => { settled = true; return result; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish(terminal('completed', 'done'));
    await expect(call).resolves.toMatchObject({ success: true, result: { status: 'completed' } });
  });

  it('returns failed and cancelled output as structured terminal results', async () => {
    for (const status of ['failed', 'cancelled']) {
      __setDelegateWaitServiceForTests({ wait: async () => terminal(status, `${status} output`) } as DelegateWaitService);
      await expect(handler({ exec_id: 'job-1' })).resolves.toMatchObject({
        success: true,
        result: { status, output: `${status} output`, timed_out: false },
      });
    }
  });

  it('does not mutate a running job on timeout', async () => {
    __setDelegateWaitServiceForTests({ wait: async () => terminal('running', 'partial', true) } as DelegateWaitService);
    await expect(handler({ exec_id: 'job-1', timeout_ms: 10 })).resolves.toMatchObject({
      success: true,
      result: { status: 'running', timed_out: true },
    });
  });

  it('rejects unknown executions and invalid parameters', async () => {
    expect((await handler({})).success).toBe(false);
    expect((await handler({ exec_id: '../outside' })).success).toBe(false);
    expect((await handler({ exec_id: 'job-1', timeout_ms: 0 })).success).toBe(false);
    expect((await handler({ exec_id: 'job-1', timeout_ms: 1.5 })).success).toBe(false);
    expect((await handler({ exec_id: 'job-1', timeout_ms: 2_147_483_648 })).success).toBe(false);
  });

  it('passes MCP request cancellation to the wait service', async () => {
    const wait = vi.fn(async () => terminal('completed', 'done'));
    __setDelegateWaitServiceForTests({ wait } as unknown as DelegateWaitService);
    const controller = new AbortController();
    await handler({ exec_id: 'job-1' }, controller.signal);
    expect(wait).toHaveBeenCalledWith('job-1', undefined, controller.signal);
  });
});
