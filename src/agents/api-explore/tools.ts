import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function assertWithinCwd(target: string, cwd: string): void {
  const resolved = resolve(target);
  const resolvedCwd = resolve(cwd);
  if (!resolved.startsWith(resolvedCwd)) {
    throw new Error(`Path "${target}" is outside working directory "${cwd}"`);
  }
}

function toRelative(absPath: string, cwd: string): string {
  const rel = relative(cwd, absPath);
  return rel || absPath;
}

function relativizeOutput(output: string, cwd: string): string {
  const cwdNorm = resolve(cwd).replace(/\\/g, '/');
  const cwdBack = resolve(cwd).replace(/\//g, '\\');
  return output
    .replaceAll(cwdNorm + '/', '')
    .replaceAll(cwdBack + '\\', '')
    .replaceAll(cwdNorm, '.')
    .replaceAll(cwdBack, '.');
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function readFile(args: { file_path: string; offset?: number; limit?: number }, cwd: string): string {
  assertWithinCwd(args.file_path, cwd);
  const content = readFileSync(args.file_path, 'utf-8');
  const lines = content.split('\n');
  const offset = Math.max(1, args.offset ?? 1);
  const end = args.limit ? Math.min(offset + args.limit - 1, lines.length) : lines.length;

  const result: string[] = [];
  for (let i = offset - 1; i < end; i++) {
    result.push(`${i + 1}\t${lines[i]}`);
  }
  if (end < lines.length) {
    result.push(`... (${lines.length - end} more lines)`);
  }
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Glob
// ---------------------------------------------------------------------------

function glob(args: { pattern: string; path?: string }, cwd: string): string {
  const dir = args.path ? resolve(cwd, args.path) : cwd;
  assertWithinCwd(dir, cwd);

  try {
    const output = execFileSync('rg', ['--files', '--glob', args.pattern, dir], {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    const files = output.trim().split('\n').filter(Boolean).map(f => toRelative(f.trim(), cwd));
    if (files.length > 100) {
      return files.slice(0, 100).join('\n') + `\n... (${files.length - 100} more files)`;
    }
    return files.join('\n') || 'No files found.';
  } catch {
    try {
      const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
      const matched = entries
        .filter(e => e.isFile() && e.name.match(globToRegex(args.pattern)))
        .map(e => toRelative(resolve(String(e.parentPath ?? e.path), e.name), cwd))
        .slice(0, 100);
      return matched.length > 0 ? matched.join('\n') : 'No files found.';
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  return new RegExp(escaped);
}

// ---------------------------------------------------------------------------
// Ripgrep runner (shared by Grep and Search)
// ---------------------------------------------------------------------------

function runRg(rgArgs: string[]): string {
  return execFileSync('rg', rgArgs, {
    encoding: 'utf-8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 15_000,
  });
}

function runRgWithFallback(rgArgs: string[]): string {
  try {
    return runRg(rgArgs);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      throw err; // no matches — propagate
    }
    if (errMsg.includes('regex parse error') || errMsg.includes('repetition quantifier') || errMsg.includes('look-around')) {
      return runRg(['--pcre2', ...rgArgs]);
    }
    throw err;
  }
}

function formatRgOutput(output: string, cwd: string, offset: number, limit: number): string {
  const raw = relativizeOutput(output.trim(), cwd);
  const allLines = raw.split('\n');
  const sliced = allLines.slice(offset, offset + limit);
  if (allLines.length > offset + limit) {
    return sliced.join('\n') + `\n... (${allLines.length - offset - limit} more, ${allLines.length} total)`;
  }
  return sliced.join('\n') || 'No matches found.';
}

// ---------------------------------------------------------------------------
// Search — simple multi-keyword search
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function search(args: {
  query: string;
  path?: string;
  include?: string;
  exclude?: string;
  context?: number;
  limit?: number;
  files_only?: boolean;
}, cwd: string): string {
  const searchPath = args.path ? resolve(cwd, args.path) : cwd;
  assertWithinCwd(searchPath, cwd);

  // Parse query: support multiple keywords
  //   "foo bar"     → foo.*bar (AND — both on same line, order-sensitive)
  //   "foo | bar"   → (foo|bar) (OR)
  //   "foo, bar"    → (foo|bar) (OR — comma variant)
  //   raw regex when wrapped in /pattern/
  let pattern: string;
  let usePcre2 = false;
  const q = args.query.trim();

  if (q.startsWith('/') && q.endsWith('/')) {
    // Raw regex mode
    pattern = q.slice(1, -1);
  } else if (q.includes(' | ') || q.includes(', ')) {
    // OR mode: "foo | bar" or "foo, bar"
    const keywords = q.split(/\s*[|,]\s*/).filter(Boolean).map(escapeRegex);
    pattern = `(${keywords.join('|')})`;
  } else if (/\s\+\s/.test(q)) {
    // AND mode (all keywords on same line, any order): "foo + bar"
    const keywords = q.split(/\s\+\s/).filter(Boolean).map(escapeRegex);
    // PCRE2 lookahead: (?=.*foo)(?=.*bar)
    pattern = keywords.map(k => `(?=.*${k})`).join('') + '.*';
    usePcre2 = true;
  } else if (q.includes(' ')) {
    // Space-separated: treated as sequence (literal phrase match)
    pattern = escapeRegex(q);
  } else {
    // Single keyword
    pattern = escapeRegex(q);
  }

  const rgArgs: string[] = [];
  if (usePcre2) rgArgs.push('--pcre2');
  rgArgs.push('-i', '-n');
  if (args.files_only) {
    rgArgs.length = 0; // reset
    if (usePcre2) rgArgs.push('--pcre2');
    rgArgs.push('-i', '-l');
  }
  const ctx = args.context ?? 0;
  if (ctx > 0 && !args.files_only) rgArgs.push('-C', String(ctx));
  if (args.include) rgArgs.push('--glob', args.include);
  if (args.exclude) rgArgs.push('--glob', `!${args.exclude}`);
  rgArgs.push('--', pattern, searchPath);

  try {
    const output = usePcre2 ? runRg(rgArgs) : runRgWithFallback(rgArgs);
    return formatRgOutput(output, cwd, 0, args.limit ?? 80);
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      return 'No matches found.';
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Grep — advanced regex search
// ---------------------------------------------------------------------------

function grep(args: {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: string;
  limit?: number;
  offset?: number;
  case_insensitive?: boolean;
  context?: number;
  before_context?: number;
  after_context?: number;
  only_matching?: boolean;
  multiline?: boolean;
}, cwd: string): string {
  const searchPath = args.path ? resolve(cwd, args.path) : cwd;
  assertWithinCwd(searchPath, cwd);

  const rgArgs: string[] = [];
  if (args.case_insensitive) rgArgs.push('-i');
  if (args.multiline) rgArgs.push('-U', '--multiline-dotall');
  if (args.output_mode === 'files_with_matches') {
    rgArgs.push('-l');
  } else if (args.output_mode === 'count') {
    rgArgs.push('-c');
  } else {
    rgArgs.push('-n');
    if (args.only_matching) rgArgs.push('-o');
  }
  if (args.context) rgArgs.push('-C', String(args.context));
  if (args.before_context) rgArgs.push('-B', String(args.before_context));
  if (args.after_context) rgArgs.push('-A', String(args.after_context));
  if (args.glob) rgArgs.push('--glob', args.glob);
  if (args.type) rgArgs.push('--type', args.type);
  rgArgs.push('--', args.pattern, searchPath);

  try {
    const output = runRgWithFallback(rgArgs);
    return formatRgOutput(output, cwd, args.offset ?? 0, args.limit ?? 80);
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      return 'No matches found.';
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function executeTool(name: string, argsJson: string, cwd: string): string {
  const args = JSON.parse(argsJson || '{}');
  switch (name) {
    case 'Read': return readFile(args, cwd);
    case 'Glob': return glob(args, cwd);
    case 'Grep': return grep(args, cwd);
    case 'Search': return search(args, cwd);
    default: return `Unknown tool: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'Search',
      description: 'Keyword search with multi-keyword support. Returns relative paths with line numbers. Case insensitive.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query. Modes: "handleAuth" (single keyword), "error | warn | fatal" (OR), "export + async" (AND — both on same line), "export async function" (exact phrase), /\\bfunc\\w+/ (raw regex wrapped in //).' },
          path: { type: 'string', description: 'Directory to search in.' },
          include: { type: 'string', description: 'Include files matching glob (e.g. "*.ts").' },
          exclude: { type: 'string', description: 'Exclude files matching glob (e.g. "*.test.ts").' },
          context: { type: 'integer', description: 'Lines of context around each match.' },
          limit: { type: 'integer', description: 'Max output lines. Default: 80.' },
          files_only: { type: 'boolean', description: 'Return file paths only, no content.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Read',
      description: 'Read file content with line numbers. Use offset+limit to read a specific section.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file.' },
          offset: { type: 'integer', description: 'Start line (1-indexed).' },
          limit: { type: 'integer', description: 'Number of lines to read.' },
        },
        required: ['file_path'],
      },
    },
  },
];
