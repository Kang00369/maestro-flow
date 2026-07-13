import { afterEach, describe, it, expect, vi } from 'vitest';
import { normalizeHookPayload } from '../hooks.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeHookPayload', () => {
  it('maps Grok camelCase fields to Claude snake_case', () => {
    const data = normalizeHookPayload({
      sessionId: 'sess-1',
      toolName: 'run_terminal_command',
      hookEventName: 'pre_tool_use',
      toolInput: { command: 'ls', filePath: '/tmp/a.ts' },
      workspaceRoot: '/proj',
    });
    expect(data.session_id).toBe('sess-1');
    expect(data.tool_name).toBe('run_terminal_command');
    expect(data.hook_event_name).toBe('pre_tool_use');
    expect((data.tool_input as { command: string }).command).toBe('ls');
    expect((data.tool_input as { file_path: string }).file_path).toBe('/tmp/a.ts');
    expect(data.cwd).toBe('/proj');
  });

  it('keeps existing snake_case fields', () => {
    const data = normalizeHookPayload({
      session_id: 's2',
      sessionId: 'ignored-session',
      tool_name: 'Bash',
      toolName: 'ignored-tool',
      hook_event_name: 'PostToolUse',
      tool_input: { file_path: '/tmp/snake.ts', filePath: '/tmp/camel.ts' },
    });
    expect(data.session_id).toBe('s2');
    expect(data.tool_name).toBe('Bash');
    expect((data.tool_input as { file_path: string }).file_path).toBe('/tmp/snake.ts');
  });

  it('uses the Grok session environment only when payload session fields are absent', () => {
    vi.stubEnv('GROK_SESSION_ID', 'grok-env-session');
    vi.stubEnv('CLAUDE_SESSION_ID', 'claude-env-session');

    const fromEnv = normalizeHookPayload({});
    const fromPayload = normalizeHookPayload({ sessionId: 'payload-session' });

    expect(fromEnv.session_id).toBe('grok-env-session');
    expect(fromPayload.session_id).toBe('payload-session');
  });

  it('normalizes prompt and path aliases without overwriting canonical values', () => {
    const aliased = normalizeHookPayload({
      promptText: 'aliased prompt',
      toolInput: { path: '/tmp/aliased.ts' },
    });
    const canonical = normalizeHookPayload({
      user_prompt: 'canonical prompt',
      promptText: 'ignored prompt',
    });

    expect(aliased.prompt).toBe('aliased prompt');
    expect((aliased.tool_input as { file_path: string }).file_path).toBe('/tmp/aliased.ts');
    expect(canonical.user_prompt).toBe('canonical prompt');
    expect(canonical.prompt).toBeUndefined();
  });
});
