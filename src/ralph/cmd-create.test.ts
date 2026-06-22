import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCreate } from './cmd-create.js';
import { runNext } from './cmd-next.js';
import { runFinish, runPause } from './cmd-state.js';

const originalCwd = process.cwd();
let workDir = '';

beforeEach(() => {
  workDir = join(tmpdir(), `maestro-ralph-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workDir, { recursive: true });
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('ralph create', () => {
  it('creates a CLI-owned ralph status.json from step specs', async () => {
    createCodexSkill('test-step');

    const code = await runCreate({
      intent: 'test intent',
      steps: ['test-step "abc"', 'decision:post-test'],
      platform: 'codex',
    });

    expect(code).toBe(0);
    const status = readOnlySession();
    expect(status.source).toBe('ralph');
    expect(status.status).toBe('running');
    expect(status.platform).toBe('codex');
    expect(status.steps).toHaveLength(2);
    expect(status.steps[0]).toMatchObject({
      index: 0,
      skill: 'test-step',
      args: '"abc"',
      status: 'pending',
      completion_confirmed: false,
      command_scope: 'project',
    });
    expect(status.steps[0].command_path).toContain('/.codex/skills/test-step/SKILL.md');
    expect(status.steps[1]).toMatchObject({
      index: 1,
      skill: '',
      decision: 'post-test',
      command_scope: null,
      command_path: null,
    });
  });

  it('blocks creating a second running session unless explicitly allowed', async () => {
    createCodexSkill('test-step');
    writeRunningSession('ralph-existing');

    const code = await runCreate({
      intent: 'new intent',
      steps: ['test-step'],
      platform: 'codex',
    });

    expect(code).toBe(2);
    expect(readdirSync(join(workDir, '.workflow', '.maestro'))).toEqual(['ralph-existing']);
  });
});

describe('ralph execution guard', () => {
  it('refuses implicit next when multiple sessions are running', async () => {
    writeRunningSession('ralph-a');
    writeRunningSession('ralph-b');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = await runNext({});

    expect(code).toBe(2);
    expect(err.mock.calls.flat().join('\n')).toContain('W003: multiple running maestro/ralph sessions detected');
    expect(err.mock.calls.flat().join('\n')).toContain('Pass --session <id>');
  });
});

describe('ralph session state commands', () => {
  it('pauses a running session by explicit id', async () => {
    writeRunningSession('ralph-a');

    const code = await runPause({ sessionId: 'ralph-a', reason: 'stale' });

    expect(code).toBe(0);
    const status = readSession('ralph-a');
    expect(status.status).toBe('paused');
    expect(status.pause_reason).toBe('stale');
  });

  it('requires --force before finishing a session with unfinished steps', async () => {
    writeRunningSession('ralph-a', [{
      index: 0,
      skill: 'test-step',
      args: '',
      stage: 'test',
      decision: null,
      command_scope: 'project',
      command_path: '/tmp/test-step/SKILL.md',
      status: 'pending',
      completion_confirmed: false,
      completion_status: null,
      completion_evidence: null,
      completed_at: null,
    }]);

    expect(await runFinish({ sessionId: 'ralph-a' })).toBe(2);
    expect(readSession('ralph-a').status).toBe('running');

    expect(await runFinish({ sessionId: 'ralph-a', force: true })).toBe(0);
    expect(readSession('ralph-a').status).toBe('completed');
  });
});

function createCodexSkill(name: string): void {
  const dir = join(workDir, '.codex', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    'description: test skill',
    '---',
    'body',
    '',
  ].join('\n'));
}

function writeRunningSession(sessionId: string, steps: any[] = []): void {
  const dir = join(workDir, '.workflow', '.maestro', sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'status.json'), JSON.stringify({
    session_id: sessionId,
    source: 'ralph',
    status: 'running',
    intent: 'existing',
    lifecycle_position: 'test',
    phase: null,
    milestone: '',
    steps,
  }));
}

function readOnlySession(): any {
  const root = join(workDir, '.workflow', '.maestro');
  const sessions = readdirSync(root);
  expect(sessions).toHaveLength(1);
  return JSON.parse(readFileSync(join(root, sessions[0], 'status.json'), 'utf8'));
}

function readSession(sessionId: string): any {
  return JSON.parse(readFileSync(join(workDir, '.workflow', '.maestro', sessionId, 'status.json'), 'utf8'));
}
