/** Pointy-top hexagonal grid, axial coordinates. */
export interface Axial {
  q: number;
  r: number;
}

export const HEX_DIRS: ReadonlyArray<Axial> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const keyOf = (q: number, r: number): string => `${q},${r}`;

export const sameHex = (a: Axial, b: Axial): boolean => a.q === b.q && a.r === b.r;

export function neighbors(q: number, r: number): Axial[] {
  return HEX_DIRS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Odd-r offset (authoring) to axial. */
export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

/** Axial to odd-r offset. */
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function hexCenter(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

export function hexCorners(cx: number, cy: number, size: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    points.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return points;
}

export function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, inset = 0): void {
  const corners = hexCorners(cx, cy, Math.max(size - inset, 1));
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
}

export function axialRound(qf: number, rf: number): Axial {
  let x = qf;
  let z = rf;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

export function pixelToHex(x: number, y: number, size: number): Axial {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}

/** Point on a hex edge midway between two adjacent hex centres. */
export function edgeMidpoint(a: Axial, b: Axial, size: number): { x: number; y: number } {
  const ca = hexCenter(a.q, a.r, size);
  const cb = hexCenter(b.q, b.r, size);
  return { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
}

export function hexesInRange(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const minDq = Math.max(-radius, -dq - radius);
    const maxDq = Math.min(radius, -dq + radius);
    for (let dr = minDq; dr <= maxDq; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}
