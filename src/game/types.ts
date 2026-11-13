export type Nation = 'france' | 'coalition';

export type UnitType = 'line' | 'light' | 'guard' | 'cavalry' | 'artillery' | 'commander';

export type Formation = 'line' | 'column' | 'square';

export type Terrain = 'grass' | 'field' | 'forest' | 'hill' | 'village' | 'water' | 'ford' | 'marsh';

export type AttackMode = 'fire' | 'melee';

export interface HexData {
  q: number;
  r: number;
  col: number;
  row: number;
  terrain: Terrain;
}

export interface Unit {
  id: string;
  name: string;
  nation: Nation;
  type: UnitType;
  q: number;
  r: number;
  strength: number;
  maxStrength: number;
  quality: number;
  morale: number;
  formation: Formation;
  mp: number;
  acted: boolean;
  reformed: boolean;
  distanceMoved: number;
  rallyUsed: boolean;
}

export interface Objective {
  id: string;
  name: string;
  q: number;
  r: number;
  owner: Nation | null;
}

export interface UnitSeed {
  name: string;
  type: UnitType;
  nation: Nation;
  col: number;
  row: number;
  quality?: number;
}

export interface ObjectiveSeed {
  id: string;
  name: string;
  col: number;
  row: number;
  owner: Nation | null;
}

export type LogKind = 'info' | 'combat' | 'rout' | 'victory' | 'defeat' | 'manoeuvre';

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  kind: LogKind;
}

export type AiStance = 'defend' | 'counter';

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  place: string;
  command: string;
  intro: string;
  history: string;
  turnLimit: number;
  aiStance: AiStance;
  map: string[];
  objectives: ObjectiveSeed[];
  units: UnitSeed[];
  hints: string[];
}

export interface UnitStats {
  label: string;
  short: string;
  strength: number;
  move: number;
  range: number;
  fire: number;
  melee: number;
  icon: 'infantry' | 'light' | 'guard' | 'cavalry' | 'artillery' | 'commander';
  description: string;
}

export interface BattleStats {
  shots: number;
  charges: number;
  casualties: Record<Nation, number>;
}

export interface BattleState {
  scenarioId: string;
  turn: number;
  maxTurns: number;
  phase: 'player' | 'enemy' | 'over';
  aiStance: AiStance;
  units: Unit[];
  map: Record<string, HexData>;
  objectives: Objective[];
  log: LogEntry[];
  winner: Nation | null;
  endReason: 'objectives' | 'annihilation' | 'time' | null;
  initialStrength: Record<Nation, number>;
  stats: BattleStats;
  nextLogId: number;
}

export interface CombatForecast {
  mode: AttackMode;
  damage: number;
  minDamage: number;
  maxDamage: number;
  moraleLoss: number;
  selfDamage: number;
  selfMoraleLoss: number;
  breaksTarget: boolean;
}

export interface CombatResult extends CombatForecast {
  actualDamage: number;
  actualSelfDamage: number;
  targetDestroyed: boolean;
  attackerDestroyed: boolean;
}

export interface ReachableHex {
  q: number;
  r: number;
  cost: number;
  path: Array<{ q: number; r: number }>;
}
