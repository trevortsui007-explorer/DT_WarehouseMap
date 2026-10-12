// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { test, expect } from 'vitest';
import ConfirmDialog from '../src/components/dialogs/ConfirmDialog.vue';

test('confirmation resolves once, cancels on Escape/unmount and rejects overlapping prompts', async () => {
  const wrapper = mount(ConfirmDialog, { attachTo: document.body });
  const dialog = document.querySelector('dialog.system-modal');
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
  };
  const first = wrapper.vm.ask({ title: '载入草稿', message: '当前内容会被替换', confirmText: '确认载入' });
  await nextTick();
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('.system-modal-header').textContent).toContain('载入草稿');
  expect(await wrapper.vm.ask({ title: '重复请求' })).toBe(false);
  dialog.querySelector('.system-modal-footer .primary').click();
  expect(await first).toBe(true);
  expect(dialog.open).toBe(false);
  const cancelled = wrapper.vm.ask({ title: '再次载入' });
  await nextTick();
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(await cancelled).toBe(false);
  const disposed = wrapper.vm.ask({ title: '即将关闭' });
  wrapper.unmount();
  expect(await disposed).toBe(false);
});
