import { describe, expect, it } from 'vitest';
import cliToolsDefaults from './cli-tools-defaults.json' with { type: 'json' };
import { CURRENT_SHIPPED_CODEX_PRIMARY_MODEL } from './cli-tools-config.js';

describe('CLI tool defaults', () => {
  it('registers Grok 4.5 high as an explicit enabled-on-detection provider', () => {
    const grok = cliToolsDefaults.tools.find((tool) => tool.name === 'grok');

    expect(grok).toMatchObject({
      name: 'grok',
      cmd: 'grok',
      primaryModel: 'grok-4.5',
      reasoningEffort: 'high',
      type: 'builtin',
    });
  });

  it('ships Codex primaryModel as gpt-5.6-sol', () => {
    const codex = cliToolsDefaults.tools.find((tool) => tool.name === 'codex');

    expect(codex).toMatchObject({
      name: 'codex',
      cmd: 'codex',
      primaryModel: CURRENT_SHIPPED_CODEX_PRIMARY_MODEL,
      type: 'builtin',
    });
    expect(codex?.primaryModel).toBe('gpt-5.6-sol');
  });
});
