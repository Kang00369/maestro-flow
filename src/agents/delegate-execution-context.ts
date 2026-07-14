// ---------------------------------------------------------------------------
// Delegate execution context
// ---------------------------------------------------------------------------

/**
 * Set only on the CLI agent process spawned by `maestro delegate`.
 *
 * A nested `maestro delegate` inherits this value through the agent's shell
 * and must fail before it creates history, broker state, or another process.
 */
export const MAESTRO_DELEGATE_CONTEXT_ENV = 'MAESTRO_DELEGATE_CONTEXT';

export class RecursiveDelegateError extends Error {
  readonly code = 'E_DELEGATE_RECURSION';

  constructor(readonly parentExecId: string) {
    super(
      `Recursive maestro delegate is forbidden inside Delegate execution ${parentExecId}. ` +
      'The current worker must complete its bounded task itself or return failure to the coordinator.',
    );
    this.name = 'RecursiveDelegateError';
  }
}

export function assertDelegateEntryAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const parentExecId = env[MAESTRO_DELEGATE_CONTEXT_ENV]?.trim();
  if (parentExecId) {
    throw new RecursiveDelegateError(parentExecId);
  }
}

export function buildDelegateAgentEnv(
  parentExecId: string,
  baseEnv: Record<string, string> = {},
): Record<string, string> {
  const normalizedExecId = parentExecId.trim();
  if (!normalizedExecId) {
    throw new Error('Delegate execution context requires a non-empty execution ID.');
  }

  return {
    ...baseEnv,
    [MAESTRO_DELEGATE_CONTEXT_ENV]: normalizedExecId,
  };
}
