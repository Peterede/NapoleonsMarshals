import { hexCenter, keyOf, pixelToHex } from '../game/hex';
import type { Axial } from '../game/hex';
import type { BattleState, CombatResult, HexData, ReachableHex, Unit } from '../game/types';
import { UNIT_STATS, formationName } from '../game/units';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  color: string;
  drag: number;
  grow: number;
}

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
}

interface MoveAnim {
  points: Array<{ x: number; y: number }>;
  start: number;
  duration: number;
}

interface ViewProps {
  selectedId: string | null;
  reachable: Map<string, ReachableHex>;
  attackable: Set<string>;
  hover: Axial | null;
  path: Axial[] | null;
}

const GOLD = '#c9a45a';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const NATION_FILL: Record<'france' | 'coalition', [string, string]> = {
  france: ['#2c537e', '#1b3555'],
  coalition: ['#964137', '#67251f'],
};

function hash(q: number, r: number): number {
  const n = Math.sin(q * 127.1 + r * 311.7 + 17.3) * 43758.5453;
  return n - Math.floor(n);
}

function shade(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class BattleRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private size = 30;
  private centers = new Map<string, { x: number; y: number }>();
  private state: BattleState | null = null;
  private view: ViewProps = {
    selectedId: null,
    reachable: new Map(),
    attackable: new Set(),
    hover: null,
    path: null,
  };
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private moves = new Map<string, MoveAnim>();
  private shake = 0;
  private lastFrame = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.terrainCanvas = document.createElement('canvas');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  destroy(): void {
    this.destroyed = true;
  }

  setState(state: BattleState): void {
    this.state = state;
    this.rebuildTerrain();
  }

  setView(props: Partial<ViewProps>): void {
    this.view = { ...this.view, ...props };
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.terrainCanvas.width = this.canvas.width;
    this.terrainCanvas.height = this.canvas.height;
    this.computeLayout();
    this.rebuildTerrain();
  }

  private computeLayout(): void {
    if (!this.state) return;
    const hexes = Object.values(this.state.map);
    const cols = Math.max(...hexes.map((h) => h.col)) + 1;
    const rows = Math.max(...hexes.map((h) => h.row)) + 1;
    const padX = 24;
    const padY = 26;
    const sizeByWidth = (this.width - padX * 2) / (Math.sqrt(3) * (cols + 0.35));
    const sizeByHeight = (this.height - padY * 2) / (1.5 * (rows - 1) + 2.15);
    this.size = Math.max(14, Math.min(48, Math.min(sizeByWidth, sizeByHeight)));

    this.centers.clear();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const hex of hexes) {
      const { x, y } = hexCenter(hex.q, hex.r, this.size);
      this.centers.set(keyOf(hex.q, hex.r), { x, y });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const offsetX = (this.width - (maxX - minX + this.size * Math.sqrt(3))) / 2 - (minX - (this.size * Math.sqrt(3)) / 2);
    const offsetY = (this.height - (maxY - minY + this.size * 2)) / 2 - (minY - this.size);
    for (const [key, point] of this.centers) {
      this.centers.set(key, { x: point.x + offsetX, y: point.y + offsetY });
    }
  }

  private centerOf(q: number, r: number): { x: number; y: number } {
    return this.centers.get(keyOf(q, r)) ?? { x: 0, y: 0 };
  }

  hexAt(clientX: number, clientY: number): Axial | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const centerOffset = this.centers.get(keyOf(0, 0));
    if (!centerOffset) return null;
    const raw = hexCenter(0, 0, this.size);
    const ax = x - centerOffset.x + raw.x;
    const ay = y - centerOffset.y + raw.y;
    const axial = pixelToHex(ax, ay, this.size);
    return this.state?.map[keyOf(axial.q, axial.r)] ? axial : null;
  }

  unitCenter(unit: Unit, now = performance.now()): { x: number; y: number } {
    const anim = this.moves.get(unit.id);
    if (anim) {
      const t = Math.max(0, Math.min(1, (now - anim.start) / anim.duration));
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (anim.points.length > 1) {
        const scaled = eased * (anim.points.length - 1);
        const index = Math.min(anim.points.length - 2, Math.floor(scaled));
        const frac = scaled - index;
        const a = anim.points[index];
        const b = anim.points[index + 1];
        return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
      }
    }
    return this.centerOf(unit.q, unit.r);
  }

  animateMove(unitId: string, from: Axial, path: Axial[], duration = 300): void {
    const points = [this.centerOf(from.q, from.r), ...path.map((p) => this.centerOf(p.q, p.r))];
    this.moves.set(unitId, { points, start: performance.now(), duration });
  }

  ping(q: number, r: number, color = GOLD): void {
    const p = this.centerOf(q, r);
    this.rings.push({ x: p.x, y: p.y, life: 900, maxLife: 900, color, radius: this.size * 1.4 });
  }

  combatEffect(
    attacker: Unit,
    defender: Unit,
    result: CombatResult,
    mode: 'fire' | 'melee',
    defenderDestroyed: boolean,
  ): void {
    const a = this.centerOf(attacker.q, attacker.r);
    const d = this.centerOf(defender.q, defender.r);
    const cannon = attacker.type === 'artillery';
    if (mode === 'fire') {
      this.tracers.push({
        x1: a.x,
        y1: a.y,
        x2: d.x,
        y2: d.y,
        life: cannon ? 260 : 150,
        maxLife: cannon ? 260 : 150,
        color: cannon ? 'rgba(255, 174, 92, 0.95)' : 'rgba(255, 230, 170, 0.9)',
        width: cannon ? 3.5 : 1.6,
      });
      const puffs = cannon ? 18 : 8;
      for (let i = 0; i < puffs; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = cannon ? 30 + Math.random() * 60 : 14 + Math.random() * 34;
        this.particles.push({
          x: a.x + Math.cos(angle) * this.size * 0.3,
          y: a.y + Math.sin(angle) * this.size * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 12,
          life: cannon ? 900 : 500,
          maxLife: cannon ? 900 : 500,
          r: cannon ? 5 + Math.random() * 7 : 2.5 + Math.random() * 4,
          color: cannon ? 'rgba(226, 216, 198, 0.5)' : 'rgba(240, 235, 220, 0.42)',
          drag: 0.92,
          grow: 0.02,
        });
      }
      if (cannon) this.shake = Math.max(this.shake, 5);
    } else {
      const mid = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 };
      for (let i = 0; i < 4; i++) {
        this.tracers.push({
          x1: mid.x - this.size * 0.5 + Math.random() * this.size,
          y1: mid.y - this.size * 0.35 + Math.random() * this.size * 0.4,
          x2: mid.x + this.size * 0.4,
          y2: mid.y + this.size * 0.3,
          life: 200,
          maxLife: 200,
          color: 'rgba(255, 245, 210, 0.8)',
          width: 1.5,
        });
      }
      for (let i = 0; i < 14; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.particles.push({
          x: mid.x,
          y: mid.y,
          vx: Math.cos(angle) * (20 + Math.random() * 40),
          vy: Math.sin(angle) * (20 + Math.random() * 30) - 10,
          life: 700,
          maxLife: 700,
          r: 2 + Math.random() * 4,
          color: 'rgba(190, 170, 135, 0.55)',
          drag: 0.9,
          grow: 0.03,
        });
      }
      this.shake = Math.max(this.shake, attacker.type === 'cavalry' ? 4 : 2);
    }

    const dmgColor = defender.nation === 'france' ? '#ffb4a4' : '#ffd9a2';
    this.floaters.push({
      x: d.x,
      y: d.y - this.size * 0.5,
      text: `-${result.actualDamage}`,
      color: dmgColor,
      life: 1200,
      maxLife: 1200,
      size: Math.max(11, this.size * 0.42),
    });
    if (result.actualSelfDamage > 0) {
      this.floaters.push({
        x: a.x,
        y: a.y - this.size * 0.45,
        text: `-${result.actualSelfDamage}`,
        color: 'rgba(255, 220, 180, 0.85)',
        life: 1000,
        maxLife: 1000,
        size: Math.max(9, this.size * 0.32),
      });
    }
    if (defenderDestroyed) {
      this.floaters.push({
        x: d.x,
        y: d.y,
        text: 'ROUTED',
        color: '#ffe4a6',
        life: 1600,
        maxLife: 1600,
        size: Math.max(10, this.size * 0.34),
      });
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.particles.push({
          x: d.x,
          y: d.y,
          vx: Math.cos(angle) * (15 + Math.random() * 45),
          vy: Math.sin(angle) * (15 + Math.random() * 35) - 16,
          life: 1100,
          maxLife: 1100,
          r: 3 + Math.random() * 5,
          color: 'rgba(90, 84, 72, 0.45)',
          drag: 0.94,
          grow: 0.04,
        });
      }
    }
  }

  rallyEffect(units: Unit[]): void {
    for (const unit of units) {
      const p = this.centerOf(unit.q, unit.r);
      this.rings.push({ x: p.x, y: p.y, life: 900, maxLife: 900, color: 'rgba(240, 205, 120, 0.9)', radius: this.size * 1.3 });
      this.floaters.push({
        x: p.x,
        y: p.y - this.size * 0.55,
        text: 'STEADIED',
        color: '#f4d791',
        life: 1300,
        maxLife: 1300,
        size: Math.max(8, this.size * 0.29),
      });
    }
  }

  private loop(now: number): void {
    if (this.destroyed) return;
    const dt = Math.min(48, now - (this.lastFrame || now));
    this.lastFrame = now;
    if (this.state && this.width > 0) this.draw(now, dt);
    requestAnimationFrame(this.loop);
  }

  private draw(now: number, dt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Table backdrop
    const bg = ctx.createRadialGradient(this.width / 2, this.height / 2, 30, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.75);
    bg.addColorStop(0, '#253a4c');
    bg.addColorStop(1, '#15222f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.shake > 0.2) {
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake;
      ctx.translate(sx, sy);
      this.shake *= 0.88;
    } else {
      this.shake = 0;
    }

    ctx.drawImage(this.terrainCanvas, 0, 0, this.width, this.height);

    this.drawObjectiveFlags(ctx, now);
    this.drawOverlays(ctx, now);
    this.drawUnits(ctx, now);
    this.updateAndDrawEffects(ctx, dt);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vignette = ctx.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.35, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(4, 10, 16, 0.34)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private rebuildTerrain(): void {
    const state = this.state;
    if (!state || this.width === 0) return;
    const ctx = this.terrainCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    for (const hex of Object.values(state.map)) this.drawHex(ctx, hex);

    // soft map edge shadow
    for (const hex of Object.values(state.map)) {
      const p = this.centerOf(hex.q, hex.r);
      const neighborsOut = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
      ].some((d) => !state.map[keyOf(hex.q + d.q, hex.r + d.r)]);
      if (!neighborsOut) continue;
      ctx.save();
      this.pathHex(ctx, p.x, p.y, this.size - 0.8);
      ctx.strokeStyle = 'rgba(32, 38, 33, 0.45)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // objective base rings
    for (const objective of state.objectives) {
      const p = this.centerOf(objective.q, objective.r);
      this.pathHex(ctx, p.x, p.y, this.size - 2.5);
      ctx.strokeStyle = 'rgba(200, 164, 90, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private pathHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = ((60 * i - 30) * Math.PI) / 180;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private drawHex(ctx: CanvasRenderingContext2D, hex: HexData): void {
    const p = this.centerOf(hex.q, hex.r);
    const s = this.size;
    const jitter = hash(hex.q, hex.r);
    let base = '#b7c09a';
    switch (hex.terrain) {
      case 'grass':
        base = shade('#b8c19b', Math.round(jitter * 8) - 4);
        break;
      case 'field':
        base = shade('#d4c58f', Math.round(jitter * 8) - 4);
        break;
      case 'forest':
        base = '#9cae84';
        break;
      case 'hill':
        base = '#c4bc92';
        break;
      case 'village':
        base = '#d2c09a';
        break;
      case 'water':
        base = '#86aab4';
        break;
      case 'ford':
        base = '#c4b995';
        break;
      case 'marsh':
        base = '#a7b194';
        break;
    }

    ctx.save();
    this.pathHex(ctx, p.x, p.y, s);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.clip();

    if (hex.terrain === 'field') {
      ctx.strokeStyle = 'rgba(122, 101, 52, 0.2)';
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x + i * s * 0.24 - s * 0.1, p.y - s * 0.7);
        ctx.lineTo(p.x + i * s * 0.24 + s * 0.12, p.y + s * 0.7);
        ctx.stroke();
      }
    }

    if (hex.terrain === 'forest') {
      const trees = 5 + Math.floor(jitter * 3);
      for (let i = 0; i < trees; i++) {
        const angle = (i / trees) * Math.PI * 2 + jitter * 3;
        const radius = s * (0.18 + hash(i + hex.q, hex.r + i) * 0.42);
        const tx = p.x + Math.cos(angle) * radius;
        const ty = p.y + Math.sin(angle) * radius * 0.72;
        ctx.fillStyle = 'rgba(55, 74, 49, 0.45)';
        ctx.beginPath();
        ctx.arc(tx + 1.5, ty + 2, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5f7852';
        ctx.beginPath();
        ctx.arc(tx, ty, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6e8a5b';
        ctx.beginPath();
        ctx.arc(tx - s * 0.04, ty - s * 0.05, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (hex.terrain === 'hill') {
      ctx.strokeStyle = 'rgba(109, 98, 66, 0.28)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + s * (0.25 - i * 0.2), s * (0.55 - i * 0.13), s * (0.3 - i * 0.07), -0.12, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 250, 230, 0.12)';
      ctx.beginPath();
      ctx.ellipse(p.x - s * 0.08, p.y - s * 0.2, s * 0.35, s * 0.18, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hex.terrain === 'village') {
      const houses = 2 + Math.floor(jitter * 2);
      for (let i = 0; i < houses; i++) {
        const hx = p.x + (i - (houses - 1) / 2) * s * 0.36 + (jitter - 0.5) * s * 0.1;
        const hy = p.y + s * 0.08 + Math.sin(i * 2.4) * s * 0.1;
        const w = s * 0.3;
        const h = s * 0.24;
        ctx.fillStyle = '#ece0c4';
        ctx.fillRect(hx - w / 2, hy - h / 2, w, h);
        ctx.fillStyle = i % 2 === 0 ? '#9c5a45' : '#8a4c3b';
        ctx.beginPath();
        ctx.moveTo(hx - w / 2 - 1.5, hy - h / 2);
        ctx.lineTo(hx, hy - h / 2 - s * 0.16);
        ctx.lineTo(hx + w / 2 + 1.5, hy - h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 50, 38, 0.55)';
        ctx.fillRect(hx - w * 0.08, hy - h * 0.05, w * 0.16, h * 0.35);
      }
    }

    if (hex.terrain === 'water' || hex.terrain === 'ford') {
      ctx.strokeStyle = 'rgba(235, 245, 240, 0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(p.x - s * 0.28 + i * s * 0.28, p.y + s * (i % 2 === 0 ? 0.1 : -0.12), s * 0.2, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }
      if (hex.terrain === 'ford') {
        ctx.fillStyle = 'rgba(206, 195, 157, 0.85)';
        ctx.fillRect(p.x - s * 0.6, p.y - s * 0.1, s * 1.2, s * 0.22);
        ctx.fillStyle = 'rgba(110, 100, 80, 0.4)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(p.x - s * 0.4 + i * s * 0.26, p.y - s * 0.02 + (i % 2) * s * 0.06, s * 0.05, s * 0.03, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (hex.terrain === 'marsh') {
      ctx.strokeStyle = 'rgba(82, 99, 70, 0.45)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = p.x - s * 0.5 + hash(hex.q + i, hex.r) * s;
        const y = p.y - s * 0.2 + hash(hex.r + i, hex.q) * s * 0.55;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1.5, y - s * 0.18);
        ctx.stroke();
      }
    }

    // sunlit top-left, shaded bottom
    const grad = ctx.createLinearGradient(p.x - s, p.y - s, p.x + s, p.y + s);
    grad.addColorStop(0, 'rgba(255, 250, 230, 0.13)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(1, 'rgba(63, 55, 35, 0.13)');
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    ctx.restore();

    ctx.save();
    this.pathHex(ctx, p.x, p.y, s);
    ctx.strokeStyle = 'rgba(76, 70, 48, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  private drawObjectiveFlags(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.state) return;
    for (const objective of this.state.objectives) {
      const p = this.centerOf(objective.q, objective.r);
      const s = this.size;
      const color = objective.owner === 'france' ? '#345f8f' : objective.owner === 'coalition' ? '#964137' : '#8b8674';
      const trim = objective.owner === 'france' ? '#d8e5f3' : objective.owner === 'coalition' ? '#f0ddc0' : '#e1dfd2';
      const baseY = p.y - s * 0.18;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#4c4230';
      ctx.lineWidth = Math.max(1.2, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(p.x, baseY);
      ctx.lineTo(p.x, baseY - s * 0.68);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(p.x, baseY, Math.max(1.6, s * 0.07), 0, Math.PI * 2);
      ctx.fill();

      const wave = Math.sin(now * 0.003 + objective.q) * s * 0.05;
      const flagW = s * 0.5;
      const flagH = s * 0.28;
      const top = baseY - s * 0.66;
      ctx.beginPath();
      ctx.moveTo(p.x, top);
      ctx.quadraticCurveTo(p.x + flagW * 0.5, top + wave, p.x + flagW, top + s * 0.04);
      ctx.lineTo(p.x + flagW, top + flagH + s * 0.04);
      ctx.quadraticCurveTo(p.x + flagW * 0.5, top + flagH + wave, p.x, top + flagH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = Math.max(0.8, s * 0.025);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.arc(p.x + flagW * 0.28, top + flagH * 0.5, Math.max(0.8, s * 0.035), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, now: number): void {
    const state = this.state;
    if (!state) return;

    if (this.view.selectedId) {
      const selected = state.units.find((u) => u.id === this.view.selectedId);
      if (selected) {
        const p = this.centerOf(selected.q, selected.r);
        this.pathHex(ctx, p.x, p.y, this.size - 1);
        ctx.strokeStyle = 'rgba(233, 198, 113, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    for (const reach of this.view.reachable.values()) {
      if (reach.path.length === 0) continue;
      const p = this.centerOf(reach.q, reach.r);
      this.pathHex(ctx, p.x, p.y, this.size - 2);
      ctx.fillStyle = 'rgba(55, 101, 140, 0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(132, 180, 210, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(200, 225, 240, 0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.4, this.size * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const id of this.view.attackable) {
      const target = state.units.find((u) => u.id === id);
      if (!target) continue;
      const p = this.centerOf(target.q, target.r);
      const pulse = 0.55 + Math.sin(now * 0.006) * 0.2;
      this.pathHex(ctx, p.x, p.y, this.size - 2.5);
      ctx.strokeStyle = `rgba(206, 80, 66, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (this.view.hover) {
      const { q, r } = this.view.hover;
      const p = this.centerOf(q, r);
      this.pathHex(ctx, p.x, p.y, this.size - 1);
      ctx.fillStyle = 'rgba(255, 250, 230, 0.09)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 248, 226, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    if (this.view.path && this.view.path.length > 0) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(241, 208, 127, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const first = this.centerOf(this.view.path[0].q, this.view.path[0].r);
      ctx.moveTo(first.x, first.y);
      for (const step of this.view.path.slice(1)) {
        const p = this.centerOf(step.q, step.r);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      for (const step of this.view.path) {
        const p = this.centerOf(step.q, step.r);
        ctx.fillStyle = 'rgba(244, 212, 136, 0.35)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.6, this.size * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawUnits(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.state) return;
    const units = [...this.state.units].sort((a, b) => {
      const pa = this.unitCenter(a, now);
      const pb = this.unitCenter(b, now);
      return pa.y - pb.y;
    });
    for (const unit of units) this.drawUnit(ctx, unit, now);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, now: number): void {
    const p = this.unitCenter(unit, now);
    const s = this.size;
    const selected = this.view.selectedId === unit.id;
    const hovered =
      this.view.hover !== null && this.view.hover.q === unit.q && this.view.hover.r === unit.r;
    const w = s * 1.58;
    const h = s * 1.06;
    const x = p.x - w / 2;
    const y = p.y - h / 2;

    if (selected) {
      ctx.save();
      ctx.shadowColor = 'rgba(233, 198, 113, 0.8)';
      ctx.shadowBlur = 14;
      roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 5);
      ctx.fillStyle = 'rgba(233, 198, 113, 0.12)';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    roundRect(ctx, x + 2, y + 3, w, h, 4);
    ctx.fillStyle = 'rgba(8, 14, 20, 0.32)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    if (unit.acted) ctx.globalAlpha = 0.62;
    const [fillTop, fillBottom] = unit.nation === 'france' ? NATION_FILL.france : NATION_FILL.coalition;
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, fillTop);
    gradient.addColorStop(1, fillBottom);
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = selected ? '#f2d795' : hovered ? '#fff3cf' : 'rgba(238, 228, 205, 0.72)';
    ctx.lineWidth = selected ? 2 : 1.1;
    ctx.stroke();

    roundRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 3);
    ctx.strokeStyle = 'rgba(255, 248, 230, 0.16)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // morale strip
    const morale = Math.max(0, Math.min(100, unit.morale));
    const moraleColor = morale > 65 ? '#e6c982' : morale > 35 ? '#e8a95c' : '#d46a58';
    ctx.fillStyle = 'rgba(10, 18, 26, 0.55)';
    ctx.fillRect(x + 4, y + 4, w - 8, 2.6);
    ctx.fillStyle = moraleColor;
    ctx.fillRect(x + 4, y + 4, ((w - 8) * morale) / 100, 2.6);

    // strength strip
    const ratio = unit.strength / unit.maxStrength;
    const strengthColor = ratio > 0.6 ? '#a8c48b' : ratio > 0.3 ? '#d9b967' : '#d17c6a';
    ctx.fillStyle = 'rgba(8, 14, 20, 0.55)';
    ctx.fillRect(x + 3.5, y + h - 6.5, w - 7, 3.2);
    ctx.fillStyle = strengthColor;
    ctx.fillRect(x + 3.5, y + h - 6.5, (w - 7) * ratio, 3.2);

    if (unit.type === 'commander') {
      this.drawCommanderToken(ctx, unit, p, s);
    } else {
      this.drawIcon(ctx, unit, p.x - w * 0.24, p.y - s * 0.04, s * 0.35);
      ctx.fillStyle = '#f4ead4';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.max(8, s * 0.3)}px ${SANS}`;
      ctx.fillText(String(Math.round(unit.strength)), p.x + w * 0.02, p.y + s * 0.02);
      ctx.fillStyle = 'rgba(244, 234, 212, 0.68)';
      ctx.textAlign = 'right';
      ctx.font = `600 ${Math.max(5.5, s * 0.18)}px ${SANS}`;
      ctx.fillText(UNIT_STATS[unit.type].short, x + w - 4, y + h - 10.5);
      if (unit.type !== 'cavalry' && unit.type !== 'artillery') {
        ctx.fillStyle = 'rgba(244, 234, 212, 0.8)';
        ctx.textAlign = 'right';
        ctx.font = `600 ${Math.max(5, s * 0.16)}px ${SANS}`;
        ctx.fillText(formationName(unit.formation).slice(0, 3).toUpperCase(), x + w - 4, y + 8.5);
      }
    }

    if (unit.acted) {
      ctx.fillStyle = 'rgba(20, 26, 32, 0.72)';
      ctx.beginPath();
      ctx.arc(x + w - 4, y + 4, Math.max(2, s * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 210, 185, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + w - 6, y + 4);
      ctx.lineTo(x + w - 4.4, y + 5.6);
      ctx.lineTo(x + w - 1.8, y + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCommanderToken(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    p: { x: number; y: number },
    s: number,
  ): void {
    ctx.save();
    ctx.translate(p.x, p.y + s * 0.02);
    ctx.fillStyle = '#f0e2bd';
    const starR = Math.max(3.2, s * 0.11);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? starR : starR * 0.45;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 234, 212, 0.9)';
    ctx.font = `600 ${Math.max(6, s * 0.19)}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = unit.name.length > 13 ? unit.name.slice(0, 12) : unit.name;
    ctx.fillText(label.toUpperCase(), 0, s * 0.27);
    ctx.restore();
  }

  private drawIcon(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    cx: number,
    cy: number,
    r: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#f6ecd8';
    ctx.fillStyle = '#f6ecd8';
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.lineCap = 'round';
    switch (UNIT_STATS[unit.type].icon) {
      case 'infantry':
      case 'light':
      case 'guard': {
        const count = unit.type === 'light' ? 2 : 3;
        for (let i = 0; i < count; i++) {
          const x = (i - (count - 1) / 2) * r * 0.5;
          ctx.beginPath();
          ctx.moveTo(x, r * 0.6);
          ctx.lineTo(x, -r * 0.45);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - r * 0.11, -r * 0.55);
          ctx.lineTo(x, -r * 0.85);
          ctx.lineTo(x + r * 0.11, -r * 0.55);
          ctx.closePath();
          ctx.fill();
        }
        if (unit.type === 'guard') {
          const starR = r * 0.17;
          for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * r * 0.28, Math.sin(angle) * r * 0.28 + r * 0.15, starR * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'cavalry': {
        ctx.lineWidth = Math.max(1.2, r * 0.18);
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, r * 0.65);
        ctx.quadraticCurveTo(-r * 0.1, -r * 0.4, r * 0.55, -r * 0.72);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r * 0.55, r * 0.65);
        ctx.quadraticCurveTo(r * 0.1, -r * 0.4, -r * 0.55, -r * 0.72);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.15);
        ctx.lineTo(r * 0.6, -r * 0.15);
        ctx.stroke();
        break;
      }
      case 'artillery': {
        ctx.beginPath();
        ctx.arc(-r * 0.3, r * 0.35, r * 0.36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.05, r * 0.15);
        ctx.lineTo(r * 0.75, -r * 0.45);
        ctx.lineWidth = Math.max(1.6, r * 0.36);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-r * 0.3, r * 0.35, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'commander': {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  private updateAndDrawEffects(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.save();
    ctx.lineCap = 'round';

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = t.width;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.r += p.grow;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - ring.life / ring.maxLife;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius * (0.3 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, (1 - t) * 2.2);
      ctx.fillStyle = f.color;
      ctx.font = `700 ${f.size}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(10, 14, 18, 0.65)';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x, f.y - t * 26);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}
