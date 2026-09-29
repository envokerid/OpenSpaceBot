import assert from 'node:assert/strict';
import { test } from 'node:test';
import Yoga, { type Node } from 'yoga-layout';
import { markdownListLayout } from '../src/markdownLayout.ts';

// Exercise Yoga's native flex measurement without a browser or emulator.
// Text metrics are deterministic approximations; this checks geometry, not fonts.
function measureList(style: { flex: number; flexShrink?: number }, width: number, markerWidth: number, fontScale = 1) {
  const make = (parent?: Node) => {
    const node = Yoga.Node.create();
    parent?.insertChild(node, parent.getChildCount());
    return node;
  };
  const root = make();
  try {
    root.setWidth(width);
    const bubble = make(root);
    bubble.setAlignSelf(Yoga.ALIGN_FLEX_START);
    bubble.setMaxWidthPercent(100);
    bubble.setMargin(Yoga.EDGE_RIGHT, 44);
    const pressable = make(bubble);
    const padded = make(pressable);
    padded.setPadding(Yoga.EDGE_HORIZONTAL, 15);
    padded.setPadding(Yoga.EDGE_VERTICAL, 11);
    const body = make(padded);
    const list = make(body);
    const contents: Node[] = [];
    for (const text of ['Four times: “hey” once, and “hey again” three times.', 'Hey again! What can I help you with?']) {
      const row = make(list);
      row.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
      const marker = make(row);
      marker.setMargin(Yoga.EDGE_HORIZONTAL, 10);
      marker.setMeasureFunc(() => ({ width: markerWidth * fontScale, height: 24 * fontScale }));
      const content = make(row);
      contents.push(content);
      content.setFlex(style.flex);
      if (style.flexShrink !== undefined) content.setFlexShrink(style.flexShrink);
      const paragraph = make(content);
      paragraph.setWidthPercent(100);
      paragraph.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
      paragraph.setFlexWrap(Yoga.WRAP_WRAP);
      const leaf = make(paragraph);
      leaf.setMeasureFunc((availableWidth, mode) => {
        const naturalWidth = text.length * 8 * fontScale;
        const lineWidth = mode === Yoga.MEASURE_MODE_UNDEFINED ? naturalWidth : Math.max(availableWidth, 1);
        return { width: Math.min(naturalWidth, lineWidth), height: Math.ceil(naturalWidth / lineWidth) * 24 * fontScale };
      });
    }
    root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    return { bubble: bubble.getComputedLayout(), contents: contents.map(node => node.getComputedLayout()) };
  } finally {
    root.freeRecursive();
  }
}

test('reproduces the collapsed list text with the renderer default flex', () => {
  const result = measureList({ flex: 1 }, 340, 16);
  assert.equal(result.contents[0].width, 0);
  assert.ok(result.bubble.height > 1000);
});

for (const [kind, markerWidth] of [['ordered_list_content', 16], ['bullet_list_content', 8]] as const) {
  test(`${kind} keeps reply text visible and wraps within the bubble`, () => {
    for (const width of [240, 340, 600]) {
      for (const fontScale of [1, 1.5]) {
        const result = measureList(markdownListLayout[kind], width, markerWidth, fontScale);
        assert.ok(result.bubble.width <= width);
        assert.ok(result.bubble.height < 600, 'two short list items must not create a tall blank bubble');
        for (const content of result.contents) {
          assert.ok(content.width > 80, 'list text must have room to render');
          assert.ok(content.left + content.width <= result.bubble.width - 30, 'text must fit inside the bubble padding');
        }
      }
    }
  });
}
