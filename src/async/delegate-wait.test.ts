import { describe, expect, it, vi } from 'vitest';
import type { CliHistoryStore, ExecutionMeta } from '../agents/cli-history-store.js';
import type { DelegateJobRecord, WaitableDelegateBrokerApi } from './delegate-broker.js';
import { DelegateWaitService } from './delegate-wait.js';

function meta(overrides: Partial<ExecutionMeta> = {}): ExecutionMeta {
  return {
    execId: 'exec-1',
    tool: 'codex',
    mode: 'analysis',
    prompt: 'test',
    workDir: '/tmp',
    startedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function job(status: string): DelegateJobRecord {
  return {
    jobId: 'exec-1',
    status,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    lastEventId: 1,
    lastEventType: 'status_update',
    latestSnapshot: null,
  };
}

function service(historyMeta: () => ExecutionMeta | null, brokerJob: DelegateJobRecord | null) {
  const historyStore = {
    loadMeta: vi.fn(historyMeta),
    waitForTerminalMeta: vi.fn(),
    getOutput: vi.fn(() => 'delegate output'),
  } as unknown as CliHistoryStore;
  const broker = {
    getJob: vi.fn(() => brokerJob),
    waitForTerminal: vi.fn(),
  } as unknown as WaitableDelegateBrokerApi;
  return { waitService: new DelegateWaitService({ historyStore, broker }), historyStore, broker };
}

describe('DelegateWaitService terminal history reconciliation', () => {
  it('prefers completed history over a stale running broker job', async () => {
    const { waitService, broker } = service(
      () => meta({ completedAt: '2026-07-15T00:01:00.000Z', exitCode: 0 }),
      job('running'),
    );

    await expect(waitService.wait('exec-1')).resolves.toMatchObject({
      status: 'completed',
      timed_out: false,
      output: 'delegate output',
    });
    expect(broker.waitForTerminal).not.toHaveBeenCalled();
  });

  it('returns terminal history when the broker job is missing', async () => {
    const { waitService, broker } = service(
      () => meta({ completedAt: '2026-07-15T00:01:00.000Z', exitCode: 7 }),
      null,
    );

    await expect(waitService.wait('exec-1')).resolves.toMatchObject({
      status: 'exit:7',
      timed_out: false,
      job: null,
    });
    expect(broker.waitForTerminal).not.toHaveBeenCalled();
  });

  it('resolves from terminal history when broker publication is stale', async () => {
    let currentMeta = meta();
    const historyStore = {
      loadMeta: vi.fn(() => currentMeta),
      waitForTerminalMeta: vi.fn(async () => {
        currentMeta = meta({ completedAt: '2026-07-15T00:01:00.000Z', exitCode: 0 });
        return { meta: currentMeta, timedOut: false };
      }),
      getOutput: vi.fn(() => 'delegate output'),
    } as unknown as CliHistoryStore;
    const broker = {
      getJob: vi.fn(() => job('running')),
      waitForTerminal: vi.fn(() => new Promise(() => {})),
    } as unknown as WaitableDelegateBrokerApi;
    const waitService = new DelegateWaitService({ historyStore, broker });

    await expect(waitService.wait('exec-1')).resolves.toMatchObject({
      status: 'completed',
      timed_out: false,
    });
    expect(historyStore.waitForTerminalMeta).toHaveBeenCalledWith('exec-1', {
      signal: expect.any(AbortSignal),
    });
    expect(broker.waitForTerminal).toHaveBeenCalledWith({
      jobId: 'exec-1',
      signal: expect.any(AbortSignal),
    });
  });

  it('uses a terminal broker event when history remains running', async () => {
    let currentJob = job('running');
    const { waitService, historyStore, broker } = service(() => meta(), currentJob);
    vi.mocked(broker.getJob).mockImplementation(() => currentJob);
    vi.mocked(historyStore.waitForTerminalMeta).mockImplementation(() => new Promise(() => {}));
    vi.mocked(broker.waitForTerminal).mockImplementation(async () => {
      currentJob = job('completed');
      return { job: currentJob, timedOut: false };
    });

    await expect(waitService.wait('exec-1')).resolves.toMatchObject({
      status: 'completed',
      timed_out: false,
    });
  });

  it('propagates caller cancellation to both wait sources', async () => {
    const { waitService, historyStore, broker } = service(() => meta(), job('running'));
    const controller = new AbortController();
    const waitUntilAborted = (signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    vi.mocked(historyStore.waitForTerminalMeta).mockImplementation((_execId, options) => (
      waitUntilAborted(options.signal)
    ));
    vi.mocked(broker.waitForTerminal).mockImplementation(({ signal }) => waitUntilAborted(signal));

    const pending = waitService.wait('exec-1', undefined, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    expect(vi.mocked(historyStore.waitForTerminalMeta).mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expect(broker.waitForTerminal).toHaveBeenCalledWith({
      jobId: 'exec-1',
      signal: expect.any(AbortSignal),
    });
    expect(vi.mocked(broker.waitForTerminal).mock.calls[0]?.[0].signal?.aborted).toBe(true);
  });

  it('does not let a timeout overwrite a simultaneous terminal history state', async () => {
    let currentMeta = meta();
    const { waitService, historyStore, broker } = service(() => currentMeta, job('running'));
    vi.mocked(historyStore.waitForTerminalMeta).mockImplementation(async () => {
      currentMeta = meta({ completedAt: '2026-07-15T00:01:00.000Z', exitCode: 0 });
      return { meta: currentMeta, timedOut: true };
    });
    vi.mocked(broker.waitForTerminal).mockImplementation(() => new Promise(() => {}));

    await expect(waitService.wait('exec-1', 25)).resolves.toMatchObject({
      status: 'completed',
      timed_out: false,
    });
  });

  it('rejects an oversized timeout before waiting', async () => {
    const { waitService, broker } = service(() => meta(), job('running'));
    await expect(waitService.wait('exec-1', 2_147_483_648)).rejects.toThrow('between 1 and 2147483647');
    expect(broker.waitForTerminal).not.toHaveBeenCalled();
  });

  it('rejects unsafe execution IDs before accessing history or broker paths', async () => {
    const { waitService, broker } = service(() => meta(), job('running'));
    await expect(waitService.wait('../outside')).rejects.toThrow('Invalid delegate execution ID');
    expect(broker.getJob).not.toHaveBeenCalled();
  });

  it('normalizes cli-history IDs before looking up execution state', async () => {
    const historyStore = {
      loadMeta: vi.fn(() => meta({ completedAt: '2026-07-15T00:01:00.000Z', exitCode: 0 })),
      waitForTerminalMeta: vi.fn(),
      getOutput: vi.fn(() => 'done'),
    } as unknown as CliHistoryStore;
    const broker = {
      getJob: vi.fn(() => null),
      waitForTerminal: vi.fn(),
    } as unknown as WaitableDelegateBrokerApi;
    const waitService = new DelegateWaitService({ historyStore, broker });

    await expect(waitService.wait(' cli-history-exec-1 ')).resolves.toMatchObject({
      exec_id: 'exec-1',
      status: 'completed',
    });
    expect(historyStore.loadMeta).toHaveBeenCalledWith('exec-1');
  });
});
