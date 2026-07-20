import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

export type MaestroEntrypoint =
  | 'maestro.js'
  | 'maestro-mcp.js'
  | 'maestro-statusline.js'
  | 'maestro-context-monitor.js';

let cachedPackageRoot: string | undefined;

/** Resolve the package root from either src/ or compiled dist/src/ modules. */
export function getMaestroPackageRoot(): string {
  if (cachedPackageRoot) return cachedPackageRoot;

  let current = dirname(fileURLToPath(import.meta.url));
  const filesystemRoot = parse(current).root;
  while (true) {
    if (
      existsSync(join(current, 'package.json'))
      && existsSync(join(current, 'bin', 'maestro.js'))
    ) {
      cachedPackageRoot = current;
      return current;
    }
    if (current === filesystemRoot) break;
    current = dirname(current);
  }

  throw new Error('Unable to locate the maestro-flow package root');
}

export function getMaestroEntrypoint(name: MaestroEntrypoint): string {
  return join(getMaestroPackageRoot(), 'bin', name);
}

export function getMaestroNodeInvocation(name: MaestroEntrypoint): {
  command: string;
  args: string[];
} {
  return {
    command: process.execPath,
    args: [getMaestroEntrypoint(name)],
  };
}

function quoteShellPath(value: string): string {
  if (process.platform === 'win32') return `"${value}"`;
  return `"${value.replace(/[\\"$`]/g, '\\$&')}"`;
}

/** Build a shell command without relying on npm shims or executable JS files. */
export function getMaestroEntrypointCommand(name: MaestroEntrypoint): string {
  const invocation = getMaestroNodeInvocation(name);
  return `${quoteShellPath(invocation.command)} ${quoteShellPath(invocation.args[0])}`;
}

export function getMaestroHookCommand(hookName: string): string {
  return `${getMaestroEntrypointCommand('maestro.js')} hooks run ${hookName}`;
}
