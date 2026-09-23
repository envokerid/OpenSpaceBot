export interface GroupAvatarTile {
  left: number;
  top: number;
  size: number;
}

/** Places every avatar around a circular path, with no enclosing avatar badge. */
export function groupAvatarTiles(count: number, diameter: number): GroupAvatarTile[] {
  if (count <= 0 || diameter <= 0) return [];
  if (count === 1) return [{ left: 0, top: 0, size: diameter }];

  const spacing = Math.sin(Math.PI / count);
  const size = diameter * spacing / (1 + spacing);
  const radius = (diameter - size) / 2;

  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return {
      left: radius + Math.cos(angle) * radius,
      top: radius + Math.sin(angle) * radius,
      size,
    };
  });
}
