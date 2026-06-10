/**
 * Search Command — Unified knowledge search across specs, knowhow, issues, and more.
 *
 * Uses WikiIndexer BM25 search with deduplication and type filtering.
 * Replaces per-domain search subcommands with a single top-level entry point.
 */

import type { Command } from 'commander';
import { resolve } from 'node:path';

import { truncate } from '../utils/cli-format.js';
import { WikiIndexer } from '#maestro-dashboard/wiki/wiki-indexer.js';
import type { WikiEntry, WikiNodeType } from '#maestro-dashboard/wiki/wiki-types.js';

// Valid type filter values — matches WikiNodeType.
const VALID_TYPES = ['project', 'roadmap', 'spec', 'issue', 'knowhow', 'note'] as const;

// ── Lazy offline client ────────────────────────────────────────────────

let _indexer: WikiIndexer | null = null;

function getIndexer(): WikiIndexer {
  if (!_indexer) {
    const workflowRoot = resolve('.workflow');
    _indexer = new WikiIndexer({ workflowRoot });
  }
  return _indexer;
}

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query...>')
    .description('Unified knowledge search across specs, knowhow, issues, and more')
    .option('--type <type>', 'Filter by type: spec, knowhow, issue, project, roadmap, note')
    .option('--category <cat>', 'Filter by category (e.g. coding, arch, debug, test, review, learning)')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (queryParts: string[], opts) => {
      const q = queryParts.join(' ');
      const limit = parseInt(opts.limit, 10) || 20;

      // Validate --type if provided
      if (opts.type && !VALID_TYPES.includes(opts.type)) {
        console.error(`Error: --type must be one of ${VALID_TYPES.join(', ')} (got "${opts.type}")`);
        process.exit(1);
      }

      const indexer = getIndexer();

      // BM25 search — returns WikiEntry[] ranked by relevance.
      const results = await indexer.search(q, limit);

      // Apply type filter
      let filtered: WikiEntry[] = results;
      if (opts.type) {
        filtered = results.filter(r => r.type === opts.type);
      }

      // Apply category filter
      if (opts.category) {
        filtered = filtered.filter(r => r.category === opts.category);
      }

      // Deduplicate: same source path keeps only the first (highest-ranked) entry.
      const seen = new Map<string, WikiEntry>();
      for (const r of filtered) {
        const sourceKey = r.source?.path || r.id;
        if (!seen.has(sourceKey)) {
          seen.set(sourceKey, r);
        }
      }
      const deduped = [...seen.values()];

      if (opts.json) {
        console.log(JSON.stringify({
          query: q,
          count: deduped.length,
          results: deduped.map(r => ({
            id: r.id,
            type: r.type,
            title: r.title,
            category: r.category,
            summary: r.summary,
            source: r.source,
          })),
        }, null, 2));
        return;
      }

      console.log(`Search: "${q}" (${deduped.length} results)`);
      if (deduped.length === 0) {
        console.log('  No matches found.');
        return;
      }
      for (const r of deduped) {
        const typeTag = `[${r.type}]`;
        const catTag = r.category ? ` ${r.category}` : '';
        console.log(`  ${typeTag}${catTag}  ${r.id}  ${r.title}`);
        if (r.summary) {
          console.log(`    ${truncate(r.summary, 80)}`);
        }
      }
    });
}
