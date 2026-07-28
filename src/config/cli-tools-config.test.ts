import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import {
  selectTool,
  resolveProxyEnv,
  migrateLegacyShippedToolModels,
  upgradeExistingCliTools,
  LEGACY_SHIPPED_CODEX_PRIMARY_MODEL,
  CURRENT_SHIPPED_CODEX_PRIMARY_MODEL,
} from './cli-tools-config.js';
import type { CliToolsConfig, ToolEntry } from './cli-tools-config.js';

function makeEntry(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    enabled: true,
    primaryModel: 'test-model',
    tags: [],
    type: 'builtin',
    ...overrides,
  };
}

function makeConfig(tools: Record<string, ToolEntry> = {}): CliToolsConfig {
  return { version: '1.0.0', tools };
}

describe('selectTool', () => {
  it('selects by exact name when enabled', () => {
    const config = makeConfig({
      gemini: makeEntry(),
      qwen: makeEntry(),
    });
    const result = selectTool('gemini', config);
    expect(result).toBeDefined();
    expect(result!.name).toBe('gemini');
  });

  it('returns undefined when named tool is disabled', () => {
    const config = makeConfig({
      gemini: makeEntry({ enabled: false }),
    });
    expect(selectTool('gemini', config)).toBeUndefined();
  });

  it('returns undefined when the named tool does not exist', () => {
    const config = makeConfig({
      existing: makeEntry(),
    });
    const result = selectTool('missing', config);
    expect(result).toBeUndefined();
  });

  it('returns undefined instead of selecting a fallback when the name is missing', () => {
    const config = makeConfig({
      codex: makeEntry({ enabled: true }),
      claude: makeEntry({ enabled: true }),
    });
    expect(selectTool(undefined, config)).toBeUndefined();
  });
});

describe('resolveProxyEnv', () => {
  const originalHome = process.env.HOME;

  beforeAll(() => {
    // resolveProxyEnv intentionally consults ~/.maestro/api*.json. Isolate the
    // tests from the developer machine so local proxy settings cannot leak in.
    process.env.HOME = `/tmp/maestro-flow-test-home-${process.pid}`;
  });

  afterAll(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('returns empty when proxy is not configured', () => {
    const config = makeConfig({ codex: makeEntry() });
    expect(resolveProxyEnv(config, 'codex')).toEqual({});
  });

  it('returns empty when proxy.enabled is false', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: { enabled: false, httpProxy: 'http://127.0.0.1:7890' },
    };
    expect(resolveProxyEnv(config, 'codex')).toEqual({});
  });

  it('injects HTTP_PROXY and HTTPS_PROXY when enabled', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
    expect(env.http_proxy).toBe('http://127.0.0.1:7890');
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
    expect(env.https_proxy).toBe('http://127.0.0.1:7890');
  });

  it('uses separate httpsProxy when provided', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: {
        enabled: true,
        httpProxy: 'http://127.0.0.1:7890',
        httpsProxy: 'http://127.0.0.1:7891',
      },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:7891');
  });

  it('includes noProxy when configured', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: {
        enabled: true,
        httpProxy: 'http://127.0.0.1:7890',
        noProxy: '127.0.0.1,localhost,.internal',
      },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.NO_PROXY).toBe('127.0.0.1,localhost,.internal');
    expect(env.no_proxy).toBe('127.0.0.1,localhost,.internal');
  });

  it('skips proxy for tool with proxy: false', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry({ proxy: false }) }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    expect(resolveProxyEnv(config, 'codex')).toEqual({});
  });

  it('applies proxy for tool with proxy: true', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry({ proxy: true }) }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
  });

  it('applies proxy for tool without proxy field (default inherit)', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
  });

  it('returns empty for unknown tool name with proxy enabled', () => {
    const config: CliToolsConfig = {
      ...makeConfig({}),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'unknown');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
  });
});

describe('legacy shipped codex primaryModel migration', () => {
  it('migrates only codex.primaryModel exactly equal to gpt-5.5', () => {
    const { tools, migrated } = migrateLegacyShippedToolModels({
      codex: makeEntry({
        primaryModel: LEGACY_SHIPPED_CODEX_PRIMARY_MODEL,
        tags: ['fullstack', 'backend'],
        enabled: true,
      }),
      claude: makeEntry({ primaryModel: 'claude-sonnet-4-6' }),
    });

    expect(migrated).toEqual(['codex']);
    expect(tools.codex.primaryModel).toBe(CURRENT_SHIPPED_CODEX_PRIMARY_MODEL);
    expect(tools.codex.primaryModel).toBe('gpt-5.6-sol');
    // Non-model fields preserved
    expect(tools.codex.enabled).toBe(true);
    expect(tools.codex.tags).toEqual(['fullstack', 'backend']);
    // Other tools untouched
    expect(tools.claude.primaryModel).toBe('claude-sonnet-4-6');
  });

  it('preserves custom codex.primaryModel values (no migration)', () => {
    for (const custom of ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4.1', 'my-custom-codex']) {
      const { tools, migrated } = migrateLegacyShippedToolModels({
        codex: makeEntry({ primaryModel: custom }),
      });
      expect(migrated).toEqual([]);
      expect(tools.codex.primaryModel).toBe(custom);
    }
  });

  it('is a no-op when codex entry is missing', () => {
    const { tools, migrated } = migrateLegacyShippedToolModels({
      claude: makeEntry({ primaryModel: 'claude-sonnet-4-6' }),
    });
    expect(migrated).toEqual([]);
    expect(tools.codex).toBeUndefined();
    expect(tools.claude.primaryModel).toBe('claude-sonnet-4-6');
  });

  it('upgradeExistingCliTools migrates legacy codex and still adds missing tools', () => {
    const { tools, added, migrated } = upgradeExistingCliTools({
      codex: makeEntry({
        primaryModel: LEGACY_SHIPPED_CODEX_PRIMARY_MODEL,
        enabled: false,
        tags: ['custom-tag'],
      }),
      // deliberately omit grok / gemini / etc.
    });

    expect(migrated).toEqual(['codex']);
    expect(tools.codex.primaryModel).toBe(CURRENT_SHIPPED_CODEX_PRIMARY_MODEL);
    // Custom non-model fields preserved on existing entry
    expect(tools.codex.enabled).toBe(false);
    expect(tools.codex.tags).toEqual(['custom-tag']);
    // Missing shipped tools are added
    expect(added).toContain('grok');
    expect(added).toContain('claude');
    expect(tools.grok).toBeDefined();
    expect(tools.claude).toBeDefined();
  });

  it('upgradeExistingCliTools reports changed state only via added/migrated evidence', () => {
    const alreadyCurrent = upgradeExistingCliTools({
      codex: makeEntry({ primaryModel: CURRENT_SHIPPED_CODEX_PRIMARY_MODEL }),
      claude: makeEntry({ primaryModel: 'claude-sonnet-4-6' }),
      gemini: makeEntry({ primaryModel: 'gemini-3.1-pro-preview' }),
      grok: makeEntry({ primaryModel: 'grok-4.5', reasoningEffort: 'high' }),
      opencode: makeEntry({ primaryModel: '' }),
      agy: makeEntry({ primaryModel: '' }),
    });
    // All shipped tools present + current codex → nothing to add or migrate
    expect(alreadyCurrent.added).toEqual([]);
    expect(alreadyCurrent.migrated).toEqual([]);
    expect(alreadyCurrent.tools.codex.primaryModel).toBe('gpt-5.6-sol');
  });
});
