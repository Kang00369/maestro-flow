import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CliAgentRunner', () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'maestro-cli-runner-'));
  let CliAgentRunner: typeof import('./cli-agent-runner.js').CliAgentRunner;
  let CliHistoryStore: typeof import('./cli-history-store.js').CliHistoryStore;

  beforeAll(async () => {
    process.env.MAESTRO_HOME = tempHome;
    ({ CliAgentRunner } = await import('./cli-agent-runner.js'));
    ({ CliHistoryStore } = await import('./cli-history-store.js'));
  });

  beforeEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  afterAll(() => {
    rmSync(tempHome, { recursive: true, force: true });
    delete process.env.MAESTRO_HOME;
  });

  it('publishes lifecycle, snapshot, and final broker events while preserving history', async () => {
    const publishedEvents: Array<Record<string, unknown>> = [];
    const bridgeCalls: string[] = [];
    const adapter = {
      async spawn() {
        return {
          id: 'proc-1',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-07T11:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-1',
            processId,
            timestamp: '2026-04-07T11:00:01.000Z',
            type: 'assistant_message',
            content: 'Worker output',
            partial: false,
          });
          cb({
            id: 'entry-2',
            processId,
            timestamp: '2026-04-07T11:00:02.000Z',
            type: 'status_change',
            status: 'stopped',
          });
        });
        return () => {
          return;
        };
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        publishedEvents.push(input);
        return {
          eventId: publishedEvents.length,
          sequence: publishedEvents.length,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-07T11:00:03.000Z',
          payload: (input.payload ?? {}) as Record<string, unknown>,
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return null;
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [];
      },
      updateMessage() {
        return null;
      },
    };

    const bridge = {
      async tryConnect() {
        return false;
      },
      forwardSpawn() {
        bridgeCalls.push('spawn');
      },
      forwardEntry() {
        bridgeCalls.push('entry');
      },
      forwardStopped() {
        bridgeCalls.push('stopped');
      },
      close() {
        bridgeCalls.push('close');
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => bridge,
      renderEntry: () => undefined,
      now: () => '2026-04-07T11:00:03.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-runner',
      prompt: 'Investigate async broker updates',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    const store = new CliHistoryStore();
    const meta = store.loadMeta('exec-runner');

    assert.equal(exitCode, 0);
    assert.ok(meta);
    assert.equal(meta.exitCode, 0);
    assert.equal(store.getOutput('exec-runner'), 'Worker output');

    assert.deepEqual(
      publishedEvents.map((event) => event.type),
      ['status_update', 'completed'],
    );
    assert.equal(publishedEvents[0].status, 'running');
    assert.equal(publishedEvents[1].status, 'completed');

    const completedEvent = publishedEvents[1];
    assert.equal((completedEvent.snapshot as Record<string, unknown>).outputPreview, 'Worker output');
    assert.deepEqual(bridgeCalls, ['spawn', 'entry', 'entry', 'stopped', 'close']);
  });

  it('treats a broker cancel request as a cancelled execution and stops the adapter', async () => {
    const publishedEvents: Array<Record<string, unknown>> = [];
    let stopCalls = 0;
    const adapter = {
      async spawn() {
        return {
          id: 'proc-cancel',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-08T09:00:00.000Z',
        };
      },
      async stop() {
        stopCalls += 1;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-cancel-1',
            processId,
            timestamp: '2026-04-08T09:00:01.000Z',
            type: 'status_change',
            status: 'stopped',
            reason: 'Cancelled',
          });
        });
        return () => undefined;
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        publishedEvents.push(input);
        return {
          eventId: publishedEvents.length,
          sequence: publishedEvents.length,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-08T09:00:02.000Z',
          payload: (input.payload ?? {}) as Record<string, unknown>,
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return {
          jobId: 'exec-cancelled',
          status: 'running',
          createdAt: '2026-04-08T09:00:00.000Z',
          updatedAt: '2026-04-08T09:00:01.000Z',
          lastEventId: 1,
          lastEventType: 'cancel_requested',
          latestSnapshot: null,
          metadata: { cancelRequestedAt: '2026-04-08T09:00:01.000Z' },
        };
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [];
      },
      updateMessage() {
        return null;
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      renderEntry: () => undefined,
      now: () => '2026-04-08T09:00:02.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-cancelled',
      prompt: 'Cancel me',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    const store = new CliHistoryStore();
    const meta = store.loadMeta('exec-cancelled');
    assert.equal(exitCode, 130);
    assert.equal(stopCalls, 1);
    assert.ok(meta?.cancelledAt);
    assert.equal(meta?.exitCode, 130);
    assert.equal(publishedEvents.at(-1)?.type, 'cancelled');
  });

  it('dispatches queued follow-up messages after successful completion', async () => {
    const publishedEvents: Array<Record<string, unknown>> = [];
    const updatedMessages: Array<Record<string, unknown>> = [];
    const spawnedFollowups: Array<{ execId: string; prompt: string }> = [];
    const adapter = {
      async spawn() {
        return {
          id: 'proc-followup',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-08T10:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-followup-1',
            processId,
            timestamp: '2026-04-08T10:00:01.000Z',
            type: 'status_change',
            status: 'stopped',
          });
        });
        return () => undefined;
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        publishedEvents.push(input);
        return {
          eventId: publishedEvents.length,
          sequence: publishedEvents.length,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-08T10:00:02.000Z',
          payload: (input.payload ?? {}) as Record<string, unknown>,
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return null;
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [{
          messageId: 'msg-1',
          createdAt: '2026-04-08T10:00:01.000Z',
          delivery: 'after_complete',
          message: 'Continue with the next change',
          status: 'queued',
        }];
      },
      updateMessage(input: Record<string, unknown>) {
        updatedMessages.push(input);
        return {
          messageId: 'msg-1',
          createdAt: '2026-04-08T10:00:01.000Z',
          delivery: 'after_complete',
          message: 'Continue with the next change',
          status: String(input.status),
          dispatchedAt: '2026-04-08T10:00:02.000Z',
          dispatchReason: String(input.dispatchReason ?? ''),
        };
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      spawnDetachedDelegate: (_options, execId, prompt) => {
        spawnedFollowups.push({ execId, prompt });
        return true;
      },
      renderEntry: () => undefined,
      now: () => '2026-04-08T10:00:02.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-followup',
      prompt: 'Complete current task',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(spawnedFollowups, [{
      execId: 'exec-followup',
      prompt: 'Continue with the next change',
    }]);
    assert.equal(updatedMessages.length, 1);
    assert.equal(updatedMessages[0].status, 'dispatched');
    assert.equal(updatedMessages[0].dispatchReason, 'completed');
  });

  it('dispatches inject follow-ups even if the task finishes before cancellation lands', async () => {
    const updatedMessages: Array<Record<string, unknown>> = [];
    const spawnedFollowups: Array<{ execId: string; prompt: string }> = [];
    const adapter = {
      async spawn() {
        return {
          id: 'proc-race',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-08T10:10:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-race-1',
            processId,
            timestamp: '2026-04-08T10:10:01.000Z',
            type: 'status_change',
            status: 'error',
          });
        });
        return () => undefined;
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent() {
        return {
          eventId: 1,
          sequence: 1,
          jobId: 'exec-race',
          type: 'status_update',
          createdAt: '2026-04-08T10:10:02.000Z',
          payload: {},
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return {
          jobId: 'exec-race',
          status: 'running',
          createdAt: '2026-04-08T10:10:00.000Z',
          updatedAt: '2026-04-08T10:10:00.000Z',
          lastEventId: 1,
          lastEventType: 'cancel_requested',
          latestSnapshot: null,
          metadata: { cancelRequestedAt: '2026-04-08T10:10:00.500Z' },
        };
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [{
          messageId: 'msg-race',
          createdAt: '2026-04-08T10:10:00.500Z',
          delivery: 'inject',
          message: 'Resume despite race',
          status: 'queued',
        }];
      },
      updateMessage(input: Record<string, unknown>) {
        updatedMessages.push(input);
        return {
          messageId: 'msg-race',
          createdAt: '2026-04-08T10:10:00.500Z',
          delivery: 'inject',
          message: 'Resume despite race',
          status: String(input.status),
          dispatchedAt: '2026-04-08T10:10:02.000Z',
          dispatchReason: String(input.dispatchReason ?? ''),
        };
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      spawnDetachedDelegate: (_options, execId, prompt) => {
        spawnedFollowups.push({ execId, prompt });
        return true;
      },
      renderEntry: () => undefined,
      now: () => '2026-04-08T10:10:02.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-race',
      prompt: 'Original prompt',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    assert.equal(exitCode, 130);
    assert.deepEqual(spawnedFollowups, [{
      execId: 'exec-race',
      prompt: 'Resume despite race',
    }]);
    assert.equal(updatedMessages.length, 1);
    assert.equal(updatedMessages[0].status, 'dispatched');
    assert.equal(updatedMessages[0].dispatchReason, 'cancelled');
  });

  it('injects messages via sendMessage for interactive adapters', async () => {
    const updatedMessages: Array<Record<string, unknown>> = [];
    const sentMessages: Array<{ processId: string; content: string }> = [];
    let entryCallback: ((entry: Record<string, unknown>) => void) | null = null;

    const adapter = {
      async spawn() {
        return {
          id: 'proc-stream',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-09T10:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(_processId: string, cb: (entry: Record<string, unknown>) => void) {
        entryCallback = cb;
        return () => undefined;
      },
      async sendMessage(processId: string, content: string) {
        sentMessages.push({ processId, content });
      },
      supportsInteractive() {
        return true;
      },
    };

    let pollerTicks = 0;
    const injectMessages = [
      {
        messageId: 'msg-stream-1',
        createdAt: '2026-04-09T10:00:01.000Z',
        delivery: 'inject' as const,
        message: 'Injected follow-up',
        status: 'queued' as const,
      },
    ];

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        return {
          eventId: 1,
          sequence: 1,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-09T10:00:02.000Z',
          payload: (input.payload ?? {}) as Record<string, unknown>,
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return null;
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        pollerTicks++;
        // Return inject message on first poll, then empty (already injected)
        if (pollerTicks === 1) {
          return injectMessages;
        }
        return [];
      },
      updateMessage(input: Record<string, unknown>) {
        updatedMessages.push(input);
        return null;
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      renderEntry: () => undefined,
      now: () => '2026-04-09T10:00:02.000Z',
    });

    const runPromise = runner.run({
      execId: 'exec-stream',
      prompt: 'Stream test',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    // Wait for the poller to fire at least once (750ms interval)
    await new Promise((r) => setTimeout(r, 900));

    // Now stop the process
    entryCallback?.({
      id: 'entry-stream-stop',
      processId: 'proc-stream',
      timestamp: '2026-04-09T10:00:03.000Z',
      type: 'status_change',
      status: 'stopped',
    });

    const exitCode = await runPromise;
    assert.equal(exitCode, 0);

    // Verify sendMessage was called
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].processId, 'proc-stream');
    assert.equal(sentMessages[0].content, 'Injected follow-up');

    // Wait for the async sendMessage promise to resolve and updateMessage to be called
    await new Promise((r) => setTimeout(r, 50));

    // Verify message status was updated to 'injected'
    assert.ok(updatedMessages.length >= 1);
    const injectedUpdate = updatedMessages.find((m) => m.status === 'injected');
    assert.ok(injectedUpdate, 'Expected an update with status injected');
    assert.equal(injectedUpdate.messageId, 'msg-stream-1');
    assert.equal(injectedUpdate.dispatchReason, 'inject-streaming');
  });

  it('falls back to cancel+resume for non-interactive adapters', async () => {
    let stopCalled = false;
    let entryCallback: ((entry: Record<string, unknown>) => void) | null = null;
    const spawnedFollowups: Array<{ execId: string; prompt: string }> = [];

    const adapter = {
      async spawn() {
        return {
          id: 'proc-no-send',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-09T11:00:00.000Z',
        };
      },
      async stop() {
        stopCalled = true;
      },
      onEntry(_processId: string, cb: (entry: Record<string, unknown>) => void) {
        entryCallback = cb;
        return () => undefined;
      },
      // No sendMessage or supportsInteractive — non-interactive adapter
    };

    let pollerTicks = 0;

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        return {
          eventId: 1,
          sequence: 1,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-09T11:00:02.000Z',
          payload: (input.payload ?? {}) as Record<string, unknown>,
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return {
          jobId: 'exec-no-send',
          status: 'running',
          createdAt: '2026-04-09T11:00:00.000Z',
          updatedAt: '2026-04-09T11:00:00.000Z',
          lastEventId: 1,
          lastEventType: 'cancel_requested',
          latestSnapshot: null,
          metadata: { cancelRequestedAt: '2026-04-09T11:00:01.500Z' },
        };
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        pollerTicks++;
        // Always return the inject message — it stays queued for follow-up dispatch
        return [{
          messageId: 'msg-fallback-1',
          createdAt: '2026-04-09T11:00:01.000Z',
          delivery: 'inject',
          message: 'Fallback to cancel+resume',
          status: 'queued',
        }];
      },
      updateMessage(input: Record<string, unknown>) {
        return {
          messageId: String(input.messageId),
          createdAt: '2026-04-09T11:00:01.000Z',
          delivery: 'inject',
          message: 'Fallback to cancel+resume',
          status: String(input.status),
          dispatchedAt: '2026-04-09T11:00:02.000Z',
          dispatchReason: String(input.dispatchReason ?? ''),
        };
      },
      checkTimeouts() {
        return [];
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      spawnDetachedDelegate: (_options, execId, prompt) => {
        spawnedFollowups.push({ execId, prompt });
        return true;
      },
      renderEntry: () => undefined,
      now: () => '2026-04-09T11:00:02.000Z',
    });

    const runPromise = runner.run({
      execId: 'exec-no-send',
      prompt: 'No send test',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    // Wait for poller to fire and trigger cancellation
    await new Promise((r) => setTimeout(r, 900));

    // Adapter.stop should have been called (cancellation)
    assert.equal(stopCalled, true, 'Expected adapter.stop to be called for cancel+resume fallback');

    // Stop the process (simulating adapter finishing after cancel)
    entryCallback?.({
      id: 'entry-no-send-stop',
      processId: 'proc-no-send',
      timestamp: '2026-04-09T11:00:03.000Z',
      type: 'status_change',
      status: 'stopped',
    });

    const exitCode = await runPromise;
    assert.equal(exitCode, 130); // cancelled

    // Verify the queued inject message was dispatched as a follow-up after cancellation
    assert.deepEqual(spawnedFollowups, [{
      execId: 'exec-no-send',
      prompt: 'Fallback to cancel+resume',
    }]);
  });

  it('dispatches queued inject messages as follow-ups on completion', async () => {
    const spawnedFollowups: Array<{ execId: string; prompt: string }> = [];
    const adapter = {
      async spawn() {
        return {
          id: 'proc-inject-followup',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-09T12:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-inject-followup-1',
            processId,
            timestamp: '2026-04-09T12:00:01.000Z',
            type: 'status_change',
            status: 'stopped',
          });
        });
        return () => undefined;
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        return {
          eventId: 1,
          sequence: 1,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-09T12:00:02.000Z',
          payload: (input.payload ?? {}) as Record<string, unknown>,
        };
      },
      pollEvents() {
        return [];
      },
      ack() {
        return 0;
      },
      getJob() {
        return null;
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        // Queued inject message — SHOULD be dispatched as follow-up on completion
        return [{
          messageId: 'msg-inject-followup',
          createdAt: '2026-04-09T12:00:00.500Z',
          delivery: 'inject',
          message: 'Inject follow-up message',
          status: 'queued',
        }];
      },
      updateMessage(input: Record<string, unknown>) {
        return {
          messageId: String(input.messageId),
          createdAt: '2026-04-09T12:00:00.500Z',
          delivery: 'inject',
          message: 'Inject follow-up message',
          status: String(input.status),
          dispatchedAt: '2026-04-09T12:00:02.000Z',
          dispatchReason: String(input.dispatchReason ?? ''),
        };
      },
      checkTimeouts() {
        return [];
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      spawnDetachedDelegate: (_options, execId, prompt) => {
        spawnedFollowups.push({ execId, prompt });
        return true;
      },
      renderEntry: () => undefined,
      now: () => '2026-04-09T12:00:02.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-inject-followup',
      prompt: 'Inject followup test',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    assert.equal(exitCode, 0);
    // Inject messages SHOULD trigger a detached follow-up spawn on completion
    assert.deepEqual(spawnedFollowups, [{
      execId: 'exec-inject-followup',
      prompt: 'Inject follow-up message',
    }]);
  });
});

describe('CliAgentRunner provider routing', () => {
  it('maps every supported provider explicitly, including configured aliases', async () => {
    const { resolveCliAgentType } = await import('./cli-agent-runner.js');
    const cases = [
      ['gemini', undefined, 'gemini'],
      ['gemini-a2a', undefined, 'gemini-a2a'],
      ['qwen', undefined, 'qwen'],
      ['codex', undefined, 'codex'],
      ['codex-server', undefined, 'codex-server'],
      ['grok', undefined, 'grok'],
      ['claude', undefined, 'claude-code'],
      ['claude-code', undefined, 'claude-code'],
      ['opencode', undefined, 'opencode'],
      ['agy', undefined, 'agy'],
      ['api-explore', undefined, 'api-explore'],
      ['custom-codex', 'codex', 'codex'],
    ] as const;

    for (const [tool, baseTool, expected] of cases) {
      assert.equal(resolveCliAgentType(tool, baseTool), expected);
    }
  });

  it('rejects Grok terminal before calling the adapter factory', async () => {
    const { CliAgentRunner } = await import('./cli-agent-runner.js');
    let factoryCalls = 0;
    const runner = new CliAgentRunner({
      createAdapter: async () => {
        factoryCalls += 1;
        throw new Error('factory must not run');
      },
    });

    await assert.rejects(runner.run({
      prompt: 'must fail closed',
      tool: 'grok',
      mode: 'write',
      workDir: '/tmp/project',
      backend: 'terminal',
      sync: true,
    }), /Grok terminal backend is unsupported/);
    assert.equal(factoryCalls, 0);
  });

  it('rejects terminal Delegate context for every provider before calling the adapter factory', async () => {
    const { CliAgentRunner } = await import('./cli-agent-runner.js');
    let factoryCalls = 0;
    const runner = new CliAgentRunner({
      createAdapter: async () => {
        factoryCalls += 1;
        throw new Error('factory must not run');
      },
    });

    await assert.rejects(runner.run({
      prompt: 'must preserve recursion guard',
      tool: 'codex',
      mode: 'analysis',
      workDir: '/tmp/project',
      backend: 'terminal',
      sync: true,
      delegateExecutionContext: 'parent-terminal-test',
    }), /Delegate terminal backend is unsupported.*recursion guard context/);
    assert.equal(factoryCalls, 0);
  });

  it('rejects an unknown provider without calling another provider factory', async () => {
    const { CliAgentRunner } = await import('./cli-agent-runner.js');
    let factoryCalls = 0;
    const runner = new CliAgentRunner({
      createAdapter: async () => {
        factoryCalls += 1;
        throw new Error('factory must not run');
      },
    });

    await assert.rejects(runner.run({
      prompt: 'must fail closed',
      tool: 'mystery-provider',
      mode: 'analysis',
      workDir: '/tmp/project',
      sync: true,
    }), /Unknown CLI provider: mystery-provider/);
    assert.equal(factoryCalls, 0);
  });
});
