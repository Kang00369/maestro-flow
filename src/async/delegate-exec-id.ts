const DELEGATE_EXEC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function normalizeDelegateExecId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('cli-history-')
    ? trimmed.slice('cli-history-'.length)
    : trimmed;
}

export function requireValidDelegateExecId(value: string): string {
  const execId = normalizeDelegateExecId(value);
  if (!DELEGATE_EXEC_ID_PATTERN.test(execId)) {
    throw new Error(
      'Invalid delegate execution ID: use 1-128 letters, numbers, dots, underscores, or hyphens',
    );
  }
  return execId;
}
