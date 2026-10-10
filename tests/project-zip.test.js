import { expect, test } from 'vitest';
import { seed } from '../src/core/model/model.js';
import { projectBackup, emptyResources } from '../src/core/workspace/resources.js';
import { createProjectZip, readProjectFile } from '../src/infrastructure/import-export/project-zip.js';
const file = bytes => ({
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});
test('ZIP roundtrip preserves layout and independent image settings', async () => {
  const resources = emptyResources();
  resources.underlay = {
    name: '底图',
    dataUrl: 'data:image/png;base64,AAAA',
    pixelWidth: 100,
    pixelHeight: 50,
    x: 2,
    y: 3,
    rotation: 30,
    scale: 0.2,
    opacity: 0.5,
    visible: true,
    locked: true,
    calibration: null,
    needsReview: false,
  };
  const backup = projectBackup(seed(), resources);
  const result = await readProjectFile(file(await createProjectZip(backup)));
  expect(result.backup.layout).toEqual(backup.layout);
  expect(result.backup.resources).toEqual(backup.resources);
});
test('JSON layout and both legacy backup versions remain supported', async () => {
  const backup = projectBackup(seed(), emptyResources());
  for (const value of [backup.layout, backup, { ...backup, formatVersion: 1 }]) {
    const parsed = await readProjectFile(file(new TextEncoder().encode(JSON.stringify(value))));
    expect(parsed.backup.layout.racks).toEqual(backup.layout.racks);
  }
  await expect(readProjectFile(file(new Uint8Array([80, 75, 0, 0])))).rejects.toThrow();
});
