import { describe, expect, it } from 'vitest';
import { ComputerControl } from './computer-control.ts';
import { MobileVmControl } from './mobile-vm-control.ts';
import { mobileVmCommand, mobileVmInputSchema, mobileVmRequestSchema } from '../shared/mobile-vm.ts';

describe('mobile VM ownership', () => {
 it('expires disconnected phones without clearing a newer desktop hold', () => {
  let now = 100;
  const control = new ComputerControl();
  const vm = new MobileVmControl(control, () => now);
  vm.take('b', 't', 'target', 'b', 'phone');
  expect(control.snapshot('b').held).toBe(true);
  now += 59_000; vm.renew('b', 't', 'phone');
  now += 59_000; vm.sweep(); expect(control.snapshot('b').held).toBe(true);
  now += 2000; vm.sweep(); expect(control.snapshot('b').held).toBe(false);
  vm.take('b', 't', 'target', 'b', 'phone');
  control.release('b'); control.take('b');
  now += 61_000; vm.sweep(); expect(control.snapshot('b').held).toBe(true);
 });
 it('rejects sibling threads, competing phones, changed targets, and legacy holds', async () => {
  const control = new ComputerControl(); const vm = new MobileVmControl(control);
  control.take('b'); expect(() => vm.take('b', 't', 'target', 'b', 'one')).toThrow(/another/);
  control.release('b'); vm.take('b', 't', 'target', 'b', 'one');
  expect(() => vm.take('other', 't', 'target', 'other', 'two')).toThrow(/another/);
  expect(() => vm.renew('b', 'sibling', 'one')).toThrow(/ended/);
  await expect(vm.input('b', 't', 'different', 'one', async () => {})).rejects.toThrow(/changed/);
  vm.release('b', 't', 'two'); expect(control.snapshot('b').held).toBe(true);
  vm.release('b', 't', 'one'); expect(control.snapshot('b').held).toBe(false);
 });
 it('does not queue input or release the bot while input is in flight', async () => {
  const control = new ComputerControl(); const vm = new MobileVmControl(control);
  vm.take('b', 't', 'target', 'b', 'one');
  let finish!: () => void;
  const pending = vm.input('b', 't', 'target', 'one', async check => { check(); await new Promise<void>(resolve => { finish = resolve; }); });
  await expect(vm.input('b', 't', 'target', 'one', async () => {})).rejects.toThrow(/finishing/);
  expect(() => vm.release('b', 't', 'one')).toThrow(/finishing/);
  finish(); await pending; vm.release('b', 't', 'one'); expect(control.snapshot('b').held).toBe(false);
 });
 it('checks ownership again after awaiting container status', async () => {
  const control = new ComputerControl(); const vm = new MobileVmControl(control);
  vm.take('b', 't', 'target', 'b', 'one');
  await expect(vm.input('b', 't', 'target', 'one', async check => { control.release('b'); check(); })).rejects.toThrow(/ended/);
 });
});
describe('bounded native input', () => {
 it('accepts text literally and never exposes arbitrary driver calls', () => {
  expect(mobileVmCommand(mobileVmInputSchema.parse({ type: 'text', text: '$(touch /tmp/no); `echo no`' }))).toEqual({ tool: 'type_text', args: { scope: 'desktop', delivery_mode: 'foreground', text: '$(touch /tmp/no); `echo no`' } });
  for (const input of [{ type: 'exec', command: 'sh' }, { type: 'text', text: 'a'.repeat(4097) }, { type: 'click', x: -1, y: 0 }, { type: 'click', x: 0, y: 0, pid: 12 }, { type: 'key', key: 'bad' }]) expect(mobileVmInputSchema.safeParse(input).success).toBe(false);
  expect(mobileVmRequestSchema.safeParse({ action: 'input', controlLeaseId: 'a'.repeat(16) }).success).toBe(false);
 });
});
