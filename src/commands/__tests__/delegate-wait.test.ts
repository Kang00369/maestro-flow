import { afterEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { DelegateExecutionNotFoundError, type DelegateWaitService } from '../../async/delegate-wait.js';
import { __setDelegateWaitServiceForTests, registerDelegateCommand } from '../delegate.js';

async function runWait(
  result: unknown,
  args: string[] = ['job-1'],
  delegateArgs: string[] = [],
) {
  const writes = { stdout: '', stderr: '' };
  const waitCalls: Array<[string, number | undefined]> = [];
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  const oldConsoleError = console.error;
  const oldExitCode = process.exitCode;
  process.stdout.write = ((chunk: unknown) => { writes.stdout += String(chunk); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { writes.stderr += String(chunk); return true; }) as typeof process.stderr.write;
  console.error = (message?: unknown) => { writes.stderr += `${String(message)}\n`; };
  __setDelegateWaitServiceForTests({ wait: async (execId: string, timeoutMs?: number) => {
    waitCalls.push([execId, timeoutMs]);
    if (result instanceof Error) throw result;
    return result;
  } } as DelegateWaitService);
  try {
    const program = new Command();
    program.exitOverride();
    registerDelegateCommand(program);
    await program.parseAsync(['delegate', ...delegateArgs, 'wait', ...args], { from: 'user' });
    return { ...writes, code: process.exitCode ?? 0, waitCalls };
  } finally {
    __setDelegateWaitServiceForTests(null);
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
    console.error = oldConsoleError;
    process.exitCode = oldExitCode;
  }
}

const terminal = (status: string, output: string, timed_out = false) => ({
  exec_id: 'job-1', status, timed_out, output, meta: null, job: null,
});

afterEach(() => __setDelegateWaitServiceForTests(null));

describe('delegate wait CLI', () => {
  it('blocks once until a running delegate completes', async () => {
    const result = await runWait(terminal('completed', 'finished'));
    expect(result).toMatchObject({
      code: 0,
      stdout: 'finished\n',
      waitCalls: [['job-1', undefined]],
    });
    expect(result.stderr).toContain('[DELEGATE COMPLETED]');
  });

  it('returns 124 without cancelling on wait timeout', async () => {
    const result = await runWait(terminal('running', 'partial', true), ['job-1', '--timeout', '25']);
    expect(result.code).toBe(124);
    expect(result.stdout).toBe('partial\n');
    expect(result.waitCalls).toEqual([['job-1', 25]]);
  });

  it('uses the wait subcommand timeout when the parent option is also present', async () => {
    const result = await runWait(
      terminal('completed', 'finished'),
      ['job-1', '--timeout', '25'],
      ['--timeout', '50'],
    );
    expect(result).toMatchObject({ code: 0, waitCalls: [['job-1', 25]] });
  });

  it('returns failed output with exit code 1', async () => {
    const result = await runWait(terminal('failed', 'failure details'));
    expect(result).toMatchObject({ code: 1, stdout: 'failure details\n' });
  });

  it('returns cancelled output with exit code 130', async () => {
    const result = await runWait(terminal('cancelled', 'partial'));
    expect(result.code).toBe(130);
  });

  it('accepts completed jobs with empty output', async () => {
    const result = await runWait(terminal('completed', ''));
    expect(result).toMatchObject({ code: 0, stdout: '' });
  });

  it('returns 1 for an unknown execution', async () => {
    const result = await runWait(new DelegateExecutionNotFoundError('Delegate execution not found: missing'));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it('rejects unsafe execution IDs before invoking the wait service', async () => {
    const result = await runWait(terminal('completed', 'should not appear'), ['../outside']);
    expect(result).toMatchObject({ code: 1, stdout: '', waitCalls: [] });
    expect(result.stderr).toContain('Invalid delegate execution ID');
  });

  it('rejects fractional and oversized timeouts before invoking the wait service', async () => {
    const fractional = await runWait(terminal('completed', ''), ['job-1', '--timeout', '1.5']);
    const oversized = await runWait(
      terminal('completed', ''),
      ['job-1'],
      ['--timeout', '2147483648'],
    );

    expect(fractional).toMatchObject({ code: 1, waitCalls: [] });
    expect(oversized).toMatchObject({ code: 1, waitCalls: [] });
    expect(fractional.stderr).toContain('Invalid timeout');
    expect(oversized.stderr).toContain('Invalid timeout');
  });
});
