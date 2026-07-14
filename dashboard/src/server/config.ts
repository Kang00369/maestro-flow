import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { AgentConfig, AgentType } from '../shared/agent-types.js';

// ---------------------------------------------------------------------------
// Dashboard configuration
// ---------------------------------------------------------------------------

export interface DashboardConfig {
  port: number;
  host: string;
  debounce_ms: number;
  polling_fallback: boolean;
  heartbeat_interval_ms: number;
  max_connections: number;
  workflow_root: string;
}

const DEFAULT_CONFIG: DashboardConfig = {
  port: 3001,
  host: '127.0.0.1',
  debounce_ms: 150,
  polling_fallback: false,
  heartbeat_interval_ms: 30_000,
  max_connections: 10,
  // The dashboard lives in dashboard/ so the project .workflow is one level up.
  // Override via WORKFLOW_ROOT env var or dashboard.workflow_root in config.json.
  workflow_root: '../.workflow',
};

/**
 * Load dashboard configuration from .workflow/config.json `dashboard` section.
 * Falls back to defaults when file is missing or section is absent.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<DashboardConfig> {
  const configPath = resolve(cwd, '.workflow', 'config.json');

  try {
    const raw = await readFile(configPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const section = (json['dashboard'] ?? {}) as Partial<DashboardConfig>;

    return applyEnvOverrides({ ...DEFAULT_CONFIG, ...section });
  } catch {
    // Config file missing or unreadable — use defaults
    return applyEnvOverrides({ ...DEFAULT_CONFIG });
  }
}

// ---------------------------------------------------------------------------
// Agent settings loader — reads saved per-agent config from .workflow/config.json
// ---------------------------------------------------------------------------

export interface SavedAgentSettings {
  model?: string;
  approvalMode?: 'suggest' | 'auto';
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  baseUrl?: string;
  apiKey?: string;
  settingsFile?: string;
  envFile?: string;
}

export const DEFAULT_DASHBOARD_AGENT_SETTINGS: Record<string, SavedAgentSettings> = {
  'claude-code': { model: '', approvalMode: 'suggest' },
  codex: { model: '', approvalMode: 'suggest' },
  'codex-server': { model: '', approvalMode: 'suggest' },
  grok: { model: 'grok-4.5', approvalMode: 'suggest', reasoningEffort: 'high' },
  gemini: { model: '', approvalMode: 'suggest' },
  'gemini-a2a': { model: '', approvalMode: 'suggest' },
  qwen: { model: '', approvalMode: 'suggest' },
  opencode: { model: '', approvalMode: 'suggest' },
  'agent-sdk': { model: '', approvalMode: 'suggest' },
};

export type AgentExecutionMode = 'analysis' | 'write';
export type AgentReasoningEffort = NonNullable<AgentConfig['reasoningEffort']>;

export type AgentExecutionRuntimeConfig = Partial<Omit<
  AgentConfig,
  'type' | 'prompt' | 'workDir' | 'model' | 'approvalMode' | 'reasoningEffort'
>> & {
  model?: unknown;
  approvalMode?: unknown;
  reasoningEffort?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  settingsFile?: unknown;
  envFile?: unknown;
};

export interface AgentExecutionConfigRequest {
  provider: unknown;
  prompt: unknown;
  workDir: unknown;
  mode?: unknown;
  runtime?: AgentExecutionRuntimeConfig;
}

export class AgentExecutionConfigError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'AgentExecutionConfigError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bootstrap a fresh project once, while preserving partial/customized agent
 * maps. A non-empty map remains authoritative: a missing provider in that map
 * is still a hard configuration failure rather than an implicit fallback.
 */
export async function ensureDashboardAgentSettings(workflowRoot: string): Promise<boolean> {
  const configPath = join(workflowRoot, 'config.json');
  let config: Record<string, unknown> = {};

  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new AgentExecutionConfigError('Invalid Dashboard config: expected a JSON object');
    }
    config = parsed;
  } catch (error) {
    const code = isRecord(error) && typeof error['code'] === 'string' ? error['code'] : undefined;
    if (code !== 'ENOENT') {
      if (error instanceof AgentExecutionConfigError) throw error;
      throw new AgentExecutionConfigError(
        `Invalid Dashboard config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const settings = isRecord(config['settings']) ? config['settings'] : {};
  const agents = isRecord(settings['agents']) ? settings['agents'] : undefined;
  if (agents && Object.keys(agents).length > 0) return false;

  settings['agents'] = DEFAULT_DASHBOARD_AGENT_SETTINGS;
  config['settings'] = settings;
  await mkdir(workflowRoot, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  return true;
}

const EXECUTION_PROVIDERS = new Set<AgentType>([
  'claude-code',
  'codex',
  'codex-server',
  'grok',
  'gemini',
  'gemini-a2a',
  'qwen',
  'opencode',
  'agy',
  'api-explore',
  'agent-sdk',
]);

const REASONING_EFFORTS = new Set<AgentReasoningEffort>([
  'low', 'medium', 'high', 'max',
]);

function resolveProvider(value: unknown): AgentType {
  if (typeof value !== 'string' || !EXECUTION_PROVIDERS.has(value as AgentType)) {
    throw new AgentExecutionConfigError(`Unknown agent provider: ${String(value)}`);
  }
  return value as AgentType;
}

function resolveMode(value: unknown): AgentExecutionMode | undefined {
  if (value === undefined) return undefined;
  if (value !== 'analysis' && value !== 'write') {
    throw new AgentExecutionConfigError(`Invalid agent execution mode: ${String(value)}`);
  }
  return value;
}

function resolveApproval(value: unknown, source: string): AgentConfig['approvalMode'] {
  if (value === undefined) return undefined;
  if (value !== 'suggest' && value !== 'auto') {
    throw new AgentExecutionConfigError(`Invalid ${source} approval mode: ${String(value)}`);
  }
  return value;
}

function resolveEffort(value: unknown, source: string): AgentReasoningEffort | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !REASONING_EFFORTS.has(value as AgentReasoningEffort)) {
    throw new AgentExecutionConfigError(`Invalid ${source} reasoning effort: ${String(value)}`);
  }
  return value as AgentReasoningEffort;
}

function resolveOptionalString(
  runtimeValue: unknown,
  configuredValue: unknown,
  field: string,
): string | undefined {
  const value = runtimeValue ?? configuredValue;
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AgentExecutionConfigError(`Invalid ${field}: expected a string`);
  }
  return value;
}

/**
 * Resolve one Dashboard execution config for WS, REST, or scheduler callers.
 * Runtime values override only the explicitly selected provider. Remote calls
 * remain read-only unless they explicitly request write/auto semantics.
 */
export async function resolveAgentExecutionConfig(
  workflowRoot: string,
  request: AgentExecutionConfigRequest,
): Promise<AgentConfig> {
  const provider = resolveProvider(request.provider);
  if (typeof request.prompt !== 'string' || request.prompt.length === 0) {
    throw new AgentExecutionConfigError('Missing or invalid agent prompt');
  }
  if (typeof request.workDir !== 'string' || request.workDir.length === 0) {
    throw new AgentExecutionConfigError('Missing or invalid agent workDir');
  }

  await ensureDashboardAgentSettings(workflowRoot);
  const saved = await loadDashboardAgentSettings(workflowRoot, provider);
  if (!saved) {
    throw new AgentExecutionConfigError(`Agent provider is not configured: ${provider}`);
  }

  const runtime = request.runtime ?? {};
  const mode = resolveMode(request.mode);
  const runtimeApproval = resolveApproval(runtime.approvalMode, 'runtime');
  resolveApproval(saved.approvalMode, 'configured');
  const explicitWrite = mode === 'write' || runtimeApproval === 'auto';
  const approvalMode = explicitWrite ? 'auto' : 'suggest';

  const runtimeEffort = resolveEffort(runtime.reasoningEffort, 'runtime');
  const configuredEffort = resolveEffort(saved.reasoningEffort, 'configured');

  return {
    type: provider,
    prompt: request.prompt,
    workDir: request.workDir,
    env: runtime.env,
    model: resolveOptionalString(runtime.model, saved.model, 'model'),
    approvalMode,
    reasoningEffort: runtimeEffort ?? configuredEffort,
    baseUrl: resolveOptionalString(runtime.baseUrl, saved.baseUrl, 'baseUrl'),
    apiKey: resolveOptionalString(runtime.apiKey, saved.apiKey, 'apiKey'),
    settingsFile: resolveOptionalString(runtime.settingsFile, saved.settingsFile, 'settingsFile'),
    envFile: resolveOptionalString(runtime.envFile, saved.envFile, 'envFile'),
    format: runtime.format,
    interactive: runtime.interactive,
    mcpConfigPath: runtime.mcpConfigPath,
    metadata: runtime.metadata,
    streamTimeoutMs: runtime.streamTimeoutMs,
  };
}

/**
 * Load saved agent settings from `.workflow/config.json` → `settings.agents[type]`.
 * Returns undefined if file is missing or agent type has no saved settings.
 */
export async function loadDashboardAgentSettings(
  workflowRoot: string,
  agentType: AgentType,
): Promise<SavedAgentSettings | undefined> {
  const configPath = join(workflowRoot, 'config.json');
  try {
    const raw = await readFile(configPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const settings = json['settings'] as Record<string, unknown> | undefined;
    if (!settings) return undefined;
    const agents = settings['agents'] as Record<string, SavedAgentSettings> | undefined;
    if (!agents) return undefined;
    return agents[agentType] ?? undefined;
  } catch {
    return undefined;
  }
}

/** Environment variable overrides for CLI integration (e.g. `maestro view --port`). */
function applyEnvOverrides(config: DashboardConfig): DashboardConfig {
  if (process.env.PORT) {
    const p = parseInt(process.env.PORT, 10);
    if (!isNaN(p)) config.port = p;
  }
  if (process.env.HOST) {
    config.host = process.env.HOST;
  }
  if (process.env.WORKFLOW_ROOT) {
    config.workflow_root = process.env.WORKFLOW_ROOT;
  }
  return config;
}
