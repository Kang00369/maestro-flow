// src/graph/kg/db/migrations.ts — Schema 版本迁移

import type { KgDatabaseConnection } from './connection.js';

export interface MigrationStep {
  version: number;
  description: string;
  sql: string;
}

const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    description: 'Initial CodeGraph-compatible schema',
    sql: '',  // 由 schema.sql 处理初始创建
  },
  {
    version: 2,
    description: 'MaestroGraph unified schema v2 — knowledge extensions + dual FTS5',
    sql: '',  // 由 schema.sql 处理 (包含所有表创建)
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