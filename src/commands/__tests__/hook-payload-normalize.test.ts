import { describe, it, expect } from 'vitest';
import { normalizeHookPayload } from '../hooks.js';

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
      tool_name: 'Bash',
      hook_event_name: 'PostToolUse',
    });
    expect(data.session_id).toBe('s2');
    expect(data.tool_name).toBe('Bash');
  });
});
