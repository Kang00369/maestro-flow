// src/graph/kg/db/migrations.ts — Schema 版本迁移

import type { KgDatabaseConnection } from './connection.js';
import { CREDIBILITY_MIGRATION_SQL } from '../credibility.js';

export interface MigrationStep {
  version: number;
  description: string;
  sql: string;
}

const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    description: 'Initial CodeGraph-compatible schema',
    sql: '',
  },
  {
    version: 2,
    description: 'MaestroGraph unified schema v2 — knowledge extensions + dual FTS5',
    sql: '',
  },
  {
    version: 3,
    description: 'Credibility tracking — decay scoring + usage counters',
    sql: CREDIBILITY_MIGRATION_SQL,
  },
];

export function applyMigrations(conn: KgDatabaseConnection): void {
  const currentVersion = conn.getSchemaVersion();
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      if (migration.sql) {
        conn.raw.exec(migration.sql);
      }
      conn.raw.prepare(
        'INSERT OR REPLACE INTO schema_versions (version, applied_at, description) VALUES (?, ?, ?)'
      ).run(migration.version, Date.now(), migration.description);
    }
  }
}