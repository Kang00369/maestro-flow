import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installHooksByLevel } from '../hooks.js';
import { COMPONENT_DEFS } from '../../core/component-defs.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Grok install compatibility', () => {
  it('registers project-scoped Grok instruction components', () => {
    const projectRoot = join(tmpdir(), 'maestro-grok-project');
    const agents = COMPONENT_DEFS.find(def => def.id === 'grok-agents-md');
    const chinese = COMPONENT_DEFS.find(def => def.id === 'grok-md-chinese');

    expect(agents).toMatchObject({ platform: 'grok', inject: true });
    expect(chinese).toMatchObject({ platform: 'grok', inject: true, section: 'chinese' });
    expect(agents?.target('project', projectRoot)).toBe(join(projectRoot, 'AGENTS.md'));
    expect(chinese?.target('project', projectRoot)).toBe(join(projectRoot, 'AGENTS.md'));
  });

  it('omits Claude SessionStart matchers so Grok compatibility can import them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maestro-grok-hooks-'));
    tempDirs.push(dir);
    const settingsPath = join(dir, 'settings.json');

    installHooksByLevel('standard', { settingsPath });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };
    const sessionStart = settings.hooks.SessionStart ?? [];
    const preToolUse = settings.hooks.PreToolUse ?? [];

    expect(sessionStart.length).toBeGreaterThan(0);
    expect(sessionStart.every(group => group.matcher === undefined)).toBe(true);
    expect(preToolUse.some(group => group.matcher !== undefined)).toBe(true);
  });
});
