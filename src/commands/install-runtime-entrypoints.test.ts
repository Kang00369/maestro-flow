import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  installAgyHooksByLevel,
  installHooksByLevel,
  installStatusline,
} from './hooks.js';
import { addExtraMcpServer, addMcpServer } from './install-backend.js';
import {
  getMaestroEntrypoint,
  getMaestroEntrypointCommand,
  getMaestroHookCommand,
  getMaestroPackageRoot,
} from '../utils/runtime-entrypoints.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'maestro-runtime-entrypoints-'));
  roots.push(root);
  return root;
}

describe('installed runtime entrypoints', () => {
  it('resolves package entrypoints in source test execution', () => {
    expect(getMaestroPackageRoot()).toBe(process.cwd());
    expect(getMaestroEntrypoint('maestro.js')).toBe(join(process.cwd(), 'bin', 'maestro.js'));
  });

  it('writes Node-backed Claude hooks and statusline commands', () => {
    const root = tempRoot();
    const settingsPath = join(root, 'settings.json');

    installHooksByLevel('standard', {
      settingsPath,
      selectedHooks: ['delegate-monitor'],
    });
    installStatusline({ settingsPath });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PostToolUse: Array<{ hooks: Array<{ command: string }> }> };
      statusLine: { command: string };
    };
    expect(settings.hooks.PostToolUse[0].hooks[0].command)
      .toBe(getMaestroHookCommand('delegate-monitor'));
    expect(settings.statusLine.command)
      .toBe(getMaestroEntrypointCommand('maestro-statusline.js'));
    expect(settings.statusLine.command).not.toBe('maestro-statusline');
  });

  it('writes Node-backed Antigravity hooks', () => {
    const root = tempRoot();
    const hooksPath = join(root, 'hooks.json');

    installAgyHooksByLevel('standard', {
      hooksPath,
      selectedHooks: ['delegate-monitor'],
    });

    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8')) as {
      'maestro-delegate-monitor': {
        PostToolUse: Array<{ hooks: Array<{ command: string }> }>;
      };
    };
    expect(hooks['maestro-delegate-monitor'].PostToolUse[0].hooks[0].command)
      .toBe(getMaestroHookCommand('delegate-monitor'));
  });

  it('writes Node-backed MCP configs for Claude and extra targets', () => {
    const root = tempRoot();
    const expected = {
      command: process.execPath,
      args: [getMaestroEntrypoint('maestro-mcp.js')],
    };

    const claudePath = addMcpServer('project', root, ['search']);
    expect(claudePath).toBe(join(root, '.mcp.json'));
    const claude = JSON.parse(readFileSync(claudePath!, 'utf8'));
    expect(claude.mcpServers['maestro-tools']).toMatchObject(expected);

    const cursorPath = addExtraMcpServer('cursor', 'project', root, ['search']);
    expect(cursorPath).toBe(join(root, '.cursor', 'mcp.json'));
    const cursor = JSON.parse(readFileSync(cursorPath!, 'utf8'));
    expect(cursor.mcpServers['maestro-tools']).toMatchObject(expected);
  });

  it.runIf(process.platform !== 'win32')('runs a non-executable script through Node', () => {
    const root = tempRoot();
    const scriptPath = join(root, 'non-executable.mjs');
    writeFileSync(scriptPath, 'process.stdout.write("ok")\n');
    chmodSync(scriptPath, 0o644);

    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('ok');
  });
});
