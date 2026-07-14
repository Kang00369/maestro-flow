import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentWsHandler } from './agent-handler.js';
import { DashboardEventBus } from '../../state/event-bus.js';

class MockWebSocket {
  readyState = 1;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }
}

describe('AgentWsHandler delegate messaging', () => {
  let agentManager: {
    spawn: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    respondApproval: ReturnType<typeof vi.fn>;
    registerCliProcess: ReturnType<typeof vi.fn>;
    addCliEntry: ReturnType<typeof vi.fn>;
    updateCliProcessStatus: ReturnType<typeof vi.fn>;
  };
  let handler: AgentWsHandler;
  let ws: MockWebSocket;
  let broadcast: (type: import('../../../shared/ws-protocol.js').WsEventType, data: unknown) => void;
  let delegateMessage: ReturnType<typeof vi.fn>;
  let workflowRoot: string;

  beforeEach(() => {
    workflowRoot = mkdtempSync(join(tmpdir(), 'maestro-agent-ws-'));
    writeFileSync(join(workflowRoot, 'config.json'), JSON.stringify({
      settings: {
        agents: {
          grok: {
            model: 'grok-4.5',
            reasoningEffort: 'high',
            approvalMode: 'auto',
          },
        },
      },
    }));
    agentManager = {
      spawn: vi.fn(async (_type, config) => ({
        id: 'ws-proc',
        type: config.type,
        status: 'running',
        config,
        startedAt: '2026-07-14T00:00:00.000Z',
      })),
      stop: vi.fn(),
      sendMessage: vi.fn(),
      respondApproval: vi.fn(),
      registerCliProcess: vi.fn(),
      addCliEntry: vi.fn(),
      updateCliProcessStatus: vi.fn(),
    };
    delegateMessage = vi.fn();
    handler = new AgentWsHandler(
      agentManager as any,
      new DashboardEventBus(),
      () => workflowRoot,
      delegateMessage as any,
    );
    ws = new MockWebSocket();
    broadcast = vi.fn() as unknown as typeof broadcast;
  });

  afterEach(() => {
    rmSync(workflowRoot, { recursive: true, force: true });
  });

  it('declares delegate:message as a supported action', () => {
    expect(handler.actions).toContain('delegate:message');
  });

  it('accepts inject delivery for delegate messages', async () => {
    await handler.handle('delegate:message', {
      action: 'delegate:message',
      processId: 'cli-history-job-2',
      content: 'Inject this message',
      delivery: 'inject',
    }, ws as any, broadcast);

    expect(delegateMessage).toHaveBeenCalledWith({
      execId: 'cli-history-job-2',
      message: 'Inject this message',
      delivery: 'inject',
      requestedBy: 'dashboard:ws:delegate_message',
    });
    expect(agentManager.sendMessage).not.toHaveBeenCalled();
    expect(ws.sent).toHaveLength(0);
  });

  it('routes async delegate follow-ups through the shared delegate control', async () => {
    await handler.handle('delegate:message', {
      action: 'delegate:message',
      processId: 'cli-history-job-1',
      content: 'Continue after completion',
      delivery: 'after_complete',
    }, ws as any, broadcast);

    expect(delegateMessage).toHaveBeenCalledWith({
      execId: 'cli-history-job-1',
      message: 'Continue after completion',
      delivery: 'after_complete',
      requestedBy: 'dashboard:ws:delegate_message',
    });
    expect(agentManager.sendMessage).not.toHaveBeenCalled();
    expect(ws.sent).toHaveLength(0);
  });

  it('uses configured Grok model/effort and keeps unspecified remote access suggest-only', async () => {
    await handler.handle('spawn', {
      config: {
        type: 'grok',
        prompt: 'inspect websocket path',
        workDir: '/tmp/project',
      },
    }, ws as any, broadcast);

    expect(agentManager.spawn).toHaveBeenCalledWith('grok', expect.objectContaining({
      type: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'suggest',
    }));
  });

  it('rejects invalid effort and unknown providers before creating an adapter process', async () => {
    await expect(handler.handle('spawn', {
      config: {
        type: 'grok',
        prompt: 'invalid effort',
        workDir: '/tmp/project',
        reasoningEffort: 'extreme',
      },
    }, ws as any, broadcast)).rejects.toThrow(/Invalid runtime reasoning effort/);

    await expect(handler.handle('spawn', {
      config: {
        type: 'mystery',
        prompt: 'unknown provider',
        workDir: '/tmp/project',
      },
    }, ws as any, broadcast)).rejects.toThrow(/Unknown agent provider: mystery/);

    await expect(handler.handle('spawn', {
      config: {
        type: 'qwen',
        prompt: 'unconfigured provider',
        workDir: '/tmp/project',
      },
    }, ws as any, broadcast)).rejects.toThrow(/Agent provider is not configured: qwen/);

    expect(agentManager.spawn).not.toHaveBeenCalled();
  });
});
