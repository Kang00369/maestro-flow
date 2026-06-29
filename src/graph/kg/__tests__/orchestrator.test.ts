import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MaestroGraph } from '../engine.js';
import { syncKnowledgeGraph } from '../extraction/orchestrator.js';

describe('MaestroGraph extraction orchestrator', () => {
  it('indexes the project root by default and lets ignore rules exclude paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'maestro-orchestrator-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(root, 'tauri', 'src-tauri'), { recursive: true });
      mkdirSync(join(root, 'ignored'), { recursive: true });
      writeFileSync(join(root, '.maestroignore'), 'ignored/\n');
      writeFileSync(join(root, 'src', 'app.yml'), 'service:\n  name: app\n');
      writeFileSync(join(root, 'tauri', 'src-tauri', 'app.yml'), 'service:\n  name: tauri\n');
      writeFileSync(join(root, 'ignored', 'app.yml'), 'service:\n  name: ignored\n');

      const results = await syncKnowledgeGraph(root, {
        sources: ['codegraph'],
        codegraph: { createMaestroIgnore: false },
      });
      const codegraphResult = results.find(result => result.source === 'codegraph');

      expect(codegraphResult?.nodesAdded).toBe(2);

      const graph = await MaestroGraph.open(root);
      try {
        const files = graph
          .getQueryBuilder()
          .getNodesBySourceType('codegraph')
          .map(node => node.filePath)
          .sort();

        expect(files).toEqual([
          join(root, 'src', 'app.yml'),
          join(root, 'tauri', 'src-tauri', 'app.yml'),
        ]);
      } finally {
        graph.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('indexes operational documents into the knowledge graph', async () => {
    const root = mkdtempSync(join(tmpdir(), 'maestro-codebase-docs-'));
    try {
      mkdirSync(join(root, 'templates', 'nginx'), { recursive: true });
      writeFileSync(join(root, 'README.md'), '# Deploy Notes\n\nUse same-origin mode for NAT deployments.\n');
      writeFileSync(
        join(root, 'templates', 'nginx', 'pelican-nat-same-origin.conf'),
        'location = /api/servers { proxy_pass http://127.0.0.1:8080; }\n',
      );

      const results = await syncKnowledgeGraph(root, {
        sources: ['codebase'],
      });
      const codebaseResult = results.find(result => result.source === 'codebase');

      expect(codebaseResult?.nodesAdded).toBeGreaterThan(0);

      const graph = await MaestroGraph.open(root);
      try {
        const matches = graph.searchKnowledge('same-origin', { sourceTypes: ['codebase'], limit: 10 });
        const matchPaths = matches.map(node => node.filePath).sort();

        expect(matchPaths).toContain(join(root, 'README.md'));
        expect(matchPaths).toContain(join(root, 'templates', 'nginx', 'pelican-nat-same-origin.conf'));
      } finally {
        graph.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
