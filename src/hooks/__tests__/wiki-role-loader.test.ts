/**
 * Wiki Role Loader — comprehensive tests
 *
 * Covers: loadWikiByRole (role-based wiki knowledge loading from persisted index)
 * Guide coverage: Role 角色化检索 + 三层加载设计 (wiki-index.json → role filter → inject)
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadWikiByRole } from '../wiki-role-loader.js';

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'maestro-test-wiki-role-'));
  mkdirSync(join(testDir, '.workflow'), { recursive: true });
});

afterEach(() => {
  if (testDir && existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function writeWikiIndex(entries: Array<{
  type: string;
  title: string;
  summary: string;
  roles?: string[];
  updated: string;
}>): void {
  writeFileSync(
    join(testDir, '.workflow', 'wiki-index.json'),
    JSON.stringify({ entries }),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Basic role loading
// ---------------------------------------------------------------------------

describe('loadWikiByRole — basic', () => {
  it('returns entries matching the requested role', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Auth API Design', summary: 'JWT refresh patterns', roles: ['implement', 'review'], updated: '2026-05-01' },
      { type: 'knowhow', title: 'Cache Strategy', summary: 'Redis caching layer', roles: ['implement'], updated: '2026-04-30' },
      { type: 'spec', title: 'Architecture Rules', summary: 'Layered arch', roles: ['plan'], updated: '2026-04-29' },
    ]);

    const result = loadWikiByRole(testDir, 'implement');
    expect(result).not.toBeNull();
    expect(result!.entryCount).toBe(2);
    expect(result!.content).toContain('Auth API Design');
    expect(result!.content).toContain('Cache Strategy');
    expect(result!.content).not.toContain('Architecture Rules');
  });

  it('returns null when no entries match the role', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Auth Design', summary: 'Content', roles: ['implement'], updated: '2026-05-01' },
    ]);

    const result = loadWikiByRole(testDir, 'brainstorm');
    expect(result).toBeNull();
  });

  it('returns null when wiki-index.json does not exist', () => {
    const result = loadWikiByRole(testDir, 'implement');
    expect(result).toBeNull();
  });

  it('returns null when entries array is empty', () => {
    writeWikiIndex([]);
    const result = loadWikiByRole(testDir, 'implement');
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON in wiki-index.json', () => {
    writeFileSync(
      join(testDir, '.workflow', 'wiki-index.json'),
      'not valid json',
      'utf-8',
    );
    const result = loadWikiByRole(testDir, 'implement');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Content formatting
// ---------------------------------------------------------------------------

describe('loadWikiByRole — content formatting', () => {
  it('formats entries with type, title, and summary', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Auth Pattern', summary: 'Use JWT with rotation', roles: ['implement'], updated: '2026-05-01' },
    ]);

    const result = loadWikiByRole(testDir, 'implement');
    expect(result!.content).toContain('# Wiki Knowledge (role: implement)');
    expect(result!.content).toContain('### [knowhow] Auth Pattern');
    expect(result!.content).toContain('Use JWT with rotation');
  });

  it('includes separator between multiple entries', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Entry A', summary: 'Summary A', roles: ['implement'], updated: '2026-05-01' },
      { type: 'spec', title: 'Entry B', summary: 'Summary B', roles: ['implement'], updated: '2026-04-30' },
    ]);

    const result = loadWikiByRole(testDir, 'implement');
    expect(result!.content).toContain('---');
    expect(result!.content).toContain('Entry A');
    expect(result!.content).toContain('Entry B');
  });
});

// ---------------------------------------------------------------------------
// Sorting and limiting
// ---------------------------------------------------------------------------

describe('loadWikiByRole — sorting and limits', () => {
  it('sorts entries by updated date (newest first)', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Old Entry', summary: 'Old', roles: ['implement'], updated: '2026-01-01' },
      { type: 'knowhow', title: 'New Entry', summary: 'New', roles: ['implement'], updated: '2026-05-10' },
      { type: 'knowhow', title: 'Mid Entry', summary: 'Mid', roles: ['implement'], updated: '2026-03-15' },
    ]);

    const result = loadWikiByRole(testDir, 'implement');
    const contentLines = result!.content;
    const newIdx = contentLines.indexOf('New Entry');
    const midIdx = contentLines.indexOf('Mid Entry');
    const oldIdx = contentLines.indexOf('Old Entry');
    expect(newIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(oldIdx);
  });

  it('limits to 10 entries maximum', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      type: 'knowhow',
      title: `Entry ${i + 1}`,
      summary: `Summary ${i + 1}`,
      roles: ['analyze'],
      updated: `2026-05-${String(i + 1).padStart(2, '0')}`,
    }));

    writeWikiIndex(entries);

    const result = loadWikiByRole(testDir, 'analyze');
    expect(result!.entryCount).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Role filtering edge cases
// ---------------------------------------------------------------------------

describe('loadWikiByRole — edge cases', () => {
  it('handles entries without roles field', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'No Roles', summary: 'Content', updated: '2026-05-01' },
      { type: 'knowhow', title: 'Has Role', summary: 'Content', roles: ['implement'], updated: '2026-05-01' },
    ]);

    const result = loadWikiByRole(testDir, 'implement');
    expect(result!.entryCount).toBe(1);
    expect(result!.content).toContain('Has Role');
    expect(result!.content).not.toContain('No Roles');
  });

  it('handles entries with empty roles array', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Empty Roles', summary: 'Content', roles: [], updated: '2026-05-01' },
      { type: 'knowhow', title: 'Has Role', summary: 'Content', roles: ['review'], updated: '2026-05-01' },
    ]);

    const result = loadWikiByRole(testDir, 'review');
    expect(result!.entryCount).toBe(1);
    expect(result!.content).toContain('Has Role');
  });

  it('matches exact role string (no partial matching)', () => {
    writeWikiIndex([
      { type: 'knowhow', title: 'Implement Entry', summary: 'Content', roles: ['implement'], updated: '2026-05-01' },
    ]);

    // "impl" should NOT match "implement"
    const result = loadWikiByRole(testDir, 'impl');
    expect(result).toBeNull();
  });

  it('supports all 7 delegate roles', () => {
    const roles = ['analyze', 'explore', 'review', 'implement', 'plan', 'brainstorm', 'research'];
    const entries = roles.map((role, i) => ({
      type: 'knowhow',
      title: `Entry for ${role}`,
      summary: `Content for ${role}`,
      roles: [role],
      updated: `2026-05-${String(i + 1).padStart(2, '0')}`,
    }));

    writeWikiIndex(entries);

    for (const role of roles) {
      const result = loadWikiByRole(testDir, role);
      expect(result).not.toBeNull();
      expect(result!.entryCount).toBe(1);
      expect(result!.content).toContain(`Entry for ${role}`);
    }
  });
});
