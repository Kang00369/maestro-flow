// src/graph/kg/index.ts — MaestroGraph 模块导出

export { MaestroGraph } from './engine.js';
export { KgDatabaseConnection, KgQueryBuilder, getKgDatabasePath, sanitizeFtsQuery, makeNodeId, validateNodeId } from './db/index.js';
export type {
  UnifiedNode, UnifiedEdge, FileRecord, ExtractionResult,
  ResolutionResult, SyncResult, UnifiedSearchResult, UnifiedGraphStats,
  UnifiedNodeKind, UnifiedEdgeKind, CodeNodeKind, KnowledgeNodeKind,
  CodeEdgeKind, KnowledgeEdgeKind, Language, SourceType, EdgeProvenance,
  NodeIdPrefix, Visibility,
  UNIFIED_NODE_KINDS, CODE_NODE_KINDS, KNOWLEDGE_NODE_KINDS,
  LANGUAGES, SOURCE_TYPES,
} from './db/types.js';