import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpecFileInfo {
  name: string;
  entries: number;
  size: number;
}

interface ScopeInfo {
  scope: string;
  exists: boolean;
  files: SpecFileInfo[];
}

export interface SpecPanelProps {
  workDir: string;
  onBack?: () => void;
}

type PanelMode = 'view' | 'browse' | 'preview' | 'config';

/** Flat entry used by Browse mode — parsed from spec files. */
interface BrowseEntry {
  title: string;
  category: string;
  keywords: string[];
  content: string;
}

/** Result of evaluateSpecInjection for Preview mode. */
interface PreviewResult {
  inject: boolean;
  content?: string;
  categories?: string[];
  specCount?: number;
  budgetAction?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOPE_LABELS: Record<string, string> = {
  project: 'Project',
  global: 'Global',
  team: 'Team',
};

const MODE_TABS: { key: string; mode: PanelMode; label: string }[] = [
  { key: 'v', mode: 'view', label: 'view' },
  { key: 'b', mode: 'browse', label: 'browse' },
  { key: 'p', mode: 'preview', label: 'preview' },
  { key: 'c', mode: 'config', label: 'config' },
];

/**
 * Agent types from AGENT_CATEGORY_MAP in spec-injector — kept as a static
 * list so the panel does not import the internal constant directly.
 */
const AGENT_TYPES = [
  'code-developer',
  'tdd-developer',
  'workflow-executor',
  'universal-executor',
  'test-fix-agent',
  'cli-lite-planning-agent',
  'action-planning-agent',
  'workflow-planner',
  'workflow-reviewer',
  'debug-explore-agent',
  'workflow-debugger',
  'general',
];

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SpecPanel({ workDir, onBack }: SpecPanelProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<PanelMode>('view');

  // Shared: scope data for View mode (loaded once)
  const [scopes, setScopes] = useState<ScopeInfo[]>([]);

  useEffect(() => {
    loadScopeStatus();
  }, []);

  async function loadScopeStatus() {
    const { existsSync, readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { resolveSpecDir } = await import('../../tools/spec-loader.js');

    const result: ScopeInfo[] = [];
    for (const scope of ['project', 'global', 'team'] as const) {
      const dir = resolveSpecDir(workDir, scope);
      const exists = existsSync(dir);
      const files: SpecFileInfo[] = [];

      if (exists) {
        const entries = readdirSync(dir).filter((f: string) => f.endsWith('.md'));
        for (const file of entries) {
          const content = readFileSync(join(dir, file), 'utf-8');
          const entryCount = (content.match(/<spec-entry\b/g) || []).length;
          files.push({ name: file, entries: entryCount, size: content.length });
        }
      }

      result.push({ scope, exists, files });
    }
    setScopes(result);
  }

  // Mode switching input — only at top level (sub-components handle their own)
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      if (onBack) onBack();
      else exit();
      return;
    }
    for (const tab of MODE_TABS) {
      if (input === tab.key) {
        setMode(tab.mode);
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">SPEC SYSTEM</Text>
        <Text> </Text>

        {/* Mode tabs */}
        <Box gap={1}>
          {MODE_TABS.map(tab => (
            <Box key={tab.mode}>
              {mode === tab.mode
                ? <Text bold inverse color="cyan">{` [${tab.key}]${tab.label} `}</Text>
                : <Text dimColor>{` [${tab.key}]${tab.label} `}</Text>
              }
            </Box>
          ))}
        </Box>
        <Text> </Text>

        {/* Mode content */}
        {mode === 'view' && <ViewMode scopes={scopes} />}
        {mode === 'browse' && <BrowseMode workDir={workDir} />}
        {mode === 'preview' && <PreviewMode workDir={workDir} />}
        {mode === 'config' && <ConfigMode workDir={workDir} />}

        <Text> </Text>
        <Text dimColor>  [v/b/p/c] mode  [q] back</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// View mode (existing behavior)
// ---------------------------------------------------------------------------

function ViewMode({ scopes }: { scopes: ScopeInfo[] }) {
  const [activeScope, setActiveScope] = useState(0);
  const [cursor, setCursor] = useState(0);

  const currentScope = scopes[activeScope];
  const fileCount = currentScope?.files.length ?? 0;

  useInput((input, key) => {
    if (key.leftArrow) {
      setActiveScope(s => Math.max(0, s - 1));
      setCursor(0);
    }
    if (key.rightArrow) {
      setActiveScope(s => Math.min(scopes.length - 1, s + 1));
      setCursor(0);
    }
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(fileCount - 1, c + 1));
  });

  if (scopes.length === 0) {
    return <Text dimColor>Loading spec status...</Text>;
  }

  return (
    <Box flexDirection="column">
      {/* Scope tabs */}
      <Box gap={1}>
        {scopes.map((s, i) => (
          <Box key={s.scope} paddingX={1}>
            {i === activeScope
              ? <Text bold inverse color="cyan">{` ${SCOPE_LABELS[s.scope]} `}</Text>
              : <Text dimColor>{` ${SCOPE_LABELS[s.scope]} `}</Text>
            }
          </Box>
        ))}
      </Box>
      <Text> </Text>

      {!currentScope.exists ? (
        <Box flexDirection="column">
          <Text color="red">  Directory not initialized</Text>
          <Text dimColor>  Run: maestro spec init --scope {currentScope.scope}</Text>
        </Box>
      ) : currentScope.files.length === 0 ? (
        <Text dimColor>  No spec files found</Text>
      ) : (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text dimColor>{pad('', 2)}</Text>
            <Text dimColor bold>{pad('File', 30)}</Text>
            <Text dimColor bold>{pad('Entries', 10)}</Text>
            <Text dimColor bold>Size</Text>
          </Box>
          {currentScope.files.map((f, i) => {
            const isCurrent = i === cursor;
            const hasEntries = f.entries > 0;
            return (
              <Box key={f.name} gap={1}>
                <Text color="cyan">{isCurrent ? '>' : ' '}</Text>
                <Text color={hasEntries ? 'green' : 'yellow'}>{hasEntries ? '+' : 'o'}</Text>
                <Text bold={isCurrent}>{pad(f.name, 29)}</Text>
                <Text dimColor={!isCurrent}>{pad(String(f.entries), 10)}</Text>
                <Text dimColor>{formatSize(f.size)}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Text> </Text>
      <Text dimColor>  {'\u2190'}/{'\u2192'} scope  {'\u2191'}/{'\u2193'} navigate</Text>
      <Text dimColor>  CLI: maestro spec {'<'}init|load|add|list|status{'>'}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Browse mode — keyword-granularity content viewer
// ---------------------------------------------------------------------------

function BrowseMode({ workDir }: { workDir: string }) {
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const { existsSync, readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { resolveSpecDir } = await import('../../tools/spec-loader.js');
    const { parseSpecEntries } = await import('../../tools/spec-entry-parser.js');
    const { CATEGORY_MAP } = await import('../../tools/spec-loader.js');

    const allEntries: BrowseEntry[] = [];

    for (const scope of ['project', 'global', 'team'] as const) {
      const dir = resolveSpecDir(workDir, scope);
      if (!existsSync(dir)) continue;

      let files: string[];
      try {
        files = readdirSync(dir).filter((f: string) => f.endsWith('.md'));
      } catch {
        continue;
      }

      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf-8');
        const parsed = parseSpecEntries(content);

        // Derive category from CATEGORY_MAP or filename
        const fileCategory = CATEGORY_MAP[file] ?? file.replace('.md', '');

        for (const entry of parsed.entries) {
          allEntries.push({
            title: entry.title || '(untitled)',
            category: entry.category || fileCategory,
            keywords: entry.keywords,
            content: entry.content,
          });
        }
      }
    }

    setEntries(allEntries);
    setLoading(false);
  }

  // Filter entries by keyword text
  const filtered = filterText
    ? entries.filter(e =>
        e.keywords.some(kw => kw.toLowerCase().includes(filterText.toLowerCase())),
      )
    : entries;

  useInput((input, key) => {
    // Filter mode: capture text
    if (filterMode) {
      if (key.escape || key.return) {
        setFilterMode(false);
        setCursor(0);
        return;
      }
      if (key.backspace || key.delete) {
        setFilterText(t => t.slice(0, -1));
        setCursor(0);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFilterText(t => t + input);
        setCursor(0);
        return;
      }
      return;
    }

    // Normal mode
    if (input === '/') {
      setFilterMode(true);
      setFilterText('');
      return;
    }
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(filtered.length - 1, c + 1));
  });

  if (loading) {
    return <Text dimColor>Loading spec entries...</Text>;
  }

  if (entries.length === 0) {
    return <Text dimColor>No spec entries found across any scope.</Text>;
  }

  const selected = filtered[cursor];

  // Determine visible window for scrolling
  const MAX_VISIBLE = 12;
  const windowStart = Math.max(0, cursor - Math.floor(MAX_VISIBLE / 2));
  const visibleEntries = filtered.slice(windowStart, windowStart + MAX_VISIBLE);
  const visibleOffset = windowStart;

  return (
    <Box flexDirection="column">
      {/* Filter bar */}
      <Box gap={1}>
        <Text dimColor>Filter:</Text>
        {filterMode ? (
          <Text color="yellow">/{filterText}<Text inverse> </Text></Text>
        ) : filterText ? (
          <Text color="green">/{filterText}</Text>
        ) : (
          <Text dimColor>(press / to filter by keyword)</Text>
        )}
        <Text dimColor>  [{filtered.length}/{entries.length}]</Text>
      </Box>
      <Text> </Text>

      {/* Entry list */}
      <Box flexDirection="column">
        <Box gap={1}>
          <Text dimColor>{pad('', 2)}</Text>
          <Text dimColor bold>{pad('Title', 30)}</Text>
          <Text dimColor bold>{pad('Category', 12)}</Text>
          <Text dimColor bold>Keywords</Text>
        </Box>
        {visibleEntries.map((e, i) => {
          const realIdx = visibleOffset + i;
          const isCurrent = realIdx === cursor;
          return (
            <Box key={`${e.category}-${e.title}-${realIdx}`} gap={1}>
              <Text color="cyan">{isCurrent ? '>' : ' '}</Text>
              <Text color="green">*</Text>
              <Text bold={isCurrent}>{pad(truncate(e.title, 28), 29)}</Text>
              <Text dimColor={!isCurrent} color="yellow">{pad(e.category, 12)}</Text>
              <Text dimColor>{truncate(e.keywords.join(', '), 40)}</Text>
            </Box>
          );
        })}
        {filtered.length > MAX_VISIBLE && (
          <Text dimColor>  ... {filtered.length - MAX_VISIBLE} more (scroll with arrows)</Text>
        )}
      </Box>

      {/* Content preview */}
      {selected && (
        <>
          <Text> </Text>
          <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
            <Text bold color="cyan">{selected.title}</Text>
            <Text dimColor>[{selected.category}] {selected.keywords.join(', ')}</Text>
            <Text> </Text>
            <Text>{truncate(selected.content.replace(/^###\s+.+\n*/m, '').trim(), 300)}</Text>
          </Box>
        </>
      )}

      <Text> </Text>
      <Text dimColor>  {'\u2191'}/{'\u2193'} navigate  [/] filter  [esc] clear filter</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Preview mode — injection preview for agent types
// ---------------------------------------------------------------------------

function PreviewMode({ workDir }: { workDir: string }) {
  const [agentIdx, setAgentIdx] = useState(0);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  const agentType = AGENT_TYPES[agentIdx];

  useEffect(() => {
    runPreview();
  }, [agentIdx]);

  async function runPreview() {
    setLoading(true);
    try {
      const { evaluateSpecInjection } = await import('../../hooks/spec-injector.js');
      const { loadSpecInjectionConfig } = await import('../../config/index.js');

      const config = loadSpecInjectionConfig(workDir);
      const res = evaluateSpecInjection(agentType, workDir, undefined, config);
      setResult(res);
    } catch {
      setResult({ inject: false });
    }
    setLoading(false);
  }

  useInput((_input, key) => {
    if (key.leftArrow) {
      setAgentIdx(i => (i > 0 ? i - 1 : AGENT_TYPES.length - 1));
    }
    if (key.rightArrow) {
      setAgentIdx(i => (i < AGENT_TYPES.length - 1 ? i + 1 : 0));
    }
  });

  return (
    <Box flexDirection="column">
      {/* Agent type selector */}
      <Box gap={1}>
        <Text dimColor>{'\u2190'}</Text>
        <Text bold inverse color="cyan">{` ${agentType} `}</Text>
        <Text dimColor>{'\u2192'}</Text>
        <Text dimColor>  ({agentIdx + 1}/{AGENT_TYPES.length})</Text>
      </Box>
      <Text> </Text>

      {loading ? (
        <Text dimColor>Evaluating injection...</Text>
      ) : result ? (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text dimColor>Inject:</Text>
            {result.inject
              ? <Text bold color="green">yes</Text>
              : <Text bold color="red">no</Text>
            }
          </Box>

          {result.inject && (
            <>
              <Box gap={1}>
                <Text dimColor>Categories:</Text>
                <Text color="yellow">{result.categories?.join(', ') ?? '-'}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Matched entries:</Text>
                <Text>{result.specCount ?? 0}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Content size:</Text>
                <Text>{formatSize(result.content?.length ?? 0)}</Text>
              </Box>
              {result.budgetAction && (
                <Box gap={1}>
                  <Text dimColor>Budget action:</Text>
                  <Text color={result.budgetAction === 'skip' ? 'red' : 'yellow'}>
                    {result.budgetAction}
                  </Text>
                </Box>
              )}
            </>
          )}

          {result.inject && result.content && (
            <>
              <Text> </Text>
              <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
                <Text bold dimColor>Content preview (first 500 chars):</Text>
                <Text>{truncate(result.content, 500)}</Text>
              </Box>
            </>
          )}
        </Box>
      ) : (
        <Text dimColor>No result.</Text>
      )}

      <Text> </Text>
      <Text dimColor>  {'\u2190'}/{'\u2192'} select agent type</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Config mode — spec injection config viewer
// ---------------------------------------------------------------------------

function ConfigMode({ workDir }: { workDir: string }) {
  const [configJson, setConfigJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const { loadSpecInjectionConfig } = await import('../../config/index.js');
      const config = loadSpecInjectionConfig(workDir);
      setConfigJson(JSON.stringify(config, null, 2));
    } catch {
      setConfigJson('{}');
    }
    setLoading(false);
  }

  if (loading) {
    return <Text dimColor>Loading config...</Text>;
  }

  const isEmpty = !configJson || configJson === '{}';

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text dimColor>Source:</Text>
        <Text>.workflow/config.json {'\u2192'} specInjection</Text>
      </Box>
      <Text> </Text>

      {isEmpty ? (
        <Box flexDirection="column">
          <Text dimColor>No spec injection config found (using defaults).</Text>
          <Text> </Text>
          <Text dimColor>To configure, create .workflow/config.json with a "specInjection" key.</Text>
          <Text dimColor>  CLI: maestro spec config</Text>
        </Box>
      ) : (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text bold dimColor>specInjection config (read-only):</Text>
          <Text> </Text>
          {configJson!.split('\n').map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )}

      <Text> </Text>
      <Text dimColor>  Edit: .workflow/config.json (specInjection key)</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}
