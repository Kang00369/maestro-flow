import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentConfig } from '../shared/agent-types.js';
import * as configModule from './config.js';

const resolverKey = ['resolveAgent', 'ExecutionConfig'].join('');
const resolveConfig = (configModule as unknown as Record<string, unknown>)[resolverKey] as (
  workflowRoot: string,
  request: Record<string, unknown>,
) => Promise<AgentConfig>;

describe('Dashboard agent execution config', () => {
  let workflowRoot: string;

  beforeEach(() => {
    workflowRoot = mkdtempSync(join(tmpdir(), 'maestro-agent-config-'));
    writeFileSync(join(workflowRoot, 'config.json'), JSON.stringify({
      settings: {
        agents: {
          grok: {
            model: 'grok-4.5',
            reasoningEffort: 'high',
            approvalMode: 'auto',
          },
          codex: {
            model: 'gpt-5.6-sol',
            reasoningEffort: 'medium',
            approvalMode: 'suggest',
          },
        },
      },
    }));
  });

  afterEach(() => {
    rmSync(workflowRoot, { recursive: true, force: true });
  });

  it.each([
    ['analysis', 'analysis'],
    ['unspecified', undefined],
  ])('keeps %s remote execution suggest/read-only despite saved auto', async (_label, mode) => {
    const config = await resolveConfig(workflowRoot, {
      provider: 'grok',
      prompt: 'inspect only',
      workDir: '/tmp/project',
      mode,
    });

    expect(config).toMatchObject({
      type: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'suggest',
    });
  });

  it('bootstraps and persists provider defaults for a fresh workflow config', async () => {
    rmSync(join(workflowRoot, 'config.json'));

    const config = await resolveConfig(workflowRoot, {
      provider: 'grok',
      prompt: 'fresh install check',
      workDir: '/tmp/project',
    });

    expect(config).toMatchObject({
      type: 'grok',
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'suggest',
    });
    const persisted = JSON.parse(
      readFileSync(join(workflowRoot, 'config.json'), 'utf8'),
    ) as { settings?: { agents?: Record<string, unknown> } };
    expect(persisted.settings?.agents).toEqual(expect.objectContaining({
      'claude-code': expect.any(Object),
      codex: expect.any(Object),
      grok: expect.objectContaining({ model: 'grok-4.5', reasoningEffort: 'high' }),
    }));
  });

  it('ships the same Grok defaults in the maestro-init config template', () => {
    const template = JSON.parse(
      readFileSync(new URL('../../../templates/config.json', import.meta.url), 'utf8'),
    ) as { settings?: { agents?: Record<string, unknown> } };

    expect(template.settings?.agents?.['grok']).toEqual(expect.objectContaining({
      model: 'grok-4.5',
      reasoningEffort: 'high',
      approvalMode: 'suggest',
    }));
  });

  it('applies runtime model/effort override and explicit write approval', async () => {
    const config = await resolveConfig(workflowRoot, {
      provider: 'grok',
      prompt: 'implement change',
      workDir: '/tmp/project',
      mode: 'write',
      runtime: {
        model: 'grok-4.5-runtime',
        reasoningEffort: 'max',
        approvalMode: 'auto',
      },
    });

    expect(config).toMatchObject({
      type: 'grok',
      model: 'grok-4.5-runtime',
      reasoningEffort: 'max',
      approvalMode: 'auto',
    });
  });

  it('keeps explicit write mode authoritative over saved suggest approval', async () => {
    writeFileSync(join(workflowRoot, 'config.json'), JSON.stringify({
      settings: {
        agents: {
          grok: {
            model: 'grok-4.5',
            reasoningEffort: 'high',
            approvalMode: 'suggest',
          },
        },
      },
    }));

    const config = await resolveConfig(workflowRoot, {
      provider: 'grok',
      prompt: 'write without duplicate approval override',
      workDir: '/tmp/project',
      mode: 'write',
    });

    expect(config.approvalMode).toBe('auto');
  });

  it.each([
    ['runtime', { reasoningEffort: 'extreme' }],
    ['configured', undefined],
  ])('fails closed for invalid %s effort', async (source, runtime) => {
    if (source === 'configured') {
      writeFileSync(join(workflowRoot, 'config.json'), JSON.stringify({
        settings: { agents: { grok: { reasoningEffort: 'extreme' } } },
      }));
    }

    await expect(resolveConfig(workflowRoot, {
      provider: 'grok',
      prompt: 'invalid effort',
      workDir: '/tmp/project',
      runtime,
    })).rejects.toThrow(/Invalid (runtime|configured) reasoning effort: extreme/);
  });

  it('rejects unknown and unconfigured providers without fallback', async () => {
    await expect(resolveConfig(workflowRoot, {
      provider: 'mystery',
      prompt: 'unknown',
      workDir: '/tmp/project',
    })).rejects.toThrow(/Unknown agent provider: mystery/);

    await expect(resolveConfig(workflowRoot, {
      provider: 'qwen',
      prompt: 'not configured',
      workDir: '/tmp/project',
    })).rejects.toThrow(/Agent provider is not configured: qwen/);
  });
});
