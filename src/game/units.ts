import type { Formation, Nation, Terrain, UnitStats, UnitType } from './types';

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  line: {
    label: 'Line Infantry',
    short: 'LINE',
    strength: 620,
    move: 3,
    range: 2,
    fire: 1.0,
    melee: 0.95,
    icon: 'infantry',
    description:
      'The backbone of every army. Delivers steady volleys in line and can form column to storm a position.',
  },
  light: {
    label: 'Light Infantry',
    short: 'LIGHT',
    strength: 470,
    move: 4,
    range: 3,
    fire: 0.78,
    melee: 0.7,
    icon: 'light',
    description:
      'Skirmishers and marksmen. Faster than the line, at home in woods and villages, and deadly at long range.',
  },
  guard: {
    label: 'Guard Infantry',
    short: 'GUARD',
    strength: 540,
    move: 3,
    range: 2,
    fire: 1.22,
    melee: 1.35,
    icon: 'guard',
    description:
      'The elite of the army. Superb quality and stubborn morale; committed only when the moment is decisive.',
  },
  cavalry: {
    label: 'Cavalry',
    short: 'CAV',
    strength: 380,
    move: 6,
    range: 0,
    fire: 0,
    melee: 1.85,
    icon: 'cavalry',
    description:
      'Sabres and speed. Devastating against shaken infantry and guns, but broken against a steady square.',
  },
  artillery: {
    label: 'Artillery',
    short: 'GUNS',
    strength: 240,
    move: 2,
    range: 4,
    fire: 1.5,
    melee: 0.3,
    icon: 'artillery',
    description:
      'The emperor of the battlefield. Rakes columns at range, but cannot fire on the turn it moves and is helpless when charged.',
  },
  commander: {
    label: 'Commander',
    short: 'HQ',
    strength: 40,
    move: 5,
    range: 0,
    fire: 0,
    melee: 0.1,
    icon: 'commander',
    description:
      'Inspires nearby regiments and may sound one rally to restore the morale of troops around him.',
  },
};

export interface FormationMods {
  fire: number;
  melee: number;
  defense: number;
  cavalryDefense: number;
  movement: number;
  incomingFire: number;
}

export const FORMATION_MODS: Record<Formation, FormationMods> = {
  line: { fire: 1.15, melee: 1.0, defense: 1.05, cavalryDefense: 1.0, movement: 1, incomingFire: 1 },
  column: { fire: 0.55, melee: 1.32, defense: 0.95, cavalryDefense: 1.0, movement: 1, incomingFire: 1.18 },
  square: { fire: 0.72, melee: 0.55, defense: 1.12, cavalryDefense: 2.25, movement: 0.5, incomingFire: 1.0 },
};

export interface TerrainInfo {
  label: string;
  moveCost: number;
  cover: number;
  description: string;
}

export const TERRAIN: Record<Terrain, TerrainInfo> = {
  grass: { label: 'Open ground', moveCost: 1, cover: 1.0, description: 'Clear fields of fire. No cover.' },
  field: { label: 'Wheat field', moveCost: 1, cover: 1.05, description: 'Standing crops offer a little concealment.' },
  forest: { label: 'Wood', moveCost: 2, cover: 1.3, description: 'Cover from fire, but slow and disorderly going.' },
  hill: { label: 'Height', moveCost: 2, cover: 1.2, description: 'Commanding ground. Costs extra to climb.' },
  village: { label: 'Village', moveCost: 1, cover: 1.35, description: 'Stone walls and houses: excellent cover.' },
  water: { label: 'Water', moveCost: Infinity, cover: 1, description: 'Impassable.' },
  ford: { label: 'Ford / bridge', moveCost: 2, cover: 0.9, description: 'A crossing, but a costly choke point.' },
  marsh: { label: 'Marsh', moveCost: 2, cover: 0.95, description: 'Soft ground. Exhausting and exposed.' },
};

export const TERRAIN_CHAR: Record<string, Terrain> = {
  '.': 'grass',
  ',': 'field',
  f: 'forest',
  '^': 'hill',
  '#': 'village',
  '~': 'water',
  '=': 'ford',
  m: 'marsh',
};

export const TERRAIN_LEGEND: Array<{ terrain: Terrain; glyph: string }> = [
  { terrain: 'grass', glyph: '.' },
  { terrain: 'field', glyph: ',' },
  { terrain: 'forest', glyph: 'f' },
  { terrain: 'hill', glyph: '^' },
  { terrain: 'village', glyph: '#' },
  { terrain: 'ford', glyph: '=' },
  { terrain: 'water', glyph: '~' },
  { terrain: 'marsh', glyph: 'm' },
];

export function terrainCost(type: UnitType, terrain: Terrain): number {
  const base = TERRAIN[terrain].moveCost;
  if (!Number.isFinite(base)) return Infinity;
  switch (type) {
    case 'light':
      if (terrain === 'forest' || terrain === 'hill') return 1;
      if (terrain === 'marsh') return 2;
      break;
    case 'cavalry':
      if (terrain === 'forest' || terrain === 'hill' || terrain === 'marsh') return 3;
      if (terrain === 'village') return 2;
      if (terrain === 'ford') return 3;
      break;
    case 'artillery':
      if (terrain === 'forest' || terrain === 'marsh') return Infinity;
      if (terrain === 'hill') return 3;
      if (terrain === 'village') return 2;
      if (terrain === 'ford') return 3;
      break;
    case 'commander':
      if (terrain === 'forest' || terrain === 'hill') return 1;
      break;
    default:
      break;
  }
  return base;
}

export function isPassable(type: UnitType, terrain: Terrain): boolean {
  return Number.isFinite(terrainCost(type, terrain));
}

export function qualityLabel(quality: number): string {
  return ['', 'Levy', 'Recruit', 'Trained', 'Veteran', 'Elite'][Math.max(1, Math.min(5, Math.round(quality)))] ?? 'Trained';
}

export function qualityFactor(quality: number): number {
  return 0.7 + 0.12 * quality;
}

export function formationName(formation: Formation): string {
  return formation === 'line' ? 'Line' : formation === 'column' ? 'Column' : 'Square';
}

export function moveAllowance(type: UnitType, formation: Formation): number {
  const base = UNIT_STATS[type].move;
  if (type === 'commander' || type === 'cavalry' || type === 'artillery') return base;
  return Math.max(1, Math.floor(base * FORMATION_MODS[formation].movement));
}

export function defaultQuality(type: UnitType, nation: Nation): number {
  if (type === 'guard') return 5;
  if (type === 'cavalry') return 4;
  if (type === 'commander') return 5;
  if (nation === 'france') return 4;
  return 3;
}
