import { expect, test } from 'vitest';
import { seed } from '../src/core/model/model.js';
import { parseWorkspaceImport } from '../src/core/workspace/import-workspace.js';
import { projectBackup, emptyResources } from '../src/core/workspace/resources.js';
test('plain layout imports as local project without losing slot identities', () => {
  const original = seed();
  const result = parseWorkspaceImport('\uFEFF' + JSON.stringify(original));
  expect(result.layoutOnly).toBe(true);
  expect(result.backup.layout.racks).toEqual(original.racks);
  expect(result.backup.resources).toEqual(emptyResources());
});
test('project backup retains names and strict format validation', () => {
  const backup = projectBackup(seed(), emptyResources(), { projectName: '跨电脑', schemeName: '现状' });
  expect(parseWorkspaceImport(JSON.stringify(backup)).backup.names).toEqual(backup.names);
  expect(parseWorkspaceImport(JSON.stringify(backup)).layoutOnly).toBe(false);
  expect(() => parseWorkspaceImport(JSON.stringify({ ...backup, formatVersion: 99 }))).toThrow();
  expect(() => parseWorkspaceImport(JSON.stringify({ ...seed(), format: 'broken' }))).toThrow();
  expect(() => parseWorkspaceImport(JSON.stringify({ ...seed(), schemaVersion: 999 }))).toThrow();
});
