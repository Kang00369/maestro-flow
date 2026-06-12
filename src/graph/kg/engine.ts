// src/graph/kg/engine.ts — MaestroGraph 主入口类
// 参考: plan-maestrograph.md Gap C8 — CodeGraph Public Lifecycle API

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { KgDatabaseConnection, KgQueryBuilder, getKgDatabasePath } from './db/index.js';
import type { UnifiedNode, UnifiedEdge, UnifiedGraphStats, SyncResult, ResolutionResult, ExtractionResult, SourceType } from './db/types.js';

export class MaestroGraph {
  private conn: KgDatabaseConnection | null = null;
  private queries: KgQueryBuilder | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  static async init(projectRoot: string): Promise<MaestroGraph> {
    const mg = new MaestroGraph(projectRoot);
    const dbPath = getKgDatabasePath(projectRoot);
    mg.conn = new KgDatabaseConnection();
    mg.conn.initialize(dbPath);
    mg.queries = new KgQueryBuilder(mg.conn);
    return mg;
  }

  static async open(projectRoot: string): Promise<MaestroGraph> {
    const mg = new MaestroGraph(projectRoot);
    const dbPath = getKgDatabasePath(projectRoot);
    if (!existsSync(dbPath)) {
      throw new Error(`MaestroGraph not initialized. Run "maestro kg init" first. Expected: ${dbPath}`);
    }
    mg.conn = new KgDatabaseConnection();
    mg.conn.open(dbPath);
    mg.queries = new KgQueryBuilder(mg.conn);
    return mg;
  }

  static isInitialized(projectRoot: string): boolean {
    return existsSync(getKgDatabasePath(projectRoot));
  }

  close(): void {
    this.conn?.close();
    this.conn = null;
    this.queries = null;
  }

  // ── Indexing ──────────────────────────────────────────────────────

  async indexAll(options?: { sources?: SourceType[] }): Promise<SyncResult[]> {
    // 双轨索引: 代码 + 知识 — 由 extraction/orchestrator 实现
    // 这里只提供入口 API, 实际逻辑在 orchestrator 中
    const results: SyncResult[] = [];
    // TODO: 实现后调用 orchestrator
    return results;
  }

  async indexKnowledge(options?: { sources?: SourceType[] }): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    // TODO: 实现后调用知识提取器
    return results;
  }

  async sync(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    // TODO: 实现增量同步
    return results;
  }

  resolveReferences(): ResolutionResult {
    if (!this.queries) throw new Error('MaestroGraph not open');
    // TODO: 实现引用解析
    return { edgesCreated: 0, edges: [], durationMs: 0 };
  }

  resolveKnowledgeEdges(): ResolutionResult {
    if (!this.queries) throw new Error('MaestroGraph not open');
    // TODO: 实现跨源边解析
    return { edgesCreated: 0, edges: [], durationMs: 0 };
  }

  // ── Query ─────────────────────────────────────────────────────────

  searchUnified(query: string, options?: { sourceTypes?: SourceType[]; limit?: number }): UnifiedNode[] {
    if (!this.queries) throw new Error('MaestroGraph not open');
    return this.queries.searchUnified(query, {
      limit: options?.limit ?? 20,
      sourceTypes: options?.sourceTypes,
    });
  }

  searchCode(query: string, options?: { kinds?: string[]; languages?: string[]; limit?: number }): UnifiedNode[] {
    if (!this.queries) throw new Error('MaestroGraph not open');
    return this.queries.searchCodeFTS(query, {
      kinds: options?.kinds,
      languages: options?.languages,
      limit: options?.limit ?? 20,
    });
  }

  searchKnowledge(query: string, options?: { sourceTypes?: SourceType[]; limit?: number }): UnifiedNode[] {
    if (!this.queries) throw new Error('MaestroGraph not open');
    return this.queries.searchKnowledgeFTS(query, {
      sourceTypes: options?.sourceTypes,
      limit: options?.limit ?? 20,
    });
  }

  getNode(id: string): UnifiedNode | null {
    if (!this.queries) throw new Error('MaestroGraph not open');
    return this.queries.getNode(id);
  }

  getStats(): UnifiedGraphStats {
    if (!this.queries || !this.conn) throw new Error('MaestroGraph not open');
    return this.queries.getStats(this.conn.getSize());
  }

  getDetectedFrameworks(): string[] {
    return this.getStats().detectedFrameworks;
  }

  // ── Insertion (供 extractor 使用) ──────────────────────────────────

  insertExtractionResults(result: ExtractionResult): void {
    if (!this.queries) throw new Error('MaestroGraph not open');
    this.conn!.transaction(() => {
      this.queries!.insertNodes(result.nodes);
      this.queries!.insertEdges(result.edges);
      this.queries!.upsertFile(result.fileRecord);
    });
  }
}