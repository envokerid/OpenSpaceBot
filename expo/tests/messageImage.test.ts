import assert from 'node:assert/strict';
import { test } from 'node:test';
import Yoga from 'yoga-layout';
import { messageImageSize } from '../src/core/messageImage.ts';

function imageBubble(viewport: number, size?: { width: number; height: number }) {
  const root = Yoga.Node.create();
  const bubble = Yoga.Node.create();
  const image = Yoga.Node.create();
  try {
    root.setWidth(viewport - 32);
    root.insertChild(bubble, 0);
    bubble.setAlignSelf(Yoga.ALIGN_FLEX_START);
    bubble.setMaxWidthPercent(100);
    bubble.setMargin(Yoga.EDGE_RIGHT, 44);
    bubble.setPadding(Yoga.EDGE_HORIZONTAL, 15);
    bubble.setPadding(Yoga.EDGE_VERTICAL, 11);
    bubble.insertChild(image, 0);
    if (size) image.setWidth(size.width);
    else image.setWidthPercent(100);
    image.setHeight(size?.height ?? 260);
    root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    return { bubble: bubble.getComputedLayout(), image: image.getComputedLayout() };
  } finally {
    root.freeRecursive();
  }
}

test('percentage image width collapses inside a content-sized speech bubble', () => {
  const result = imageBubble(360);
  assert.equal(result.image.width, 0);
  assert.equal(result.bubble.height, 282);
});

test('message images reserve visible width and fit the transcript on phones and tablets', () => {
  for (const viewport of [240, 360, 600, 1024]) {
    for (const source of [undefined, { width: 1920, height: 1080 }, { width: 800, height: 1600 }]) {
      const result = imageBubble(viewport, messageImageSize(viewport, source));
      assert.ok(result.image.width >= 134);
      assert.ok(result.bubble.width + 44 <= viewport - 32);
      assert.ok(result.image.height > 0 && result.image.height <= 260);
    }
  }
});

test('message image height follows landscape aspect ratio and bounds portrait images', () => {
  assert.deepEqual(messageImageSize(406, { width: 1600, height: 800 }), { width: 300, height: 150 });
  assert.deepEqual(messageImageSize(406, { width: 800, height: 1600 }), { width: 300, height: 260 });
  assert.deepEqual(messageImageSize(406, { width: 0, height: 0 }), { width: 300, height: 225 });
});
