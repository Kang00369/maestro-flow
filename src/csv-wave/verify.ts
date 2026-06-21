// ---------------------------------------------------------------------------
// CSV wave verification helpers.
//
// Codex `spawn_agents_on_csv` can export rows marked completed while the nested
// `result_json` is `{}` when hooks are unavailable or disabled. The helpers
// below make that state observable, and can optionally repair result_json from
// worker-written artifact JSON files.
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface CsvWaveVerifyOptions {
  artifactDir?: string;
  requireArtifacts?: boolean;
  requiredFields?: string[];
  idColumn?: string;
  allowEmptyResultJson?: boolean;
  repairFromArtifacts?: boolean;
}

export interface CsvWaveIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  file: string;
  row?: number;
  id?: string;
}

export interface CsvWaveReport {
  ok: boolean;
  checked_at: string;
  target: string;
  files: string[];
  rows: number;
  repaired_rows: number;
  errors: number;
  warnings: number;
  issues: CsvWaveIssue[];
}

interface CsvRow {
  line: number;
  cells: string[];
  values: Record<string, string>;
}

interface CsvTable {
  headers: string[];
  rows: CsvRow[];
}

interface ParsedJson {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function verifyCsvWave(target: string, opts: CsvWaveVerifyOptions = {}): CsvWaveReport {
  const absTarget = resolve(target);
  const files = resolveCsvTargets(absTarget);
  const issues: CsvWaveIssue[] = [];
  let rows = 0;
  let repairedRows = 0;

  if (files.length === 0) {
    issues.push({
      level: 'error',
      code: 'no-result-csv',
      message: 'No result CSV files found. Pass a result CSV file or a directory containing *result*.csv.',
      file: absTarget,
    });
  }

  for (const file of files) {
    const table = parseCsv(readFileSync(file, 'utf-8'));
    if (!table.headers.includes('result_json')) {
      issues.push({
        level: 'error',
        code: 'missing-result-json-column',
        message: 'Result CSV has no result_json column.',
        file,
      });
      if (opts.repairFromArtifacts) table.headers.push('result_json');
    }

    let fileRepairedRows = 0;
    for (const row of table.rows) {
      rows += 1;
      const rowId = rowIdFor(row.values, opts.idColumn, rows);
      const status = (row.values.status || '').trim().toLowerCase();

      if (status && status !== 'completed') {
        issues.push({
          level: 'error',
          code: 'row-not-completed',
          message: `Row status is "${row.values.status}", not completed.`,
          file,
          row: row.line,
          id: rowId,
        });
      }

      const resultText = row.values.result_json ?? '';
      const result = parseJsonField(resultText);
      let resultIsEmpty = true;
      if (!result.ok) {
        issues.push({
          level: 'error',
          code: 'invalid-result-json',
          message: result.error ?? 'result_json is not valid JSON.',
          file,
          row: row.line,
          id: rowId,
        });
      } else {
        resultIsEmpty = isEmptyJson(result.value);
      }

      const artifact = readArtifact(opts.artifactDir, rowId);
      if (opts.requireArtifacts && !artifact.found) {
        issues.push({
          level: 'error',
          code: 'missing-artifact',
          message: 'Required artifact JSON was not found.',
          file,
          row: row.line,
          id: rowId,
        });
      }
      if (artifact.found && !artifact.parsed.ok) {
        issues.push({
          level: 'error',
          code: 'invalid-artifact-json',
          message: artifact.parsed.error ?? 'Artifact is not valid JSON.',
          file: artifact.path ?? file,
          row: row.line,
          id: rowId,
        });
      }

      const artifactValue = artifact.parsed.ok ? artifact.parsed.value : undefined;
      const artifactHasPayload = artifact.found && artifact.parsed.ok && !isEmptyJson(artifactValue);
      if (
        opts.repairFromArtifacts &&
        resultIsEmpty &&
        artifactHasPayload
      ) {
        row.values.result_json = JSON.stringify(artifactValue);
        setCell(table, row, 'result_json', row.values.result_json);
        repairedRows += 1;
        fileRepairedRows += 1;
        resultIsEmpty = false;
      }

      if (resultIsEmpty && (!opts.allowEmptyResultJson || !artifactHasPayload)) {
        issues.push({
          level: 'error',
          code: 'empty-result-json',
          message: opts.allowEmptyResultJson
            ? 'Row completed with empty result_json and no valid artifact payload.'
            : 'Row completed with empty result_json.',
          file,
          row: row.line,
          id: rowId,
        });
      }

      const payload = artifactHasPayload
        ? artifactValue
        : result.value;
      checkPayload(file, row, rowId, payload, opts.requiredFields ?? [], issues);
    }

    if (opts.repairFromArtifacts && fileRepairedRows > 0) {
      writeFileSync(file, serializeCsv(table), 'utf-8');
    }
  }

  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.length - errors;
  return {
    ok: errors === 0,
    checked_at: new Date().toISOString(),
    target: absTarget,
    files,
    rows,
    repaired_rows: repairedRows,
    errors,
    warnings,
    issues,
  };
}

export function buildCsvWaveContract(opts: {
  artifactDir?: string;
  requiredFields?: string[];
  idColumn?: string;
} = {}): string {
  const artifactDir = opts.artifactDir || '<wave-results.csv>.artifacts';
  const required = (opts.requiredFields && opts.requiredFields.length > 0)
    ? opts.requiredFields.join(',')
    : 'id,result_status,findings';
  const idColumn = opts.idColumn || 'id';
  return [
    'CSV Wave Reliability Contract (manual fallback)',
    '',
    'Standard Codex installs use csv-wave-guard to inject this contract automatically for spawn_agents_on_csv.',
    'Use this text only when hooks are unavailable, disabled, or you need an explicit inline contract.',
    '',
    'Worker instruction additions for hookless/manual mode:',
    `1. Your row id comes from the CSV column "${idColumn}".`,
    `2. Build the final non-empty JSON result object with required fields: ${required}.`,
    `3. Before calling report_agent_job_result, write the same JSON object to: ${artifactDir}/<safe-row-id>.json`,
    '   safe-row-id = row id with every character outside [A-Za-z0-9._-] replaced by "_".',
    '4. Then call report_agent_job_result exactly once with the same object in result.',
    '5. Never report completed with an empty object. If blocked, report result_status="blocked" and a non-empty error.',
    '',
    'Coordinator check after spawn_agents_on_csv:',
    `maestro csv-wave verify <wave-results.csv> --artifact-dir "${artifactDir}" --require-artifacts --repair-from-artifacts --allow-empty-result-json --required ${required}`,
    '',
    'Merge only after the verify command exits 0. With standard hooks, empty result_json should be blocked before export; --repair-from-artifacts remains a recovery path for hookless or interrupted runs.',
  ].join('\n');
}

function resolveCsvTargets(absTarget: string): string[] {
  if (!existsSync(absTarget)) return [];
  const stat = statSync(absTarget);
  if (stat.isFile()) return [absTarget];
  if (!stat.isDirectory()) return [];
  return readdirSync(absTarget)
    .filter(name => name.toLowerCase().endsWith('.csv') && name.toLowerCase().includes('result'))
    .sort()
    .map(name => join(absTarget, name));
}

function parseCsv(raw: string): CsvTable {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const headers = records.shift() ?? [];
  const rows = records
    .filter(cells => cells.length > 1 || (cells[0] ?? '').trim() !== '')
    .map((cells, index) => ({
      line: index + 2,
      cells,
      values: Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])),
    }));
  return { headers, rows };
}

function serializeCsv(table: CsvTable): string {
  const lines = [table.headers.map(escapeCsvField).join(',')];
  for (const row of table.rows) {
    lines.push(table.headers.map(h => escapeCsvField(row.values[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function setCell(table: CsvTable, row: CsvRow, header: string, value: string): void {
  let index = table.headers.indexOf(header);
  if (index === -1) {
    table.headers.push(header);
    index = table.headers.length - 1;
  }
  while (row.cells.length <= index) row.cells.push('');
  row.cells[index] = value;
  row.values[header] = value;
}

function rowIdFor(values: Record<string, string>, idColumn: string | undefined, fallback: number): string {
  const candidates = [
    idColumn ? values[idColumn] : undefined,
    values.item_id,
    values.id,
    values.task_id,
  ];
  return candidates.find(v => v && v.trim().length > 0)?.trim() ?? String(fallback);
}

function parseJsonField(raw: string): ParsedJson {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function isEmptyJson(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function readArtifact(artifactDir: string | undefined, rowId: string): {
  found: boolean;
  path?: string;
  parsed: ParsedJson;
} {
  if (!artifactDir) return { found: false, parsed: { ok: true, value: undefined } };
  const dir = resolve(artifactDir);
  const names = artifactNames(rowId);
  for (const name of names) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    return { found: true, path, parsed: parseJsonField(readFileSync(path, 'utf-8')) };
  }
  return { found: false, path: join(dir, names[0]), parsed: { ok: true, value: undefined } };
}

function artifactNames(rowId: string): string[] {
  return [`${safeArtifactId(rowId)}.json`];
}

function safeArtifactId(rowId: string): string {
  return rowId.replace(/[^A-Za-z0-9._-]/g, '_');
}

function checkPayload(
  file: string,
  row: CsvRow,
  rowId: string,
  payload: unknown,
  requiredFields: string[],
  issues: CsvWaveIssue[],
): void {
  if (payload === undefined || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    if (requiredFields.length > 0) {
      issues.push({
        level: 'error',
        code: 'missing-payload-object',
        message: 'No JSON object is available for required field validation.',
        file,
        row: row.line,
        id: rowId,
      });
    }
    return;
  }

  const obj = payload as Record<string, unknown>;
  if (typeof obj.id === 'string' && obj.id.trim() && obj.id.trim() !== rowId) {
    issues.push({
      level: 'error',
      code: 'id-mismatch',
      message: `Payload id "${obj.id}" does not match row id "${rowId}".`,
      file,
      row: row.line,
      id: rowId,
    });
  }

  const resultStatus = typeof obj.result_status === 'string' ? obj.result_status : '';
  if (resultStatus === 'failed' || resultStatus === 'blocked') {
    issues.push({
      level: 'error',
      code: 'payload-result-status',
      message: `Payload result_status is "${resultStatus}".`,
      file,
      row: row.line,
      id: rowId,
    });
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(obj, field) || isEmptyJson(obj[field])) {
      issues.push({
        level: 'error',
        code: 'missing-required-field',
        message: `Required field "${field}" is missing or empty.`,
        file,
        row: row.line,
        id: rowId,
      });
    }
  }
}
