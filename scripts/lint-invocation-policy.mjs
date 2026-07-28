import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const automatic = new Set(['maestro-next', 'maestro', 'maestro-ralph', 'maestro-companion']);

function policyFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...policyFiles(path));
    else if (entry.isFile() && /\.(?:md|toml)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function delegateInvocations(text) {
  const invocations = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('maestro delegate', cursor);
    if (start < 0) break;
    let quote;
    let end = start;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (char === '\\') {
        end += 1;
        continue;
      }
      if (quote) {
        if (char === quote) quote = undefined;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '\n') break;
    }
    invocations.push({
      text: text.slice(start, end),
      line: text.slice(0, start).split(/\r?\n/).length,
    });
    cursor = Math.max(end + 1, start + 1);
  }
  return invocations;
}

function metadata(path) {
  const match = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  return Object.fromEntries(match[1].split(/\r?\n/).flatMap(line => {
    const item = line.match(/^([a-zA-Z][\w-]*):\s*(.*?)\s*$/);
    return item ? [[item[1], item[2].replace(/^['"]|['"]$/g, '')]] : [];
  }));
}

const errors = [];
const commands = join(root, '.claude', 'commands');
for (const file of readdirSync(commands).filter(file => file.endsWith('.md'))) {
  const path = join(commands, file);
  const data = metadata(path);
  const name = data.name || file.slice(0, -3);
  const expected = automatic.has(name) ? 'false' : 'true';
  if (data['disable-model-invocation'] !== expected) errors.push(`${relative(root, path)}: expected disable-model-invocation: ${expected}`);
}

const skills = join(root, '.claude', 'skills');
for (const dir of readdirSync(skills)) {
  const path = join(skills, dir, 'SKILL.md');
  if (existsSync(path) && metadata(path)['disable-model-invocation'] !== 'true') errors.push(`${relative(root, path)}: skills are not automatic entrypoints`);
}

const catalog = readFileSync(join(root, 'workflows', 'maestro.md'), 'utf8');
if (/['"]team_[a-z_]+['"]\s*:|cmd:\s*['"]team-/.test(catalog)) errors.push('workflows/maestro.md: team ecosystems must not appear in automatic chain routing');

for (const sourceRoot of [
  join(root, 'workflows'),
  join(root, '.claude', 'commands'),
  join(root, '.claude', 'skills'),
  join(root, '.claude', 'agents'),
  join(root, '.codex', 'skills'),
  join(root, '.codex', 'agents'),
  join(root, '.codex', 'agent-overrides'),
]) {
  for (const path of policyFiles(sourceRoot)) {
    const content = readFileSync(path, 'utf8');
    for (const invocation of delegateInvocations(content)) {
      if (!/--(?:to|role|mode|model|effort)\b/.test(invocation.text)) continue;
      const location = `${relative(root, path)}:${invocation.line}`;
      const provider = invocation.text.match(/--to\s+(codex|claude)\b/)?.[1];
      if (!provider) continue;
      if (!/--model\s+\S+/.test(invocation.text)) {
        errors.push(`${location}: ${provider} Delegate must include explicit --model`);
      }
      if (!/--effort\s+(?:low|medium|high|max)\b/.test(invocation.text)) {
        errors.push(`${location}: ${provider} Delegate must include explicit --effort`);
      }
      if (provider === 'claude') {
        if (!/--mode\s+analysis\b/.test(invocation.text)) {
          errors.push(`${location}: Claude Delegate is consultation-only and must use --mode analysis`);
        }
        if (!invocation.text.includes('QUESTION:') || !invocation.text.includes('EVIDENCE:')) {
          errors.push(`${location}: Claude consultation must include QUESTION and EVIDENCE`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`invocation policy lint failed: ${errors.length} issue(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else console.log('invocation policy lint passed: automatic entrypoints and Delegate provider contracts are valid');
