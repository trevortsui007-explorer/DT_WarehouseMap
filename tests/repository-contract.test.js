import { expect, test } from 'vitest';
import { createLegacyWorkspaceRepository } from '../src/infrastructure/persistence/legacy/legacy-workspace-repository.js';
import { seed } from '../src/core/model/model.js';
import { ensureSpatial } from '../src/core/spatial/spatial.js';
test('asynchronous workspace contract preserves draft, before-replacement backup and history', async () => {
  const data = new Map();
  const repository = createLegacyWorkspaceRepository({
    getItem: key => data.get(key),
    setItem: (key, value) => data.set(key, value),
  });
  expect(await repository.load()).toBe(null);
  const initial = ensureSpatial(seed());
  await repository.save(initial, 'initial');
  const next = structuredClone(initial);
  next.racks[0].x += 1;
  await repository.save(next, 'import', initial);
  expect((await repository.load()).model).toEqual(next);
  const backup = (await repository.history()).find(item => item.label === '替换前备份');
  expect(backup.model).toEqual(initial);
});
