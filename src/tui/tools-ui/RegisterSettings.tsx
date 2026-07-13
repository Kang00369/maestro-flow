import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { existsSync } from 'node:fs';
import {
  saveCliToolsConfig,
  type CliToolsConfig,
} from '../../config/cli-tools-config.js';
import { C, SYM } from '../shared/index.js';

export interface RegisterSettingsProps {
  config: CliToolsConfig;
  workDir: string;
  onBack: () => void;
}

type Phase = 'name' | 'path' | 'scope' | 'saving' | 'done' | 'error';

export function RegisterSettings({ config, workDir, onBack }: RegisterSettingsProps) {
  const [phase, setPhase] = useState<Phase>('name');
  const [alias, setAlias] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Existing aliases
  const existing = Object.entries(config.tools)
    .filter(([, e]) => e.baseTool === 'claude')
    .map(([name, e]) => ({ name, settings: e.settingsFile ?? '—' }));

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }

    if (phase === 'scope') {
      if (input === 'g') doSave('global');
      if (input === 'p') doSave('workspace');
    }

    if (phase === 'done' || phase === 'error') {
      if (key.return || key.escape) onBack();
    }
  });

  const handleNameSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Name is required'); return; }
    setAlias(trimmed);
    setError('');
    const ex = config.tools[trimmed];
    if (ex?.settingsFile) setPath(ex.settingsFile);
    setPhase('path');
  };

  const handlePathSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Path is required'); return; }

    const expanded = trimmed.startsWith('~/')
      ? trimmed.replace('~', process.env.HOME ?? process.env.USERPROFILE ?? '~')
      : trimmed;

    if (!existsSync(expanded)) { setError(`File not found: ${expanded}`); return; }

    setPath(trimmed);
    setError('');
    setPhase('scope');
  };

  const doSave = async (scope: 'global' | 'workspace') => {
    setPhase('saving');
    try {
      const isBase = alias === 'claude';
      const base = config.tools.claude ?? { enabled: true, primaryModel: '', tags: [], type: 'builtin' };
      const entry = config.tools[alias] ?? {
        enabled: true,
        primaryModel: isBase ? base.primaryModel : base.primaryModel,
        tags: isBase ? base.tags : base.tags,
        type: 'builtin',
      };

      const toolUpdate = {
        ...entry,
        settingsFile: path,
        ...(!isBase ? { baseTool: 'claude' } : {}),
      };

      await saveCliToolsConfig(
        { tools: { [alias]: toolUpdate } },
        scope,
        workDir,
      );
      setMessage(`${alias} → ${path} saved to ${scope}`);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={C.primary}>Register Settings (Claude)</Text>
      <Text> </Text>

      {existing.length > 0 && (
        <>
          <Text dimColor>Existing aliases:</Text>
          {existing.map(e => (
            <Box key={e.name} gap={1}>
              <Text dimColor>  </Text>
              <Text bold>{e.name}</Text>
              <Text dimColor>→ {e.settings}</Text>
            </Box>
          ))}
          <Text> </Text>
        </>
      )}

      {phase === 'name' && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text>Name:</Text>
            <TextInput
              placeholder="claude-analysis (or 'claude' for base)"
              onSubmit={handleNameSubmit}
            />
          </Box>
          {error && <Text color={C.error}>  {error}</Text>}
          <Text dimColor>Enter alias name. Use "claude" to set base settings.</Text>
        </Box>
      )}

      {phase === 'path' && (
        <Box flexDirection="column">
          <Box gap={1}><Text>Name:</Text><Text bold color={C.success}>{alias}</Text></Box>
          <Box gap={1}>
            <Text>Path:</Text>
            <TextInput
              defaultValue={path}
              placeholder="~/.maestro/profiles/claude-analysis.json"
              onSubmit={handlePathSubmit}
            />
          </Box>
          {error && <Text color={C.error}>  {error}</Text>}
        </Box>
      )}

      {phase === 'scope' && (
        <Box flexDirection="column">
          <Box gap={1}><Text>Name:</Text><Text bold color={C.success}>{alias}</Text></Box>
          <Box gap={1}><Text>Path:</Text><Text dimColor>{path}</Text></Box>
          <Text> </Text>
          <Text>Save to:</Text>
          <Box gap={2}><Text color={C.primary}>[g]</Text><Text>Global</Text></Box>
          <Box gap={2}><Text color={C.primary}>[p]</Text><Text>Project</Text></Box>
        </Box>
      )}

      {phase === 'saving' && <Text dimColor>Saving...</Text>}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Text color={C.success}>{SYM.enabled} {message}</Text>
          <Text dimColor>[Enter] Back</Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color={C.error}>{SYM.disabled} {error}</Text>
          <Text dimColor>[Enter] Back</Text>
        </Box>
      )}
    </Box>
  );
}
