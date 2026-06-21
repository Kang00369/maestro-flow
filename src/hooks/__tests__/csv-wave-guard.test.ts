import { describe, expect, it } from 'vitest';
import { evaluateCsvWaveGuard } from '../csv-wave-guard.js';

describe('evaluateCsvWaveGuard', () => {
  it('ignores unrelated tools', () => {
    expect(evaluateCsvWaveGuard({
      tool_name: 'exec_command',
      tool_input: { result: {} },
    })).toEqual({ blocked: false });
  });

  it('blocks empty report_agent_job_result payloads', () => {
    const result = evaluateCsvWaveGuard({
      tool_name: 'report_agent_job_result',
      tool_input: {
        job_id: 'job-1',
        item_id: 'row-1',
        result: {},
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('Never report `{}`');
  });

  it('blocks missing report_agent_job_result payloads', () => {
    expect(evaluateCsvWaveGuard({
      tool_name: 'report_agent_job_result',
      tool_input: {
        job_id: 'job-1',
        item_id: 'row-1',
      },
    }).blocked).toBe(true);
  });

  it('allows non-empty report_agent_job_result payloads', () => {
    expect(evaluateCsvWaveGuard({
      tool_name: 'report_agent_job_result',
      tool_input: {
        job_id: 'job-1',
        item_id: 'row-1',
        result: { id: 'row-1', result_status: 'completed', findings: 'done' },
      },
    })).toEqual({ blocked: false });
  });

  it('blocks spawn_agents_on_csv without output_schema', () => {
    const result = evaluateCsvWaveGuard({
      tool_name: 'spawn_agents_on_csv',
      tool_input: {
        csv_path: 'tasks.csv',
        instruction: 'Process {id}',
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('without output_schema');
  });

  it('blocks spawn_agents_on_csv with an empty output_schema', () => {
    const result = evaluateCsvWaveGuard({
      tool_name: 'spawn_agents_on_csv',
      tool_input: {
        csv_path: 'tasks.csv',
        instruction: 'Process {id}',
        output_schema: {},
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('without output_schema');
  });

  it('blocks spawn_agents_on_csv with a weak output_schema', () => {
    const result = evaluateCsvWaveGuard({
      tool_name: 'spawn_agents_on_csv',
      tool_input: {
        csv_path: 'tasks.csv',
        instruction: 'Process {id}',
        output_schema: { type: 'object' },
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('weak output_schema');
  });

  it('injects anti-empty contract into strict spawn_agents_on_csv calls', () => {
    const result = evaluateCsvWaveGuard({
      tool_name: 'spawn_agents_on_csv',
      tool_input: {
        csv_path: 'tasks.csv',
        id_column: 'task_id',
        instruction: 'Process {task_id}',
        output_csv_path: '.workflow/.csv-wave/wave-1-results.csv',
        output_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            result_status: { type: 'string' },
            findings: { type: 'string' },
          },
          required: ['task_id', 'result_status', 'findings'],
        },
      },
    });

    expect(result.blocked).toBe(false);
    expect(result.updatedInput?.instruction).toContain('[MaestroCsvWaveContract:v2]');
    expect(result.updatedInput?.instruction).toContain('task_id, result_status, findings');
    expect(result.updatedInput?.instruction).toContain('.workflow/.csv-wave/wave-1-results.csv.artifacts/<safe-row-id>.json');
  });

  it('does not inject duplicate anti-empty contracts', () => {
    const result = evaluateCsvWaveGuard({
      tool_name: 'spawn_agents_on_csv',
      tool_input: {
        csv_path: 'tasks.csv',
        instruction: 'Process {id}\n\n[MaestroCsvWaveContract:v2]',
        output_schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    });

    expect(result).toEqual({ blocked: false });
  });
});
