export interface CsvWaveGuardInput {
  tool_name?: unknown;
  tool_input?: unknown;
}

export interface CsvWaveGuardResult {
  blocked: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
}

const CSV_WAVE_CONTRACT_MARKER = '[MaestroCsvWaveContract:v2]';

export function evaluateCsvWaveGuard(input: CsvWaveGuardInput): CsvWaveGuardResult {
  if (input.tool_name === 'spawn_agents_on_csv') {
    return evaluateSpawnAgentsOnCsv(input);
  }

  if (input.tool_name !== 'report_agent_job_result') {
    return { blocked: false };
  }

  const toolInput = asRecord(input.tool_input);
  const result = asRecord(toolInput?.result);
  if (!result || Object.keys(result).length === 0) {
    return {
      blocked: true,
      reason: [
        '[CsvWaveGuard] Blocked empty report_agent_job_result payload.',
        'The `result` argument must be a non-empty JSON object matching the expected result schema for this CSV row.',
        'Rebuild the final object from the row and task evidence, then call report_agent_job_result again with that object. Never report `{}`.',
      ].join('\n'),
    };
  }

  return { blocked: false };
}

function evaluateSpawnAgentsOnCsv(input: CsvWaveGuardInput): CsvWaveGuardResult {
  const toolInput = asRecord(input.tool_input);
  if (!toolInput) {
    return {
      blocked: true,
      reason: '[CsvWaveGuard] spawn_agents_on_csv tool_input must be a JSON object.',
    };
  }

  const outputSchema = asRecord(toolInput.output_schema);
  if (!outputSchema || Object.keys(outputSchema).length === 0) {
    return {
      blocked: true,
      reason: [
        '[CsvWaveGuard] Blocked spawn_agents_on_csv without output_schema.',
        'Codex shows workers "{}" as the expected schema when output_schema is omitted, which makes empty report_agent_job_result payloads much more likely.',
        'Add a strict object output_schema with required fields such as id, result_status, and findings.',
      ].join('\n'),
    };
  }

  const schemaFields = schemaResultFields(outputSchema);
  if (schemaFields.length === 0 && minProperties(outputSchema) < 1) {
    return {
      blocked: true,
      reason: [
        '[CsvWaveGuard] Blocked spawn_agents_on_csv with a weak output_schema.',
        'The schema must define required fields, properties, or minProperties >= 1 so workers have a concrete non-empty result shape.',
      ].join('\n'),
    };
  }

  const instruction = typeof toolInput.instruction === 'string' ? toolInput.instruction : '';
  if (!instruction.trim()) {
    return { blocked: false };
  }

  if (instruction.includes(CSV_WAVE_CONTRACT_MARKER)) {
    return { blocked: false };
  }

  return {
    blocked: false,
    updatedInput: {
      ...toolInput,
      instruction: `${instruction.trimEnd()}\n\n${buildAntiEmptyContract(toolInput, schemaFields)}`,
    },
  };
}

function buildAntiEmptyContract(
  toolInput: Record<string, unknown>,
  schemaFields: string[],
): string {
  const idColumn = typeof toolInput.id_column === 'string' && toolInput.id_column.trim()
    ? toolInput.id_column.trim()
    : 'id';
  const fields = schemaFields.length > 0
    ? schemaFields.join(', ')
    : 'at least one schema-valid field';
  const artifactDir = artifactDirFor(toolInput);

  return [
    CSV_WAVE_CONTRACT_MARKER,
    'Maestro CSV Wave anti-empty-result contract:',
    `1. Build the final result object before calling report_agent_job_result. It MUST NOT be {} and should include: ${fields}.`,
    `2. Use the row id from CSV column "${idColumn}". If that field exists in output_schema, copy the same id into result.${idColumn}.`,
    '3. If the task is blocked or fails, still report a non-empty object with the row id, result_status="blocked" or "failed", findings, and error when those fields exist.',
    `4. Before report_agent_job_result, write the exact same JSON object to ${artifactDir}/<safe-row-id>.json.`,
    '   safe-row-id replaces every character outside [A-Za-z0-9._-] with "_".',
    '5. Call report_agent_job_result exactly once, using that exact non-empty object as result. If a hook blocks {}, rebuild the object from task evidence; do not retry with {}.',
  ].join('\n');
}

function schemaResultFields(schema: Record<string, unknown>): string[] {
  const required = asStringArray(schema.required);
  if (required.length > 0) return required;

  const properties = asRecord(schema.properties);
  if (properties) return Object.keys(properties);

  return [];
}

function minProperties(schema: Record<string, unknown>): number {
  const value = schema.minProperties;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function artifactDirFor(toolInput: Record<string, unknown>): string {
  if (typeof toolInput.output_csv_path === 'string' && toolInput.output_csv_path.trim()) {
    return `${toolInput.output_csv_path.trim()}.artifacts`;
  }
  if (typeof toolInput.csv_path === 'string' && toolInput.csv_path.trim()) {
    return `${toolInput.csv_path.trim()}.artifacts`;
  }
  return '.workflow/.csv-wave/artifacts';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
