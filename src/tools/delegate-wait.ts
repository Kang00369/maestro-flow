import { MAX_DELEGATE_WAIT_TIMEOUT_MS } from '../async/delegate-broker.js';
import { DelegateExecutionNotFoundError, DelegateWaitService } from '../async/delegate-wait.js';
import { requireValidDelegateExecId } from '../async/delegate-exec-id.js';
import type { CcwToolResult, ToolSchema } from '../types/tool-schema.js';

let delegateWaitServiceForTests: DelegateWaitService | null = null;

export function __setDelegateWaitServiceForTests(service: DelegateWaitService | null): void {
  delegateWaitServiceForTests = service;
}

export const schema: ToolSchema = {
  name: 'delegate_wait',
  description: 'Wait once for an async delegate execution to reach a terminal state.',
  inputSchema: {
    type: 'object',
    properties: {
      exec_id: { type: 'string', description: 'Delegate execution ID' },
      timeout_ms: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_DELEGATE_WAIT_TIMEOUT_MS,
        description: 'Optional caller wait timeout in milliseconds',
      },
    },
    required: ['exec_id'],
  },
};

export async function handler(params: Record<string, unknown>, signal?: AbortSignal): Promise<CcwToolResult> {
  const rawExecId = typeof params.exec_id === 'string' ? params.exec_id : '';
  if (!rawExecId.trim()) return { success: false, error: 'Parameter "exec_id" is required' };
  let execId: string;
  try {
    execId = requireValidDelegateExecId(rawExecId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  const timeoutMs = params.timeout_ms;
  if (timeoutMs !== undefined && (
    typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > MAX_DELEGATE_WAIT_TIMEOUT_MS
  )) {
    return { success: false, error: `Parameter "timeout_ms" must be between 1 and ${MAX_DELEGATE_WAIT_TIMEOUT_MS}` };
  }

  const service = delegateWaitServiceForTests ?? new DelegateWaitService();
  try {
    return { success: true, result: await service.wait(execId, timeoutMs as number | undefined, signal) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: error instanceof DelegateExecutionNotFoundError ? message : `Delegate wait failed: ${message}`,
    };
  } finally {
    if (!delegateWaitServiceForTests) service.close();
  }
}
