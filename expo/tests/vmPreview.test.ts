import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVmPreview, type PreviewState } from '../src/core/vmPreview.ts';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('keeps the decoded frame visible until replacement loads, without overlapping or accumulating frames', async t => {
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
 let calls = 0;
 let state: PreviewState = { frames: [], width: 0, height: 0 };
 const preview = createVmPreview({ capture: async () => `frame-${++calls}`, changed: value => { state = value; }, error: () => {} });
 t.after(() => preview.stop());
 preview.refresh(); await settle();
 assert.equal(state.visible, undefined);
 preview.loaded(1, 1600, 900); await settle();
 assert.equal(state.visible, 1);
 t.mock.timers.tick(124); await settle(); assert.equal(calls, 1);
 t.mock.timers.tick(1); await settle(); assert.equal(calls, 2);
 assert.equal(state.visible, 1);
 assert.deepEqual(state.frames.map(frame => frame.id), [1, 2]);
 t.mock.timers.tick(1000); await settle(); assert.equal(calls, 2); // Decode provides backpressure.
 preview.loaded(2, 1600, 900); await settle();
 assert.equal(state.visible, 2);
 assert.deepEqual(state.frames.map(frame => frame.id), [2]);
 t.mock.timers.tick(0); await settle(); assert.equal(calls, 3); // No extra second after slow decoding.
 preview.loaded(1, 320, 200); // Stale native event cannot replace the displayed frame.
 assert.equal(state.visible, 2);
 assert.equal(state.width, 1600);
});

test('slow captures stay serialized and input requests a fresh frame immediately afterward', async t => {
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
 let calls = 0;
 let finish!: (uri: string) => void;
 const preview = createVmPreview({ capture: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, changed: () => {}, error: () => {} });
 t.after(() => preview.stop());
 preview.refresh(); preview.refresh(); preview.refresh();
 t.mock.timers.tick(600); await settle(); assert.equal(calls, 1);
 finish('frame'); await settle(); preview.loaded(1, 1600, 900); await settle();
 t.mock.timers.tick(0); await settle(); assert.equal(calls, 2);
 finish('frame'); await settle(); // An identical frame doesn't need another native decode.
 t.mock.timers.tick(125); await settle(); assert.equal(calls, 3);
});

test('decode failure and capture failure retain the last good image and back off before recovery', async t => {
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
 let calls = 0;
 let state: PreviewState = { frames: [], width: 0, height: 0 };
 let error: unknown;
 const preview = createVmPreview({ capture: async () => { if (++calls === 3) throw new Error('offline'); return `frame-${calls}`; }, changed: value => { state = value; }, error: value => { error = value; } });
 t.after(() => preview.stop());
 preview.refresh(); await settle(); preview.loaded(1, 1600, 900); await settle();
 t.mock.timers.tick(125); await settle(); preview.failed(2); await settle();
 assert.match(String(error), /display/);
 assert.deepEqual(state.frames.map(frame => frame.id), [1]);
 t.mock.timers.tick(999); await settle(); assert.equal(calls, 2);
 t.mock.timers.tick(1); await settle(); assert.equal(calls, 3);
 assert.match(String(error), /offline/); assert.equal(state.visible, 1);
 t.mock.timers.tick(1000); await settle(); preview.loaded(3, 1600, 900); await settle();
 assert.equal(error, undefined); assert.equal(state.visible, 3);
});

test('missing native decode callback times out and releases the pipeline without blanking', async t => {
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
 let calls = 0;
 let state: PreviewState = { frames: [], width: 0, height: 0 };
 const preview = createVmPreview({ capture: async () => `frame-${++calls}`, changed: value => { state = value; }, error: () => {} });
 t.after(() => preview.stop());
 preview.refresh(); await settle(); preview.loaded(1, 1600, 900); await settle();
 t.mock.timers.tick(125); await settle();
 t.mock.timers.tick(5000); await settle();
 assert.equal(state.visible, 1); assert.equal(state.frames.length, 1);
 t.mock.timers.tick(1000); await settle(); assert.equal(calls, 3);
});

test('closing aborts capture and ignores late results and refresh requests', async t => {
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
 let signal!: AbortSignal;
 let finish!: (uri: string) => void;
 let updates = 0;
 const preview = createVmPreview({ capture: value => { signal = value; return new Promise(resolve => { finish = resolve; }); }, changed: () => { updates++; }, error: () => { updates++; } });
 preview.refresh(); preview.stop();
 assert.equal(signal.aborted, true);
 finish('late'); await settle(); preview.refresh();
 t.mock.timers.tick(10000); await settle(); assert.equal(updates, 0);
});

test('closing during decode cancels the timeout and ignores late native events', async t => {
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
 let updates = 0;
 const preview = createVmPreview({ capture: async () => 'frame', changed: () => { updates++; }, error: () => { updates++; } });
 preview.refresh(); await settle(); assert.equal(updates, 1);
 preview.stop(); preview.loaded(1, 1600, 900); preview.failed(1); await settle();
 t.mock.timers.tick(10000); await settle(); assert.equal(updates, 1);
});
