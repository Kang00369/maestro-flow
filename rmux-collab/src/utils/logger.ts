import type { InteractionLog } from '../types.js';

export class Logger {
  private logs: InteractionLog[] = [];

  record(entry: Omit<InteractionLog, 'timestamp'>): void {
    this.logs.push({ ...entry, timestamp: Date.now() });
  }

  getAll(): readonly InteractionLog[] {
    return this.logs;
  }

  clear(): void {
    this.logs = [];
  }
}
