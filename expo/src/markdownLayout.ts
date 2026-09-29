// The renderer defaults to flex: 1, which gives list text a zero flex basis.
// In content-sized speech bubbles, that can leave only the marker visible.
// Measure the text at its natural width, then shrink it to fit the bubble.
export const markdownListLayout = {
  bullet_list_content: { flex: 0, flexShrink: 1 },
  ordered_list_content: { flex: 0, flexShrink: 1 },
};
