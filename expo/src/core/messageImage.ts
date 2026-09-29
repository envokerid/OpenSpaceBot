export function messageImageSize(viewportWidth: number, source?: { width: number; height: number }) {
  // Account for transcript padding, the incoming bubble's margin and padding.
  const width = Math.max(1, Math.min(300, viewportWidth - 106));
  const ratio = source && Number.isFinite(source.width) && Number.isFinite(source.height)
    && source.width > 0 && source.height > 0 ? source.height / source.width : 3 / 4;
  return { width, height: Math.max(1, Math.min(260, width * ratio)) };
}
