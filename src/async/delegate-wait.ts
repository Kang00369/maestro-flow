import { CliHistoryStore, type ExecutionMeta } from '../agents/cli-history-store.js';
import { deriveDelegateStatus } from '../utils/cli-format.js';
import { DelegateBrokerClient } from './delegate-broker-client.js';
import type {
  DelegateJobRecord,
  WaitableDelegateBrokerApi,
} from './delegate-broker.js';
import { MAX_DELEGATE_WAIT_TIMEOUT_MS as MAX_WAIT_MS } from './delegate-broker.js';
import { requireValidDelegateExecId } from './delegate-exec-id.js';

export interface DelegateWaitServiceResult {
  exec_id: string;
  status: string;
  timed_out: boolean;
  output: string;
  meta: ExecutionMeta | null;
  job: DelegateJobRecord | null;
}

export interface DelegateWaitServiceOptions {
  historyStore?: CliHistoryStore;
  broker?: WaitableDelegateBrokerApi;
}

export class DelegateExecutionNotFoundError extends Error {}

export class DelegateWaitService {
  private readonly historyStore: CliHistoryStore;
  private readonly broker: WaitableDelegateBrokerApi;
  private readonly ownedBroker: DelegateBrokerClient | null;

  constructor(options: DelegateWaitServiceOptions = {}) {
    this.historyStore = options.historyStore ?? new CliHistoryStore();
    this.ownedBroker = options.broker ? null : new DelegateBrokerClient();
    this.broker = options.broker ?? this.ownedBroker!;
  }

  async wait(execId: string, timeoutMs?: number, signal?: AbortSignal): Promise<DelegateWaitServiceResult> {
    execId = requireValidDelegateExecId(execId);
    if (timeoutMs !== undefined && (
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_WAIT_MS
    )) {
      throw new RangeError(`Delegate wait timeout must be between 1 and ${MAX_WAIT_MS} milliseconds`);
    }
    const initialMeta = this.historyStore.loadMeta(execId);
    const initialJob = this.broker.getJob(execId);
    if (!initialMeta && !initialJob) {
      throw new DelegateExecutionNotFoundError(`Delegate execution not found: ${execId}`);
    }

    let meta = initialMeta;
    let job = initialJob;
    let timedOut = false;

    if (!isTerminal(deriveWaitStatus(meta, job))) {
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) controller.abort(signal.reason);

      const waits: Array<Promise<{ timedOut: boolean }>> = [];
      if (meta) {
        waits.push(this.historyStore.waitForTerminalMeta(execId, {
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          signal: controller.signal,
        }));
      }
      if (job) {
        waits.push(this.broker.waitForTerminal({
          jobId: execId,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          signal: controller.signal,
        }));
      }

      try {
        const waited = await Promise.race(waits);
        timedOut = waited.timedOut;
      } finally {
        controller.abort(new Error('Delegate wait source settled'));
        signal?.removeEventListener('abort', onAbort);
      }
      meta = this.historyStore.loadMeta(execId);
      job = this.broker.getJob(execId);
      if (isTerminal(deriveWaitStatus(meta, job))) timedOut = false;
    }

    meta = this.historyStore.loadMeta(execId);
    return {
      exec_id: execId,
      status: deriveWaitStatus(meta, job),
      timed_out: timedOut,
      output: this.historyStore.getOutput(execId, { lastReply: true }),
      meta,
      job,
    };
  }

  close(): void {
    this.ownedBroker?.close();
  }
}

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
    || status.startsWith('exit:');
}

function isTerminalHistory(meta: ExecutionMeta | null): boolean {
  return Boolean(meta && (meta.cancelledAt || meta.completedAt || meta.exitCode !== undefined));
}

function deriveWaitStatus(meta: ExecutionMeta | null, job: DelegateJobRecord | null): string {
  return isTerminalHistory(meta) ? deriveDelegateStatus(meta, null) : deriveDelegateStatus(meta, job);
}
