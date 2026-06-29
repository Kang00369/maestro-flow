import type { Agent } from '../agent.js';
import type { AgentResult, AskOptions } from '../types.js';

export async function broadcastCollect(
  agents: Agent[],
  prompt: string,
  opts?: AskOptions,
): Promise<AgentResult[]> {
  const start = Date.now();

  const results = await Promise.allSettled(
    agents.map(async (agent): Promise<AgentResult> => {
      const agentStart = Date.now();
      try {
        const output = await agent.ask(prompt, opts);
        return {
          agent: agent.name,
          output,
          duration_ms: Date.now() - agentStart,
        };
      } catch (err) {
        return {
          agent: agent.name,
          output: '',
          error: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - agentStart,
        };
      }
    }),
  );

  return results.map(r => (r.status === 'fulfilled' ? r.value : {
    agent: 'unknown',
    output: '',
    error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    duration_ms: Date.now() - start,
  }));
}
