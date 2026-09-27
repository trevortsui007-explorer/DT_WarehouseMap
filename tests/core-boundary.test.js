import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve('src/core');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]
  );
}
test('core imports remain inside core and have no browser/platform dependencies', () => {
  for (const file of files(root)) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(code, file).not.toMatch(/\b(window|document|localStorage|sessionStorage|fetch|indexedDB|XMLHttpRequest)\b/);
    for (const [, dependency] of code.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)) {
      expect(dependency.startsWith('.'), file).toBe(true);
      expect(resolve(dirname(file), dependency).startsWith(root), file).toBe(true);
    }
  }
});
