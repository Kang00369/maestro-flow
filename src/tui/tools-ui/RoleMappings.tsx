import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { CliToolsConfig } from '../../config/cli-tools-config.js';
import { C } from '../shared/index.js';

export interface RoleMappingsProps {
  config: CliToolsConfig;
  workDir: string;
  onBack: () => void;
  onReload: () => void;
}

export function RoleMappings({ config, workDir, onBack, onReload }: RoleMappingsProps) {
  void config;
  void workDir;
  void onReload;
  useInput((_input, key) => { if (key.escape) onBack(); });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={C.primary}>Explicit Agent Selection</Text>
      <Text> </Text>
      <Text>Role-based tool routing and fallback chains have been removed.</Text>
      <Text>Pass an enabled agent explicitly with <Text color={C.warning}>--to &lt;tool&gt;</Text>.</Text>
      <Text dimColor>--role remains available only for targeted project-spec injection.</Text>
      <Text> </Text>
      <Text dimColor>[Esc] Back</Text>
    </Box>
  );
}
