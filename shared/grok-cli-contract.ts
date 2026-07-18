// ---------------------------------------------------------------------------
// Grok headless CLI contract shared by the adapter and compatibility smoke
// tests. Keep provider-specific flags in one place so a CLI upgrade fails
// loudly instead of silently changing Delegate behaviour.
// ---------------------------------------------------------------------------

/** Flags required by Maestro's Grok headless adapter. */
export const GROK_CLI_REQUIRED_FLAGS = [
  '--prompt-file',
  '--output-format',
  '--model',
  '--reasoning-effort',
  '--permission-mode',
  '--sandbox',
  '--session-id',
  '--resume',
] as const;

export type GrokSessionMode = 'new' | 'resume';

export interface GrokSessionBridge {
  id: string;
  mode: GrokSessionMode;
}

const UUID_PATTERN =
  // Grok currently creates UUIDv7 sessions, while callers may supply UUIDv4;
  // accept all RFC 4122/9562 version nibbles and the standard variant.
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Grok headless `--session-id` and persisted session IDs are UUIDs. */
export function isValidGrokSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Read the opaque metadata passed through AgentConfig.
 *
 * A known ID without a mode is treated as a resume for compatibility with
 * metadata written by an earlier bridge revision.
 */
export function readGrokSessionBridge(
  metadata?: Record<string, unknown>,
): GrokSessionBridge | undefined {
  if (!metadata) return undefined;

  const rawId = metadata.providerSessionId ?? metadata.grokSessionId;
  const rawMode = metadata.providerSessionMode ?? metadata.grokSessionMode;
  if (rawId === undefined && rawMode === undefined) return undefined;

  if (!isValidGrokSessionId(rawId)) {
    throw new Error(
      `Invalid Grok provider session ID: ${String(rawId)}. Expected a UUID.`,
    );
  }

  const mode = rawMode === undefined ? 'resume' : rawMode;
  if (mode !== 'new' && mode !== 'resume') {
    throw new Error(
      `Invalid Grok provider session mode: ${String(mode)}. Expected new or resume.`,
    );
  }

  return { id: rawId, mode };
}

/** Translate bridge metadata into Grok CLI argv. */
export function buildGrokSessionArgs(
  metadata?: Record<string, unknown>,
): string[] {
  const bridge = readGrokSessionBridge(metadata);
  if (!bridge) return [];
  return bridge.mode === 'new'
    ? ['--session-id', bridge.id]
    : ['--resume', bridge.id];
}

function hasFlag(helpText: string, flag: string): boolean {
  // Avoid accepting a prose mention of a flag without requiring an option
  // token. `--flag`, `--flag <value>`, and `--flag=<value>` all qualify.
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(?=\\s|=|$)`, 'm').test(helpText);
}

/** Return the required flags absent from `grok --help`. */
export function missingGrokCliContractFlags(helpText: string): string[] {
  return GROK_CLI_REQUIRED_FLAGS.filter((flag) => !hasFlag(helpText, flag));
}

/** Throw a concise compatibility error for a changed Grok CLI. */
export function assertGrokCliHelpContract(helpText: string): void {
  const missing = missingGrokCliContractFlags(helpText);
  if (missing.length > 0) {
    throw new Error(`Grok CLI contract mismatch; missing flags: ${missing.join(', ')}`);
  }
}
