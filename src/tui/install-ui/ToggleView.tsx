import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { C, SYM, KeyHints } from '../shared/index.js';
import {
  scanInstalledItems,
  toggleItem,
  updateManifestDisabledItems,
  type InstalledItem,
} from '../../commands/install-backend.js';

// ---------------------------------------------------------------------------
// ToggleView — standalone TUI for enabling/disabling commands, skills, agents
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  command: '── Commands ──────────────────',
  skill: '── Skills ────────────────────',
  agent: '── Agents ────────────────────',
};

const TYPE_ORDER = ['command', 'skill', 'agent'];

export interface ToggleViewProps {
  targetBase: string;
  scope: 'global' | 'project';
  targetPath: string;
  filter?: string;
}

export function ToggleView({ targetBase, scope, targetPath, filter }: ToggleViewProps) {
  const { exit } = useApp();
  const [items, setItems] = useState<InstalledItem[]>(() => {
    const all = scanInstalledItems(targetBase);
    return filter ? all.filter((i) => i.type === filter) : all;
  });
  const [cursor, setCursor] = useState(0);
  const [dirty, setDirty] = useState(false);

  const count = items.length;

  const groups = useMemo(() => {
    const map = new Map<string, InstalledItem[]>();
    for (const item of items) {
      if (!map.has(item.type)) map.set(item.type, []);
      map.get(item.type)!.push(item);
    }
    return TYPE_ORDER
      .filter((t) => map.has(t))
      .map((t) => ({ type: t, label: TYPE_LABELS[t] || t, items: map.get(t)! }));
  }, [items]);

  const handleToggle = useCallback((idx: number) => {
    if (idx < 0 || idx >= count) return;
    const item = items[idx];
    if (toggleItem(item)) {
      setItems((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], enabled: !next[idx].enabled };
        return next;
      });
      setDirty(true);
    }
  }, [items, count]);

  const handleSave = useCallback(() => {
    const disabledNames = items.filter((i) => !i.enabled).map((i) => `${i.type}:${i.name}`);
    updateManifestDisabledItems(scope, targetPath, disabledNames);
    exit();
  }, [items, scope, targetPath, exit]);

  useInput((input, key) => {
    if (key.escape) {
      if (dirty) handleSave();
      exit();
      return;
    }
    if (key.return) {
      handleSave();
      return;
    }
    if (key.upArrow) {
      setCursor((i) => (i - 1 + count) % count);
      return;
    }
    if (key.downArrow) {
      setCursor((i) => (i + 1) % count);
      return;
    }
    if (input === ' ') {
      handleToggle(cursor);
      return;
    }
    // Number keys
    const num = parseInt(input, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= Math.min(count, 9)) {
      handleToggle(num - 1);
    }
  });

  if (count === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={C.primary}>Maestro Toggle</Text>
        <Text dimColor>No installed items found. Run `maestro install` first.</Text>
      </Box>
    );
  }

  const enabledCount = items.filter((i) => i.enabled).length;
  let globalIndex = 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={C.primary}>Maestro Toggle — Enable/Disable Commands & Skills</Text>
      <Text dimColor>Changes take effect immediately (file rename). Manifest updated on exit.</Text>

      <Box flexDirection="column" marginTop={1}>
        {groups.map((group) => {
          const rows = group.items.map((item) => {
            const i = globalIndex++;
            const hl = i === cursor;
            return (
              <Box key={item.name}>
                <Text color={C.neutral}>{String(i + 1).padStart(2)}. </Text>
                <Text color={item.enabled ? (hl ? C.successBright : C.success) : (hl ? C.error : C.neutral)}>
                  {item.enabled ? SYM.checkOn : SYM.checkOff}
                </Text>
                <Text> </Text>
                <Text color={hl ? C.primary : undefined} bold={hl}>
                  {item.name.padEnd(30)}
                </Text>
                {!item.enabled && <Text color={C.neutral} dimColor>[disabled]</Text>}
              </Box>
            );
          });

          return (
            <React.Fragment key={group.type}>
              <Box marginTop={1}>
                <Text color={C.neutral} dimColor>{group.label}</Text>
              </Box>
              {rows}
            </React.Fragment>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {enabledCount}/{count} enabled
          {dirty ? '  (changes pending)' : ''}
        </Text>
      </Box>

      <KeyHints hints="↑↓ navigate  ␣ toggle  ↵ save & exit  esc quit" />
    </Box>
  );
}
