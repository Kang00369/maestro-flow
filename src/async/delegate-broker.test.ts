import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileDelegateBroker,
  SqliteDelegateBroker,
  type DelegateBrokerApi,
  type WaitableDelegateBrokerApi,
} from './delegate-broker.js';
import { DelegateBrokerClient } from './delegate-broker-client.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'maestro-delegate-wait-'));
  tempDirs.push(dir);
  return dir;
}

function brokers(): Array<{ name: string; create: () => WaitableDelegateBrokerApi }> {
  return [
    { name: 'File', create: () => new FileDelegateBroker({ statePath: join(tempDir(), 'broker.json') }) },
    { name: 'SQLite', create: () => new SqliteDelegateBroker({ dbPath: join(tempDir(), 'broker.sqlite') }) },
  ];
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.each(brokers())('$name delegate terminal wait', ({ create }) => {
  it('returns an already-terminal job without installing a watcher', async () => {
    const broker = create();
    broker.publishEvent({ jobId: 'done', type: 'completed', status: 'completed' });
    await expect(broker.waitForTerminal({ jobId: 'done' })).resolves.toMatchObject({
      timedOut: false,
      job: { status: 'completed' },
    });
  });

  it('resolves a running job from a broker file event', async () => {
    const broker = create();
    broker.publishEvent({ jobId: 'running', type: 'status_update', status: 'running' });
    const pending = broker.waitForTerminal({ jobId: 'running', timeoutMs: 2_000 });
    broker.publishEvent({ jobId: 'running', type: 'completed', status: 'completed' });
    await expect(pending).resolves.toMatchObject({ timedOut: false, job: { status: 'completed' } });
  });

  it('returns timed_out without mutating the job', async () => {
    const broker = create();
    broker.publishEvent({ jobId: 'running', type: 'status_update', status: 'running' });
    const result = await broker.waitForTerminal({ jobId: 'running', timeoutMs: 20 });
    expect(result).toMatchObject({ timedOut: true, job: { status: 'running' } });
    expect(broker.getJob('running')?.status).toBe('running');
  });

  it('rejects timeout values that Node would clamp', async () => {
    const broker = create();
    broker.publishEvent({ jobId: 'running', type: 'status_update', status: 'running' });
    await expect(broker.waitForTerminal({
      jobId: 'running',
      timeoutMs: 2_147_483_648,
    })).rejects.toThrow('between 1 and 2147483647');
  });

  it('propagates cancellation and cleans up the pending wait', async () => {
    const broker = create();
    broker.publishEvent({ jobId: 'running', type: 'status_update', status: 'running' });
    const controller = new AbortController();
    const pending = broker.waitForTerminal({ jobId: 'running', signal: controller.signal });
    controller.abort(new Error('caller cancelled'));
    await expect(pending).rejects.toThrow('caller cancelled');
  });
});

it('rejects when the timeout settlement cannot read broker state', async () => {
  vi.useFakeTimers();
  const broker = new FileDelegateBroker({ statePath: join(tempDir(), 'broker.json') });
  broker.publishEvent({ jobId: 'running', type: 'status_update', status: 'running' });
  const originalGetJob = broker.getJob.bind(broker);
  const getJob = vi.spyOn(broker, 'getJob');
  getJob.mockImplementationOnce(originalGetJob).mockImplementationOnce(originalGetJob).mockImplementation(() => {
    throw new Error('state read failed');
  });

  const pending = broker.waitForTerminal({ jobId: 'running', timeoutMs: 10 });
  const rejected = expect(pending).rejects.toThrow('state read failed');
  try {
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});

it('observes SQLite WAL terminal events', async () => {
  const dir = tempDir();
  const waitingBroker = new SqliteDelegateBroker({ dbPath: join(dir, 'broker.sqlite') });
  const publishingBroker = new SqliteDelegateBroker({ dbPath: join(dir, 'broker.sqlite') });
  publishingBroker.publishEvent({ jobId: 'wal-job', type: 'input_required', status: 'input_required' });
  const pending = waitingBroker.waitForTerminal({ jobId: 'wal-job', timeoutMs: 2_000 });
  publishingBroker.publishEvent({ jobId: 'wal-job', type: 'failed', status: 'failed' });
  await expect(pending).resolves.toMatchObject({ timedOut: false, job: { status: 'failed' } });
});

it('preserves base broker injection for non-wait consumers', async () => {
  const baseBroker = { getJob: vi.fn(() => null) } as unknown as DelegateBrokerApi;
  const client = new DelegateBrokerClient({ broker: baseBroker });

  expect(client.getJob('job')).toBeNull();
  await expect(client.waitForTerminal({ jobId: 'job' }))
    .rejects.toThrow('does not support event-driven waits');
});
