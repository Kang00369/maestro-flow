// ---------------------------------------------------------------------------
// Agent REST API routes
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { resolve } from 'node:path';

import type { AgentManager } from '../agents/agent-manager.js';
import {
  AgentExecutionConfigError,
  resolveAgentExecutionConfig,
  type AgentExecutionRuntimeConfig,
} from '../config.js';

/**
 * Agent routes following the Hono factory pattern.
 *
 * POST /api/agents/spawn           - spawn a new agent process
 * POST /api/agents/:id/stop        - stop an agent process
 * POST /api/agents/:id/message     - send message to agent
 * POST /api/approvals/:id/respond  - respond to approval request
 * GET  /api/agents                 - list all active processes
 * GET  /api/agents/:id/entries     - get entry history for a process
 */
export function createAgentRoutes(
  agentManager: AgentManager,
  getWorkflowRoot: () => string = () => resolve(process.cwd(), '.workflow'),
): Hono {
  const app = new Hono();

  // POST /api/agents/spawn
  app.post('/api/agents/spawn', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();

      const config = await resolveAgentExecutionConfig(getWorkflowRoot(), {
        provider: body.type,
        prompt: body.prompt,
        workDir: body.workDir,
        mode: body.mode,
        runtime: body as AgentExecutionRuntimeConfig,
      });

      const process = await agentManager.spawn(config.type, config);
      return c.json(process, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof AgentExecutionConfigError || message.includes('No adapter registered')) {
        return c.json({ error: message }, 400);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /api/agents/:id/stop
  app.post('/api/agents/:id/stop', async (c) => {
    try {
      const id = c.req.param('id');
      await agentManager.stop(id);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No process found')) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /api/agents/:id/message
  app.post('/api/agents/:id/message', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json<Record<string, unknown>>();

      if (!body.content || typeof body.content !== 'string') {
        return c.json({ error: 'Missing or invalid "content" field' }, 400);
      }

      await agentManager.sendMessage(id, body.content as string);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No process found')) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /api/approvals/:id/respond
  app.post('/api/approvals/:id/respond', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json<Record<string, unknown>>();

      if (typeof body.allow !== 'boolean') {
        return c.json({ error: 'Missing or invalid "allow" field (must be boolean)' }, 400);
      }
      if (!body.processId || typeof body.processId !== 'string') {
        return c.json({ error: 'Missing or invalid "processId" field' }, 400);
      }

      await agentManager.respondApproval({
        id,
        allow: body.allow as boolean,
        processId: body.processId as string,
      });
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No process found')) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // DELETE /api/agents/:id — remove a process from memory (dismiss)
  app.delete('/api/agents/:id', (c) => {
    const id = c.req.param('id');
    agentManager.removeProcess(id);
    return c.json({ ok: true });
  });

  // GET /api/agents
  app.get('/api/agents', (c) => {
    return c.json(agentManager.listProcesses());
  });

  // GET /api/agents/:id/entries
  app.get('/api/agents/:id/entries', (c) => {
    const id = c.req.param('id');
    return c.json(agentManager.getEntries(id));
  });

  return app;
}
