import { Rmux } from '@rmux/sdk';
import type {
  CoordinatorConfig,
  ChannelConfig,
  AgentResult,
  PipelineStage,
  DialogueConfig,
  DialogueMessage,
  AskOptions,
  InteractionLog,
} from './types.js';
import { Channel } from './channel.js';
import { Logger } from './utils/logger.js';
import { pipeline as runPipeline } from './patterns/pipeline.js';
import { dialogue as runDialogue } from './patterns/dialogue.js';

export class Coordinator {
  private rmux: Rmux;
  private channels: Map<string, Channel> = new Map();
  readonly logger: Logger = new Logger();

  private constructor(rmux: Rmux) {
    this.rmux = rmux;
  }

  static async create(config?: CoordinatorConfig): Promise<Coordinator> {
    const rmux = new Rmux();
    const coord = new Coordinator(rmux);

    if (config?.channels) {
      for (const chConfig of config.channels) {
        await coord.addChannel(chConfig);
      }
    }

    return coord;
  }

  async addChannel(config: ChannelConfig): Promise<Channel> {
    const channel = await Channel.create(this.rmux, config);
    this.channels.set(config.name, channel);
    return channel;
  }

  channel(name: string): Channel {
    const ch = this.channels.get(name);
    if (!ch) {
      throw new Error(`Channel "${name}" not found`);
    }
    return ch;
  }

  async ask(
    channelName: string,
    agentName: string,
    prompt: string,
    opts?: AskOptions,
  ): Promise<string> {
    this.logger.record({ channel: channelName, agent: agentName, direction: 'send', content: prompt });
    const start = Date.now();
    const result = await this.channel(channelName).get(agentName).ask(prompt, opts);
    this.logger.record({ channel: channelName, agent: agentName, direction: 'receive', content: result, duration_ms: Date.now() - start });
    return result;
  }

  async broadcast(
    channelName: string,
    prompt: string,
    opts?: AskOptions,
  ): Promise<AgentResult[]> {
    return this.channel(channelName).broadcast(prompt, opts);
  }

  async pipeline(
    stages: PipelineStage[],
    initialPrompt: string,
    opts?: AskOptions,
  ): Promise<string> {
    return runPipeline(stages, initialPrompt, opts);
  }

  async dialogue(
    config: DialogueConfig,
    opts?: AskOptions,
  ): Promise<DialogueMessage[]> {
    return runDialogue(config, opts);
  }

  async shutdown(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.destroy();
    }
    this.channels.clear();
  }
}
