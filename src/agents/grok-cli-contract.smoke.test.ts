import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  assertGrokCliHelpContract,
  missingGrokCliContractFlags,
} from '../../shared/grok-cli-contract.js';

function runGrok(...args: string[]) {
  return spawnSync('grok', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });
}

describe('Grok CLI contract validation', () => {
  it('reports every missing adapter flag in one compatibility error', () => {
    const help = 'Usage: grok\n  --prompt-file <PATH>\n  --resume <ID>\n';

    expect(missingGrokCliContractFlags(help)).toEqual([
      '--output-format',
      '--model',
      '--reasoning-effort',
      '--permission-mode',
      '--sandbox',
      '--session-id',
    ]);
    expect(() => assertGrokCliHelpContract(help)).toThrow(
      /missing flags: --output-format, --model/,
    );
  });
});

const versionProbe = runGrok('--version');
const grokInstalled = versionProbe.status === 0;
const requireInstalledSmoke = process.env.MAESTRO_REQUIRE_GROK_CLI_SMOKE === '1';
const installedSuite = grokInstalled || requireInstalledSmoke ? describe : describe.skip;

installedSuite('installed Grok CLI contract (smoke)', () => {
  it('exposes every flag used by the headless adapter and session bridge', () => {
    expect(versionProbe.error).toBeUndefined();
    expect(versionProbe.status).toBe(0);
    expect(`${versionProbe.stdout}${versionProbe.stderr}`).toMatch(/grok\s+\d+\.\d+/i);

    const help = runGrok('--help');
    expect(help.error).toBeUndefined();
    expect(help.status).toBe(0);
    expect(() => assertGrokCliHelpContract(`${help.stdout}${help.stderr}`)).not.toThrow();
  });
});
