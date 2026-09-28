import assert from 'node:assert/strict';
import { test } from 'node:test';
import { threeContext } from '../src/core/threeContext.ts';

test('Expo GL2 facade avoids the Three WebGL1 guard and preserves native method receivers', () => {
  class WebGL1 {}
  class ExpoGL2 extends WebGL1 {
    drawingBufferWidth = 256;
    readonly VERSION = 7938;
    getParameter(parameter: number) { assert.equal(this, native); return parameter === this.VERSION ? 'WebGL 2.0' : null; }
  }
  const native = new ExpoGL2();
  const gl = threeContext(native);
  assert.ok(native instanceof WebGL1);
  assert.equal(gl instanceof WebGL1, false);
  assert.equal(gl.getParameter(gl.VERSION), 'WebGL 2.0');
  assert.equal(gl.getParameter, gl.getParameter, 'bound methods are cached');
  native.drawingBufferWidth = 512;
  assert.equal(gl.drawingBufferWidth, 512, 'live buffer dimensions survive resizing');
  assert.ok('VERSION' in gl);
  gl.drawingBufferWidth = 128;
  assert.equal(native.drawingBufferWidth, 128);
});
