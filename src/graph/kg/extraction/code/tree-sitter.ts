// src/graph/kg/extraction/code/tree-sitter.ts
// tree-sitter WASM 解析核心 — 延迟加载 + 缓存
// 参考: codegraph/src/extraction/tree-sitter.ts + grammars.ts
//
// 设计: 通过动态 require @colbymchenry/codegraph 的 tree-sitter 实例,
// 避免在 MaestroGraph 中重新打包 19 个 WASM grammar (~15MB)。
// 若 codegraph 未安装, 优雅降级到无代码提取模式。

import { createRequire } from 'node:module';
import { ensureWasmStability, ParserResetCounter } from './wasm-stability.js';
import type { Language } from '../../db/types.js';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// tree-sitter 类型 (从 @colbymchenry/codegraph 或 web-tree-sitter 加载)
// ---------------------------------------------------------------------------

interface TreeSitterLanguage {
  nodeTypes: unknown[];
}

interface TreeSitterParser {
  setLanguage(language: TreeSitterLanguage): void;
  parse(input: string | Uint8Array, oldTree?: unknown): TreeSitterTree;
  delete(): void;
  getLanguage(): TreeSitterLanguage | null;
}

interface TreeSitterTree {
  rootNode: TreeSitterNode;
  delete(): void;
}

interface TreeSitterNode {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  text: string;
  childCount: number;
  childFieldName(i: number): string | null;
  child(i: number): TreeSitterNode | null;
  children: TreeSitterNode[];
  parent: TreeSitterNode | null;
  namedChildren: TreeSitterNode[];
}

interface TreeSitterModule {
  Language: {
    load(path: string): Promise<TreeSitterLanguage>;
  };
  Parser: new () => TreeSitterParser;
}

// ---------------------------------------------------------------------------
// Language → grammar 名映射
// ---------------------------------------------------------------------------

export const LANGUAGE_TO_GRAMMAR: Record<Language, string> = {
  typescript: 'tree-sitter-typescript',
  javascript: 'tree-sitter-javascript',
  tsx: 'tree-sitter-typescript',
  jsx: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
  c: 'tree-sitter-c',
  cpp: 'tree-sitter-cpp',
  csharp: 'tree-sitter-c-sharp',
  php: 'tree-sitter-php',
  ruby: 'tree-sitter-ruby',
  swift: 'tree-sitter-swift',
  kotlin: 'tree-sitter-kotlin',
  dart: 'tree-sitter-dart',
  svelte: 'tree-sitter-svelte',
  vue: 'tree-sitter-vue',
  liquid: 'tree-sitter-liquid',
  pascal: 'tree-sitter-pascal',
  scala: 'tree-sitter-scala',
  lua: 'tree-sitter-lua',
  luau: 'tree-sitter-luau',
  objc: 'tree-sitter-objc',
  yaml: 'tree-sitter-yaml',
  twig: 'tree-sitter-twig',
  xml: 'tree-sitter-xml',
  properties: 'tree-sitter-properties',
  unknown: '',
};

// ---------------------------------------------------------------------------
// TreeSitterEngine — 单例, 管理解析器池 + grammar 缓存
// ---------------------------------------------------------------------------

export class TreeSitterEngine {
  private static _instance: TreeSitterEngine | null = null;
  private _module: TreeSitterModule | null = null;
  private _grammarCache: Map<string, TreeSitterLanguage> = new Map();
  private _parserPool: TreeSitterParser[] = [];
  private _resetCounter: ParserResetCounter;
  private _available: boolean | null = null;
  private _initPromise: Promise<void> | null = null;

  private constructor() {
    this._resetCounter = new ParserResetCounter();
  }

  static getInstance(): TreeSitterEngine {
    if (!TreeSitterEngine._instance) {
      TreeSitterEngine._instance = new TreeSitterEngine();
    }
    return TreeSitterEngine._instance;
  }

  /** 检查 tree-sitter 是否可用 */
  isAvailable(): boolean {
    if (this._available !== null) return this._available;
    this._available = this.tryLoadModule();
    return this._available;
  }

  private tryLoadModule(): boolean {
    // 尝试从 @colbymchenry/codegraph 加载 tree-sitter
    try {
      const cgPkg = require('@colbymchenry/codegraph');
      // codegraph 可能 re-export tree-sitter, 或内嵌
      if (cgPkg.TreeSitter || cgPkg.Parser) {
        this._module = (cgPkg.TreeSitter ?? cgPkg) as TreeSitterModule;
        return true;
      }
    } catch { /* codegraph not installed */ }

    // 尝试直接加载 web-tree-sitter
    try {
      const ts = require('web-tree-sitter');
      this._module = ts as unknown as TreeSitterModule;
      return true;
    } catch { /* web-tree-sitter not installed */ }

    return false;
  }

  /** 异步初始化 (应用 WASM 稳定性 flag) */
  async ensureInitialized(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._init();
    return this._initPromise;
  }

  private async _init(): Promise<void> {
    // 应用 WASM 稳定性机制 (必须在 WASM 加载前)
    ensureWasmStability();
    if (!this.isAvailable()) {
      throw new Error('tree-sitter not available. Install @colbymchenry/codegraph or web-tree-sitter.');
    }
  }

  /**
   * 加载指定语言的 grammar (延迟加载 + 缓存)
   */
  async loadGrammar(language: Language): Promise<TreeSitterLanguage | null> {
    if (!this._module) return null;
    const grammarName = LANGUAGE_TO_GRAMMAR[language];
    if (!grammarName) return null;

    if (this._grammarCache.has(grammarName)) {
      return this._grammarCache.get(grammarName)!;
    }

    try {
      // 尝试从 codegraph 包的 wasm 目录加载
      const grammarPath = this.resolveGrammarPath(grammarName);
      if (grammarPath) {
        const grammar = await this._module.Language.load(grammarPath);
        this._grammarCache.set(grammarName, grammar);
        return grammar;
      }
    } catch (err) {
      if (process.env.DEBUG) {
        console.warn(`[MaestroGraph] Failed to load grammar ${grammarName}:`, err);
      }
    }

    return null;
  }

  /**
   * 解析源码 → AST tree
   */
  async parse(
    sourceCode: string,
    language: Language,
  ): Promise<TreeSitterTree | null> {
    await this.ensureInitialized();
    if (!this._module) return null;

    const grammar = await this.loadGrammar(language);
    if (!grammar) return null;

    // 从池中获取 parser 或新建
    let parser = this._parserPool.pop() ?? new this._module.Parser();
    parser.setLanguage(grammar);

    // 周期性重置检查 (WASM 内存回收)
    if (this._resetCounter.tickAndCheckReset()) {
      parser.delete();
      parser = new this._module.Parser();
      parser.setLanguage(grammar);
    }

    try {
      const tree = parser.parse(sourceCode);
      // 归还 parser 到池
      this._parserPool.push(parser);
      return tree;
    } catch (err) {
      parser.delete();
      if (process.env.DEBUG) {
        console.warn(`[MaestroGraph] Parse error (${language}):`, err);
      }
      return null;
    }
  }

  /** 解析 grammar wasm 文件路径 */
  private resolveGrammarPath(grammarName: string): string | null {
    try {
      // 尝试 codegraph 包内的 wasm 目录
      const cgPath = require.resolve('@colbymchenry/codegraph');
      const wasmDir = cgPath.replace(/[/\\]index\.js$/, '/wasm');
      const candidate = `${wasmDir}/${grammarName}.wasm`;
      return candidate;
    } catch {
      return null;
    }
  }

  /** 销毁所有 parser (进程退出时) */
  dispose(): void {
    for (const parser of this._parserPool) {
      try { parser.delete(); } catch { /* ignore */ }
    }
    this._parserPool = [];
    this._grammarCache.clear();
  }
}

// ---------------------------------------------------------------------------
// 便捷函数
// ---------------------------------------------------------------------------

export function getTreeSitterEngine(): TreeSitterEngine {
  return TreeSitterEngine.getInstance();
}

export function isTreeSitterAvailable(): boolean {
  return TreeSitterEngine.getInstance().isAvailable();
}