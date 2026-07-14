import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentConfig } from '../../shared/agent-types.js';
import { createAgentRoutes } from './agents.js';

describe('agent REST execution config', () => {
  let workflowRoot: string;
  let spawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    workflowRoot = mkdtempSync(join(tmpdir(), 'maestro-agent-route-'));
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
    spawn = vi.fn(async (_type: string, config: AgentConfig) => ({
      id: 'rest-proc',
      type: config.type,
      status: 'running',
      config,
      startedAt: '2026-07-14T00:00:00.000Z',
    }));
  });

  afterEach(() => {
    rmSync(workflowRoot, { recursive: true, force: true });
  });

  async function request(body: Record<string, unknown>) {
    const app = createAgentRoutes({ spawn } as never, () => workflowRoot);
    return app.request('/api/agents/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('uses configured Grok model/effort and defaults unspecified remote access to suggest', async () => {
    const response = await request({
      type: 'grok',
      prompt: 'inspect route',
      workDir: '/tmp/project',
    });

    expect(response.status).toBe(201);
    expect(spawn).toHaveBeenCalledWith('grok', expect.objectContaining({
      type: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'suggest',
    }));
  });

  it('returns 4xx and never spawns for invalid effort or unknown provider', async () => {
    const invalidEffort = await request({
      type: 'grok',
      prompt: 'invalid',
      workDir: '/tmp/project',
      reasoningEffort: 'extreme',
    });
    expect(invalidEffort.status).toBe(400);
    expect(await invalidEffort.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('Invalid runtime reasoning effort'),
    }));

    const unknown = await request({
      type: 'mystery',
      prompt: 'unknown',
      workDir: '/tmp/project',
    });
    expect(unknown.status).toBe(400);

    const unconfigured = await request({
      type: 'qwen',
      prompt: 'unconfigured',
      workDir: '/tmp/project',
    });
    expect(unconfigured.status).toBe(400);
    expect(await unconfigured.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('Agent provider is not configured: qwen'),
    }));
    expect(spawn).not.toHaveBeenCalled();
  });
});
