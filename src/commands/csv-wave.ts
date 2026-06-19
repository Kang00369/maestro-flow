// ---------------------------------------------------------------------------
// `maestro csv-wave` — guardrails for Codex spawn_agents_on_csv result files.
// ---------------------------------------------------------------------------

import type { Command } from 'commander';
import { buildCsvWaveContract, verifyCsvWave } from '../csv-wave/verify.js';

export function registerCsvWaveCommand(program: Command): void {
  const csvWave = program
    .command('csv-wave')
    .description('CSV wave reliability helpers');

  csvWave
    .command('verify <target>')
    .description('Verify spawn_agents_on_csv result CSV files and optionally repair result_json from artifacts')
    .option('--artifact-dir <dir>', 'Directory containing per-row artifact JSON files')
    .option('--require-artifacts', 'Fail when a row has no artifact JSON')
    .option('--required <fields>', 'Comma-separated required JSON fields, e.g. id,result_status,findings')
    .option('--id-column <name>', 'Input/result id column name (default: id)', 'id')
    .option('--allow-empty-result-json', 'Allow empty result_json when a valid artifact is present')
    .option('--repair-from-artifacts', 'Rewrite empty result_json cells from artifact JSON')
    .option('--json', 'Output report as JSON')
    .action((target: string, opts: {
      artifactDir?: string;
      requireArtifacts?: boolean;
      required?: string;
      idColumn?: string;
      allowEmptyResultJson?: boolean;
      repairFromArtifacts?: boolean;
      json?: boolean;
    }) => {
      const report = verifyCsvWave(target, {
        artifactDir: opts.artifactDir,
        requireArtifacts: !!opts.requireArtifacts,
        requiredFields: parseList(opts.required),
        idColumn: opts.idColumn,
        allowEmptyResultJson: !!opts.allowEmptyResultJson,
        repairFromArtifacts: !!opts.repairFromArtifacts,
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printReport(report);
      }
      process.exit(report.ok ? 0 : 2);
    });

  csvWave
    .command('contract')
    .description('Print the worker/coordinator contract for reliable CSV waves')
    .option('--artifact-dir <dir>', 'Artifact directory placeholder/path')
    .option('--required <fields>', 'Comma-separated required JSON fields')
    .option('--id-column <name>', 'Row id column name (default: id)', 'id')
    .action((opts: { artifactDir?: string; required?: string; idColumn?: string }) => {
      console.log(buildCsvWaveContract({
        artifactDir: opts.artifactDir,
        requiredFields: parseList(opts.required),
        idColumn: opts.idColumn,
      }));
    });
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function printReport(report: ReturnType<typeof verifyCsvWave>): void {
  const status = report.ok ? 'ok' : 'failed';
  console.log(`[csv-wave verify] ${status}: files=${report.files.length} rows=${report.rows} repaired=${report.repaired_rows} errors=${report.errors} warnings=${report.warnings}`);
  for (const issue of report.issues) {
    const loc = issue.row ? `${issue.file}:${issue.row}` : issue.file;
    const id = issue.id ? ` id=${issue.id}` : '';
    console.log(`  ${issue.level.toUpperCase()} ${issue.code}${id} ${loc}`);
    console.log(`    ${issue.message}`);
  }
}
