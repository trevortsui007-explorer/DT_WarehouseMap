// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { slots } from '../src/core/model/model.js';
import { generateCodes, pasteCodes, previewCodes } from '../src/core/model/batch-codes.js';
import { createLayoutCommands } from '../src/application/commands/layout-commands.js';
import { createSessionHistory } from '../src/application/history/session-history.js';
import BatchCodeDialog from '../src/components/dialogs/BatchCodeDialog.vue';
const fixture = () => {
  const rack = { id: 'rack', name: 'R', cols: 3, levels: 2 };
  rack.slots = slots(rack);
  return { racks: [rack] };
};
const options = { prefix: 'H', start: 901, step: 1, digits: 3, suffix: '-{层号}', level: 0, reverse: false };
test('generation preserves identities, supports level scope and right-to-left numbering', () => {
  const layout = fixture(),
    rack = layout.racks[0],
    before = JSON.stringify(layout);
  expect(generateCodes(rack, options).map(row => row.code)).toEqual([
    'H901-1',
    'H902-1',
    'H903-1',
    'H901-2',
    'H902-2',
    'H903-2',
  ]);
  expect(generateCodes(rack, { ...options, level: 2, reverse: true }).map(row => row.code)).toEqual([
    'H903-2',
    'H902-2',
    'H901-2',
  ]);
  expect(JSON.stringify(layout)).toBe(before);
});
test('Excel paste goes down from upper level and rejects overflow without partial mutation', () => {
  const rack = fixture().racks[0];
  expect(pasteCodes(rack, 'A\tB\r\nC\tD\r\n', rack.slots[3].id).map(row => row.id)).toEqual([
    rack.slots[3].id,
    rack.slots[4].id,
    rack.slots[0].id,
    rack.slots[1].id,
  ]);
  expect(() => pasteCodes(rack, 'A\tB', rack.slots[5].id)).toThrow('超出');
});
test('preview checks global duplicates, blanks and locked edits but permits unchanged locked slots', () => {
  const layout = fixture(),
    [a, b] = layout.racks[0].slots;
  expect(previewCodes(layout, 'rack', [{ id: a.id, code: b.code }], () => true)[0].error).toContain('重复');
  expect(previewCodes(layout, 'rack', [{ id: a.id, code: ' ' }], () => true)[0].error).toContain('不能为空');
  expect(previewCodes(layout, 'rack', [{ id: a.id, code: 'NEW' }], () => false)[0].error).toContain('锁定');
  expect(previewCodes(layout, 'rack', [{ id: a.id, code: a.code }], () => false)[0].error).toBe('');
});
test('batch command commits one undo, restores all codes, and rejects locked updates atomically', () => {
  let model = fixture();
  const before = JSON.stringify(model),
    changed = vi.fn();
  const history = createSessionHistory({
    model: () => model,
    replace: next => (model = next),
    canEdit: () => true,
    beforeCommand: () => {},
    render: () => {},
    toast: () => {},
    changed,
    afterRestore: () => {},
  });
  let locked = false;
  const commands = createLayoutCommands({
    model: () => model,
    execute: history.execute,
    assertCanRename: () => {
      if (locked) throw Error('锁定');
    },
  });
  const changes = generateCodes(model.racks[0], options);
  expect(commands.applyBatchCodes('rack', changes)).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  history.undo();
  expect(JSON.stringify(model)).toBe(before);
  expect(history.canUndo()).toBe(false);
  locked = true;
  expect(commands.applyBatchCodes('rack', changes)).toBe(false);
  expect(JSON.stringify(model)).toBe(before);
});
test('dialog generates a preview without saving until explicit apply', async () => {
  const layout = fixture();
  const applyBatchCodes = vi.fn(() => true);
  const wrapper = mount(BatchCodeDialog, {
    props: {
      rack: layout.racks[0],
      actions: { previewBatchCodes: (id, rows) => previewCodes(layout, id, rows, () => true), applyBatchCodes },
    },
  });
  await wrapper.get('button').trigger('click');
  const generate = wrapper.findAll('button').find(button => button.text() === '生成预览');
  await generate.trigger('click');
  expect(applyBatchCodes).not.toHaveBeenCalled();
  expect(wrapper.get('input[aria-label="2层1列编码"]').element.value).toBe('H901-2');
  await wrapper
    .findAll('button')
    .find(button => button.text() === '应用编码')
    .trigger('click');
  expect(applyBatchCodes).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

test('three-level SZX codes map bottom X, middle Z and top S without changing slots', () => {
  const rack = { id: 'three', name: 'A', cols: 2, levels: 3 };
  rack.slots = slots(rack);
  const before = JSON.stringify(rack);
  expect(
    generateCodes(rack, { ...options, prefix: 'A', start: 1, digits: 2, layerFormat: 'szx' }).map(row => row.code)
  ).toEqual(['A01-X', 'A02-X', 'A01-Z', 'A02-Z', 'A01-S', 'A02-S']);
  expect(JSON.stringify(rack)).toBe(before);
  expect(() => generateCodes(fixture().racks[0], { ...options, layerFormat: 'szx' })).toThrow('三层');
});

test('prefix and suffix resolve every layer placeholder using the selected format', () => {
  const rack = { id: 'three', name: 'A', cols: 2, levels: 3 };
  rack.slots = slots(rack);
  const before = JSON.stringify(rack);
  const rule = { ...options, prefix: '{层号}', suffix: 'W', start: 1, digits: 3 };
  expect(generateCodes(rack, { ...rule, layerFormat: 'szx' }).map(row => row.code)).toEqual([
    'X001W',
    'X002W',
    'Z001W',
    'Z002W',
    'S001W',
    'S002W',
  ]);
  expect(
    generateCodes(rack, { ...rule, prefix: '{层号}-{层号}-', suffix: '-{层号}', level: 2, reverse: true }).map(
      row => row.code
    )
  ).toEqual(['2-2-002-2', '2-2-001-2']);
  expect(JSON.stringify(rack)).toBe(before);
});
