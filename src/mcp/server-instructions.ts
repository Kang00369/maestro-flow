const DELEGATE_CHANNEL_INSTRUCTIONS =
  'Delegate task notifications arrive as <channel source="maestro" exec_id="..." event_type="..." status="...">. ' +
  'These are one-way status updates from async delegate workers. ' +
  'When a delegate completes or fails, report its terminal status.';

const DELEGATE_DIAGNOSTIC_INSTRUCTIONS =
  'For full output after a terminal notification, run "maestro delegate output <exec_id>" exactly once. ' +
  'Do not poll status or output.';

export function resolveEnabledMcpTools(
  configuredTools: string[],
  envTools: string | undefined = process.env.MAESTRO_ENABLED_TOOLS,
): string[] {
  return envTools
    ? envTools.split(',').map((tool) => tool.trim()).filter(Boolean)
    : configuredTools;
}

export function buildMcpServerInstructions(enabledTools: string[]): string {
  if (!enabledTools.includes('all') && !enabledTools.includes('delegate_wait')) {
    return `${DELEGATE_CHANNEL_INSTRUCTIONS} ${DELEGATE_DIAGNOSTIC_INSTRUCTIONS}`;
  }
  return DELEGATE_CHANNEL_INSTRUCTIONS + ' ' +
    'When an async result is needed, call delegate_wait exactly once and await its terminal result. ' +
    'status/output remain diagnostics and must not be used as polling primitives.';
}
