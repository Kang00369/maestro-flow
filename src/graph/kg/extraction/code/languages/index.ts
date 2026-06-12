// src/graph/kg/extraction/code/languages/index.ts
// 19 语言提取器注册表
// 参考: codegraph/src/extraction/languages/*.ts (逐文件复用)

import type { LanguageExtractor } from '../tree-sitter-types.js';
import type { Language } from '../../../db/types.js';
import { typescriptExtractor, javascriptExtractor, tsxExtractor } from './typescript.js';

// ---------------------------------------------------------------------------
// 基础提取器模板 — 用于尚未移植的语言 (复用通用逻辑)
// ---------------------------------------------------------------------------

function createGenericExtractor(language: Language, grammarName: string, nodeTypeMap: Record<string, string>): LanguageExtractor {
  return {
    language,
    grammarName,
    nodeTypeMap,
    extract(tree, sourceCode, filePath): ReturnType<LanguageExtractor['extract']> {
      // 通用提取: 遍历 AST, 按 nodeTypeMap 映射符号
      const symbols: import('../tree-sitter-types.js').ExtractedSymbol[] = [];
      const references: import('../tree-sitter-types.js').ExtractedReference[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rootNode = (tree as any).rootNode;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walk = (node: any, parentQualifiedName: string): void => {
        const kind = nodeTypeMap[node.type];
        const startRow = (node.startPosition?.row ?? 0) + 1;
        const endRow = (node.endPosition?.row ?? 0) + 1;

        if (kind) {
          // 通用 name 提取: 查找 name/identifier 子节点
          const nameNode = node.childForFieldName?.('name') ??
            node.children?.find((c: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
              c.type === 'identifier' || c.type === 'name' || c.type === 'type_identifier');

          if (nameNode?.text) {
            const name = nameNode.text;
            const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
            symbols.push({
              kind, name, qualifiedName, filePath, language,
              startLine: startRow, endLine: endRow,
              startColumn: (node.startPosition?.column ?? 0) + 1,
              endColumn: (node.endPosition?.column ?? 0) + 1,
              docstring: '', signature: '',
              visibility: '', isExported: false, isAsync: false,
              isStatic: false, isAbstract: false,
              decorators: [], typeParameters: [],
            });

            // 递归子节点
            for (const child of node.namedChildren ?? []) {
              walk(child, qualifiedName);
            }
            return;
          }
        }

        for (const child of node.namedChildren ?? []) {
          walk(child, parentQualifiedName);
        }
      };

      walk(rootNode, '');
      return { symbols, references, edges: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// 语言提取器注册表
// ---------------------------------------------------------------------------

const EXTRACTOR_REGISTRY: Map<Language, LanguageExtractor> = new Map();

// 已完整移植的提取器
EXTRACTOR_REGISTRY.set('typescript', typescriptExtractor);
EXTRACTOR_REGISTRY.set('javascript', javascriptExtractor);
EXTRACTOR_REGISTRY.set('tsx', tsxExtractor);
EXTRACTOR_REGISTRY.set('jsx', { ...javascriptExtractor, language: 'jsx' as Language });

// 通用提取器 (待逐个移植, 目前使用通用 AST 遍历)
EXTRACTOR_REGISTRY.set('python', createGenericExtractor('python' as Language, 'python', {
  'function_definition': 'function', 'class_definition': 'class',
  'decorated_definition': 'function', 'import_statement': 'import',
}));
EXTRACTOR_REGISTRY.set('go', createGenericExtractor('go' as Language, 'go', {
  'function_declaration': 'function', 'method_declaration': 'method',
  'type_declaration': 'type_alias', 'struct_type': 'struct',
  'interface_type': 'interface', 'import_declaration': 'import',
}));
EXTRACTOR_REGISTRY.set('rust', createGenericExtractor('rust' as Language, 'rust', {
  'function_item': 'function', 'struct_item': 'struct', 'enum_item': 'enum',
  'trait_item': 'trait', 'impl_item': 'method', 'use_declaration': 'import',
}));
EXTRACTOR_REGISTRY.set('java', createGenericExtractor('java' as Language, 'java', {
  'method_declaration': 'method', 'class_declaration': 'class',
  'interface_declaration': 'interface', 'enum_declaration': 'enum',
  'import_declaration': 'import',
}));
EXTRACTOR_REGISTRY.set('c', createGenericExtractor('c' as Language, 'c', {
  'function_definition': 'function', 'struct_specifier': 'struct',
  'enum_specifier': 'enum', 'type_definition': 'type_alias',
  'preproc_function_def': 'function',
}));
EXTRACTOR_REGISTRY.set('cpp', createGenericExtractor('cpp' as Language, 'cpp', {
  'function_definition': 'function', 'class_specifier': 'class',
  'struct_specifier': 'struct', 'namespace_definition': 'namespace',
}));
EXTRACTOR_REGISTRY.set('csharp', createGenericExtractor('csharp' as Language, 'c_sharp', {
  'method_declaration': 'method', 'class_declaration': 'class',
  'interface_declaration': 'interface', 'enum_declaration': 'enum',
  'namespace_declaration': 'namespace',
}));
EXTRACTOR_REGISTRY.set('php', createGenericExtractor('php' as Language, 'php', {
  'function_definition': 'function', 'class_declaration': 'class',
  'interface_declaration': 'interface',
}));
EXTRACTOR_REGISTRY.set('ruby', createGenericExtractor('ruby' as Language, 'ruby', {
  'method': 'method', 'class': 'class', 'module': 'module',
}));
EXTRACTOR_REGISTRY.set('swift', createGenericExtractor('swift' as Language, 'swift', {
  'function_declaration': 'function', 'class_declaration': 'class',
  'struct_declaration': 'struct', 'protocol_declaration': 'protocol',
  'enum_declaration': 'enum',
}));
EXTRACTOR_REGISTRY.set('kotlin', createGenericExtractor('kotlin' as Language, 'kotlin', {
  'function_declaration': 'function', 'class_declaration': 'class',
  'object_declaration': 'class', 'interface_declaration': 'interface',
}));
EXTRACTOR_REGISTRY.set('dart', createGenericExtractor('dart' as Language, 'dart', {
  'function_signature': 'function', 'method_signature': 'method',
  'class_definition': 'class',
}));
EXTRACTOR_REGISTRY.set('svelte', createGenericExtractor('svelte' as Language, 'svelte', {
  'element': 'component', 'script_element': 'function',
}));
EXTRACTOR_REGISTRY.set('vue', createGenericExtractor('vue' as Language, 'vue', {
  'element': 'component', 'start_tag': 'component',
}));
EXTRACTOR_REGISTRY.set('liquid', createGenericExtractor('liquid' as Language, 'liquid', {}));
EXTRACTOR_REGISTRY.set('pascal', createGenericExtractor('pascal' as Language, 'pascal', {}));
EXTRACTOR_REGISTRY.set('scala', createGenericExtractor('scala' as Language, 'scala', {
  'function_definition': 'function', 'class_definition': 'class',
  'object_definition': 'class', 'trait_definition': 'trait',
}));
EXTRACTOR_REGISTRY.set('lua', createGenericExtractor('lua' as Language, 'lua', {
  'function_declaration': 'function', 'function_definition': 'function',
}));
EXTRACTOR_REGISTRY.set('luau', createGenericExtractor('luau' as Language, 'luau', {
  'function_declaration': 'function', 'function_definition': 'function',
}));
EXTRACTOR_REGISTRY.set('objc', createGenericExtractor('objc' as Language, 'objc', {
  'method_definition': 'method', 'class_declaration': 'class',
  'protocol_declaration': 'protocol',
}));

// ---------------------------------------------------------------------------
// 查询 API
// ---------------------------------------------------------------------------

export function getExtractor(language: Language): LanguageExtractor | null {
  return EXTRACTOR_REGISTRY.get(language) ?? null;
}

export function getAllExtractors(): Map<Language, LanguageExtractor> {
  return EXTRACTOR_REGISTRY;
}

export function getSupportedLanguages(): Language[] {
  return [...EXTRACTOR_REGISTRY.keys()];
}

// 文件扩展名 → 语言映射
const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.mjs': 'javascript', '.cjs': 'javascript', '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.cs': 'csharp', '.php': 'php', '.rb': 'ruby',
  '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin', '.dart': 'dart',
  '.svelte': 'svelte', '.vue': 'vue', '.liquid': 'liquid',
  '.pas': 'pascal', '.scala': 'scala', '.sc': 'scala',
  '.lua': 'lua', '.m': 'objc', '.mm': 'objc',
  '.yaml': 'yaml', '.yml': 'yaml', '.twig': 'twig',
  '.xml': 'xml', '.properties': 'properties',
};

export function detectLanguageFromPath(filePath: string): Language {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = normalized.substring(normalized.lastIndexOf('.')).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? 'unknown';
}

// file-level-only 语言 (无 tree-sitter grammar, 但仍索引文件级)
export const FILE_LEVEL_ONLY_LANGUAGES: Set<Language> = new Set<Language>([
  'yaml' as Language, 'twig' as Language, 'properties' as Language,
]);

export function isFileLevelOnlyLanguage(language: Language): boolean {
  return FILE_LEVEL_ONLY_LANGUAGES.has(language);
}