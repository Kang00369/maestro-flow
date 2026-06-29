// src/graph/kg/extraction/knowledge/codebase-extractor.ts
// 从项目文档型文件提取 codebase_section nodes。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, basename, relative, resolve } from 'node:path';
import { makeNodeId } from '../../db/connection.js';
import type {
  UnifiedNode, UnifiedEdge, FileRecord, ExtractionResult,
  SourceType, Language,
} from '../../db/types.js';

const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt',
  '.yaml', '.yml',
  '.conf', '.service', '.sh',
  '.toml', '.ini', '.env',
  '.json',
]);

const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.workflow',
  '.codegraph',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.next',
  'out',
  'target',
  'vendor',
  'repos',
  'images',
]);

const EXCLUDED_PATH_PARTS = [
  'references/official-docs-mirror',
  'tools/s302/runtime',
];

const MAX_TEXT_FILE_SIZE = 512 * 1024;

export function extractCodebase(
  codebaseDir: string,
  workflowRoot: string,
): ExtractionResult {
  const nodes: UnifiedNode[] = [];
  const edges: UnifiedEdge[] = [];
  const now = Date.now();
  const projectRoot = resolve(workflowRoot, '..');
  const visitedFiles = new Set<string>();

  if (existsSync(codebaseDir)) {
    for (const filePath of listCodebaseDirFiles(codebaseDir)) {
      visitedFiles.add(filePath);
      indexTextFile({ filePath, projectRoot, nodes, edges, now });
    }
  }

  for (const filePath of listProjectTextFiles(projectRoot)) {
    if (visitedFiles.has(filePath)) continue;
    visitedFiles.add(filePath);
    indexTextFile({ filePath, projectRoot, nodes, edges, now });
  }

  return {
    nodes,
    edges,
    fileRecord: {
      path: projectRoot,
      contentHash: '',
      language: 'unknown' as Language,
      size: 0,
      modifiedAt: now,
      indexedAt: now,
      nodeCount: nodes.length,
      errors: [],
      sourceType: 'codebase' as SourceType,
    },
  };
}

function indexTextFile(args: {
  filePath: string;
  projectRoot: string;
  nodes: UnifiedNode[];
  edges: UnifiedEdge[];
  now: number;
}): void {
  const { filePath, projectRoot, nodes, edges, now } = args;
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(projectRoot, filePath).replace(/\\/g, '/');
  const language = detectLanguage(filePath);
  const fileIsMarkdown = isMarkdownFile(filePath);
  const fileNodeId = makeNodeId('codebase', relPath, '<file>');
  const fileName = basename(filePath);
  const sections = fileIsMarkdown
    ? parseSections(content, filePath)
    : [];

  nodes.push({
    id: fileNodeId,
    kind: 'codebase_section',
    name: fileName,
    qualifiedName: `codebase:${relPath}`,
    filePath,
    language,
    startLine: 1,
    endLine: content.split('\n').length,
    startColumn: 0,
    endColumn: 0,
    docstring: '',
    signature: '',
    visibility: '',
    isExported: false,
    isAsync: false,
    isStatic: false,
    isAbstract: false,
    decorators: [],
    typeParameters: [],
    sourceType: 'codebase' as SourceType,
    definition: firstNonEmptyLine(content),
    aliases: [relPath],
    keywords: pathKeywords(relPath),
    category: language,
    roles: [],
    priority: '',
    status: 'active',
    body: sections.length > 0 ? summarizeSections(sections) : content,
    metadata: { sourceFile: relPath, nodeRole: 'file' },
    updatedAt: now,
  });

  for (const section of sections) {
    const nodeId = makeNodeId('codebase', relPath, `${section.lineStart}-${section.headingSlug}`);

    nodes.push({
        id: nodeId,
        kind: 'codebase_section',
        name: section.heading,
        qualifiedName: `codebase:${fileName}:${section.headingSlug}`,
        filePath,
        language,
        startLine: section.lineStart,
        endLine: section.lineEnd,
        startColumn: 0,
        endColumn: 0,
        docstring: '',
        signature: '',
        visibility: '',
        isExported: false,
        isAsync: false,
        isStatic: false,
        isAbstract: false,
        decorators: [],
        typeParameters: [],
        sourceType: 'codebase' as SourceType,
        definition: section.summary,
        aliases: [],
        keywords: pathKeywords(relPath),
        category: '',
        roles: [],
        priority: '',
        status: 'active',
        body: section.content,
        metadata: { sourceFile: relPath, nodeRole: 'section' },
        updatedAt: now,
      });

    edges.push({
      source: fileNodeId,
      target: nodeId,
      kind: 'contains',
      provenance: 'harvest',
    });
  }
}

// ---------------------------------------------------------------------------
// Section 解析 — 以标题分割 Markdown 文件
// ---------------------------------------------------------------------------

interface ParsedSection {
  heading: string;
  headingSlug: string;
  parentHeading: string | null;
  content: string;
  summary: string;
  lineStart: number;
  lineEnd: number;
}

function parseSections(content: string, filePath: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = content.split('\n');
  let current: ParsedSection | null = null;
  let lastH2Heading: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^#{1,3}\s+(.+)/);
    if (match) {
      if (current) {
        current.lineEnd = i;
        current.summary = current.content.split('\n')[0]?.substring(0, 200) ?? '';
        sections.push(current);
      }
      const heading = match[1].trim();
      const headingSlug = slugify(heading);
      const level = line.match(/^(#{1,3})/)?.[1]?.length ?? 1;
      const parentHeading = level >= 3 && lastH2Heading ? lastH2Heading : null;
      if (level === 2) lastH2Heading = headingSlug;

      current = {
        heading,
        headingSlug,
        parentHeading,
        content: '',
        summary: '',
        lineStart: i + 1,
        lineEnd: lines.length,
      };
    } else if (current) {
      current.content += line + '\n';
    }
  }

  if (current) {
    current.lineEnd = lines.length;
    current.summary = current.content.split('\n')[0]?.substring(0, 200) ?? '';
    sections.push(current);
  }

  // 如果没有标题，创建整体 section
  if (sections.length === 0 && content.trim()) {
    sections.push({
      heading: basename(filePath, '.md'),
      headingSlug: slugify(basename(filePath, '.md')),
      parentHeading: null,
      content: content,
      summary: content.split('\n')[0]?.substring(0, 200) ?? '',
      lineStart: 1,
      lineEnd: lines.length,
    });
  }

  return sections;
}

function listCodebaseDirFiles(codebaseDir: string): string[] {
  if (!existsSync(codebaseDir)) return [];
  return readdirSync(codebaseDir)
    .filter(f => extname(f) === '.md')
    .map(f => resolve(codebaseDir, f));
}

function listProjectTextFiles(projectRoot: string): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = resolve(dir, entry.name);
      const relPath = relative(projectRoot, absPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name, relPath)) continue;
        walk(absPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!isIndexableTextFile(absPath)) continue;

      let stat;
      try {
        stat = statSync(absPath);
      } catch {
        continue;
      }
      if (stat.size > MAX_TEXT_FILE_SIZE) continue;
      files.push(absPath);
    }
  };

  walk(projectRoot);
  return files;
}

function shouldSkipDirectory(name: string, relPath: string): boolean {
  if (DEFAULT_EXCLUDED_DIRS.has(name)) return true;
  return EXCLUDED_PATH_PARTS.some(part => relPath === part || relPath.startsWith(`${part}/`));
}

function isIndexableTextFile(filePath: string): boolean {
  const name = basename(filePath);
  const ext = extname(filePath);
  if (name.endsWith('.lock') || name.endsWith('-lock.json') || name.endsWith('.map')) return false;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return (
    name === 'README' ||
    name === 'INSTALL' ||
    name.endsWith('.service.example') ||
    name.endsWith('.env.example')
  );
}

function detectLanguage(filePath: string): Language {
  const name = basename(filePath);
  const ext = extname(filePath);
  if (ext === '.yaml' || ext === '.yml') return 'yaml' as Language;
  if (name.endsWith('.service') || name.endsWith('.service.example')) return 'unknown' as Language;
  return 'unknown' as Language;
}

function isMarkdownFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === '.md' || ext === '.mdx';
}

function firstNonEmptyLine(content: string): string {
  return content.split('\n').find(line => line.trim().length > 0)?.trim().substring(0, 200) ?? '';
}

function summarizeSections(sections: ParsedSection[]): string {
  return sections.map(section => `${section.heading}\n${section.summary}`).join('\n\n');
}

function pathKeywords(relPath: string): string[] {
  const parts = relPath
    .replace(/\.[^.]+$/, '')
    .split(/[\/_.\-\s]+/)
    .map(part => part.trim().toLowerCase())
    .filter(part => part.length > 1);
  return [...new Set(parts)];
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
}

function createEmptyFileRecord(path: string): FileRecord {
  return {
    path, contentHash: '', language: 'unknown' as Language,
    size: 0, modifiedAt: 0, indexedAt: 0, nodeCount: 0,
    errors: [], sourceType: 'codebase' as SourceType,
  };
}
