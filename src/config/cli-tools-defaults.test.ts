import { describe, expect, it } from 'vitest';
import cliToolsDefaults from './cli-tools-defaults.json' with { type: 'json' };

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
});
