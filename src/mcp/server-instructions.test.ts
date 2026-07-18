import { describe, expect, it } from 'vitest';
import { buildMcpServerInstructions, resolveEnabledMcpTools } from './server-instructions.js';

describe('MCP server instructions', () => {
  it('advertises delegate_wait when the tool is enabled explicitly or through all', () => {
    expect(buildMcpServerInstructions(['delegate_wait'])).toContain('call delegate_wait exactly once');
    expect(buildMcpServerInstructions(['all'])).toContain('call delegate_wait exactly once');
  });

  it('does not advertise delegate_wait when the tool is filtered out', () => {
    const instructions = buildMcpServerInstructions(['wiki_search']);
    expect(instructions).not.toContain('delegate_wait');
    expect(instructions).toContain('one-way status updates');
    expect(instructions).toContain('report its terminal status');
    expect(instructions).toContain('delegate output <exec_id>');
    expect(instructions).toContain('Do not poll');
  });

  it('uses the environment allowlist instead of configured tools when present', () => {
    expect(resolveEnabledMcpTools(['all'], ' wiki_search, delegate_wait '))
      .toEqual(['wiki_search', 'delegate_wait']);
    expect(resolveEnabledMcpTools(['all'], '')).toEqual(['all']);
  });
});
