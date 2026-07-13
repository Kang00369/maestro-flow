import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { CliToolsConfig } from '../../config/cli-tools-config.js';
import { C, pad } from '../shared/index.js';

export interface CommandReferenceProps {
  config: CliToolsConfig;
  onBack: () => void;
}

export function CommandReference({ config, onBack }: CommandReferenceProps) {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  const entries = Object.entries(config.tools);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={C.primary}>Command Reference</Text>
      <Text dimColor>Delegate calls must name an enabled agent explicitly.</Text>
      <Text> </Text>

      <Box gap={1}>
        <Text dimColor>{pad('Agent', 18)}</Text>
        <Text dimColor>{pad('State', 10)}</Text>
        <Text dimColor>Model</Text>
      </Box>
      <Text dimColor>{'─'.repeat(64)}</Text>

      {entries.map(([name, entry]) => (
        <Box key={name} gap={1}>
          <Text>{pad(name, 18)}</Text>
          <Text color={entry.enabled ? C.success : C.error}>{pad(entry.enabled ? 'enabled' : 'disabled', 10)}</Text>
          <Text dimColor>{entry.primaryModel || '—'}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Text>maestro delegate "..." --to codex --model gpt-5.6-luna --mode analysis</Text>
      <Text dimColor>--role only controls targeted spec injection; it never selects an agent.</Text>
      <Text dimColor>[Esc] Back</Text>
    </Box>
  );
}
