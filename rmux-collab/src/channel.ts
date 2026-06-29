import { Rmux, PaneSet } from '@rmux/sdk';
import type { Session } from '@rmux/sdk';
import type { AgentResult, AskOptions, ChannelConfig } from './types.js';
import { Agent, getLaunchCommand, getDefaultMarker } from './agent.js';
import { broadcastCollect } from './patterns/broadcast-collect.js';

export class Channel {
  readonly name: string;
  readonly session: Session;
  readonly agents: Map<string, Agent> = new Map();

  private server: Rmux;

  private constructor(name: string, session: Session, server: Rmux) {
    this.name = name;
    this.session = session;
    this.server = server;
  }

  static async create(rmux: Rmux, config: ChannelConfig): Promise<Channel> {
    const session = await rmux.ensureSession(config.name);
    const channel = new Channel(config.name, session, rmux);

    for (const agentConfig of config.agents) {
      const command = getLaunchCommand(agentConfig);
      const window = await session.newWindow({
        name: agentConfig.name,
        shellCommand: command,
        detached: true,
      });
      const pane = window.pane(0);

      const agent = new Agent(pane, agentConfig);
      channel.agents.set(agentConfig.name, agent);

      const marker = agentConfig.completionMarker ?? getDefaultMarker(agentConfig.tool);
      const markerStr = typeof marker === 'string' ? marker : '>';
      try {
        await pane.waitForText(markerStr, { timeout: 30_000 });
      } catch {
        // Agent may not show marker immediately; proceed
      }
    }

    return channel;
  }

  get(name: string): Agent {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Agent "${name}" not found in channel "${this.name}"`);
    }
    return agent;
  }

  paneSet(): PaneSet {
    const panes = [...this.agents.values()].map(a => a.pane);
    return new PaneSet(panes);
  }

  async broadcast(prompt: string, opts?: AskOptions): Promise<AgentResult[]> {
    return broadcastCollect([...this.agents.values()], prompt, opts);
  }

  async destroy(): Promise<void> {
    await this.session.kill();
  }
}
