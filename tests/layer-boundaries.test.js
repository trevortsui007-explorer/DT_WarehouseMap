import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
const files = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
  );
test('graphics libraries are isolated; renderers have no persistence or session history dependency', () => {
  for (const path of files('src').filter(path => /\.(js|vue)$/.test(path))) {
    const source = readFileSync(path, 'utf8');
    if (/(?:application|components|views)/.test(path))
      expect(source, path).not.toMatch(
        /\b(?:localStorage|indexedDB)\s*\.|\bfetch\s*\(|from ['"](?:dexie|@microsoft\/signalr)['"]/
      );
    if (!path.includes('renderers')) expect(source, path).not.toMatch(/from ['"](?:konva|three)(?:\/[^'"]*)?['"]/);
    else
      expect(source, path).not.toMatch(
        /\b(localStorage|indexedDB|Dexie|fetch)\b|from ['"][^'"]*(?:application|infrastructure)/
      );
  }
});
