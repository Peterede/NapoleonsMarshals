import { hexDistance } from './hex';
import { forecastAttack, terrainAt } from './combat';
import type { AiStance, AttackMode, BattleState, CombatForecast, Formation, Nation, Objective, Unit } from './types';
import {
  changeFormation,
  findUnit,
  isInfantry,
  moveAlongPath,
  rally,
  reachableHexes,
  attack,
} from './game';
import { TERRAIN, UNIT_STATS } from './units';

export interface AiAction {
  unitId: string;
  path: Array<{ q: number; r: number }>;
  targetId?: string;
  mode?: AttackMode;
  formation?: Formation;
  rally?: boolean;
  wait?: boolean;
}

interface ScoredAttack {
  target: Unit;
  mode: AttackMode;
  forecast: CombatForecast;
  score: number;
}

interface Candidate {
  q: number;
  r: number;
  path: Array<{ q: number; r: number }>;
  score: number;
  attack?: ScoredAttack;
}

const TYPE_PRIORITY: Record<string, number> = {
  commander: 0,
  artillery: 1,
  guard: 2,
  line: 3,
  light: 4,
  cavalry: 5,
};

function stanceFor(state: BattleState, nation: Nation): AiStance {
  return nation === 'france' ? 'counter' : state.aiStance;
}

function bestAttack(
  state: BattleState,
  unit: Unit,
  moved: boolean,
): ScoredAttack | null {
  const stats = UNIT_STATS[unit.type];
  if (unit.type === 'commander') return null;
  let best: ScoredAttack | null = null;

  for (const target of state.units) {
    if (target.nation === unit.nation) continue;
    const distance = hexDistance(unit, target);
    let mode: AttackMode | null = null;
    if (distance === 1) mode = 'melee';
    else if (distance <= stats.range && !(unit.type === 'artillery' && moved)) mode = 'fire';
    if (!mode) continue;

    const forecast = forecastAttack(state, unit, target, mode);
    let score = forecast.damage * 1.05 + forecast.moraleLoss * 0.9;
    score += forecast.breaksTarget ? 26 : 0;
    if (forecast.damage >= target.strength) score += 34;
    if (target.type === 'artillery') score += 16;
    if (target.type === 'commander') score += 10;
    if (mode === 'melee') {
      score -= forecast.selfDamage * 0.92 + forecast.selfMoraleLoss * 0.7;
      if (forecast.selfDamage >= unit.strength) score -= 55;
      if (forecast.selfMoraleLoss >= unit.morale) score -= 45;
    }
    if (state.objectives.some((o) => o.q === target.q && o.r === target.r)) score += 16;
    score += (1 - target.morale / 100) * 22 + (1 - target.strength / target.maxStrength) * 24;
    if (unit.type === 'cavalry' && target.formation === 'square') score -= 22;

    if (!best || score > best.score) best = { target, mode, forecast, score };
  }
  return best;
}

function objectiveContested(state: BattleState, objective: Objective, nation: Nation): boolean {
  if (objective.owner !== nation) return true;
  return state.units.some((u) => u.nation !== nation && u.q === objective.q && u.r === objective.r);
}

function objectiveAnchors(state: BattleState, nation: Nation): Map<string, Objective> {
  const units = state.units
    .filter((u) => u.nation === nation && u.type !== 'commander')
    .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9) || a.id.localeCompare(b.id));
  const objectives = state.objectives;
  const anchors = new Map<string, Objective>();
  if (objectives.length === 0) return anchors;

  const counts = new Map<string, number>(objectives.map((o) => [o.id, 0]));
  const claimed = new Set<string>();

  // Detach one regiment to each objective the enemy is contesting.
  const contested = objectives.filter((o) => objectiveContested(state, o, nation));
  for (const objective of contested) {
    const candidates = units.filter((u) => !claimed.has(u.id));
    if (candidates.length === 0) break;
    candidates.sort((a, b) => hexDistance(a, objective) - hexDistance(b, objective));
    const chosen = candidates[0];
    anchors.set(chosen.id, objective);
    claimed.add(chosen.id);
    counts.set(objective.id, (counts.get(objective.id) ?? 0) + 1);
  }

  const unclaimed = units.filter((u) => !claimed.has(u.id));
  const capacity = Math.max(1, Math.ceil(units.length / objectives.length));

  for (const unit of unclaimed) {
    const sorted = [...objectives].sort((a, b) => {
      const ca = counts.get(a.id) ?? 0;
      const cb = counts.get(b.id) ?? 0;
      if (ca !== cb) return ca - cb;
      return hexDistance(unit, a) - hexDistance(unit, b);
    });
    const choice = sorted.find((o) => (counts.get(o.id) ?? 0) < capacity) ?? sorted[0];
    anchors.set(unit.id, choice);
    counts.set(choice.id, (counts.get(choice.id) ?? 0) + 1);
  }
  return anchors;
}

function positionScore(
  state: BattleState,
  unit: Unit,
  stance: AiStance,
  q: number,
  r: number,
  anchor?: Objective,
): number {
  let score = 0;
  const terrain = terrainAt(state, q, r);
  score += (TERRAIN[terrain].cover - 1) * 26;

  const enemies = state.units.filter((u) => u.nation !== unit.nation);
  let nearestEnemy = Infinity;
  for (const enemy of enemies) {
    const distance = hexDistance({ q, r }, enemy);
    nearestEnemy = Math.min(nearestEnemy, distance);
    if (distance <= 2) {
      score -= enemy.strength * 0.012;
      if (unit.type === 'artillery') score -= 14;
      if (unit.type === 'commander') score -= 18;
      if (unit.type === 'cavalry' && enemy.formation === 'square') score -= 10;
      if (isInfantry(unit.type) && enemy.type === 'cavalry' && unit.formation !== 'square') score -= 9;
    }
  }

  if (unit.type === 'commander') {
    const friends = state.units.filter((u) => u.nation === unit.nation && u.type !== 'commander');
    const nearby = friends.filter((f) => hexDistance({ q, r }, f) <= 2).length;
    score += nearby * 7 - 3;
    if (friends.length > 0) {
      const cx = friends.reduce((sum, f) => sum + f.q, 0) / friends.length;
      const cy = friends.reduce((sum, f) => sum + f.r, 0) / friends.length;
      score -= hexDistance({ q, r }, { q: cx, r: cy }) * 1.4;
    }
    score -= Math.max(0, 5 - Math.min(5, nearestEnemy)) * 11;
    return score;
  }

  let nearestObjective = Infinity;
  for (const objective of state.objectives) {
    const distance = hexDistance({ q, r }, objective);
    nearestObjective = Math.min(nearestObjective, distance);
    if (distance === 0) score += objective.owner === unit.nation ? 14 : 18;
  }

  const anchorDistance = anchor ? hexDistance({ q, r }, anchor) : nearestObjective;
  const anchorWeight = unit.type === 'artillery' ? 1.6 : unit.type === 'cavalry' ? 2.2 : 4.2;
  if (anchor && anchorDistance === 0) score += 16;

  if (stance === 'defend') {
    score -= anchorDistance * anchorWeight;
    score -= nearestObjective * 0.6;
  } else {
    score -= anchorDistance * Math.min(anchorWeight, 1.8);
    score -= nearestObjective * 0.7;
    score -= Math.min(nearestEnemy, 10) * 0.8;
  }

  if (unit.type === 'artillery') {
    if (nearestEnemy <= 2) score -= 34;
    else if (nearestEnemy >= 3 && nearestEnemy <= 5) score += 9;
    else score -= 3;
  }
  if (unit.type === 'cavalry') {
    if (nearestEnemy >= 3 && nearestEnemy <= 6) score += 4;
  }
  return score;
}

function planCommander(state: BattleState, commander: Unit, nation: Nation): AiAction {
  if (!commander.rallyUsed) {
    const broken = state.units.filter(
      (u) =>
        u.nation === nation &&
        u.type !== 'commander' &&
        hexDistance(u, commander) <= 2 &&
        u.morale < 58,
    );
    if (broken.length > 0) return { unitId: commander.id, path: [], rally: true };
  }

  const options = [...reachableHexes(state, commander).values()];
  const stance = stanceFor(state, nation);
  let best: Candidate = { q: commander.q, r: commander.r, path: [], score: positionScore(state, commander, stance, commander.q, commander.r) + 2 };
  for (const option of options) {
    if (option.path.length === 0) continue;
    const score = positionScore(state, commander, stance, option.q, option.r);
    if (score > best.score) best = { q: option.q, r: option.r, path: option.path, score };
  }
  return { unitId: commander.id, path: best.path, wait: best.path.length === 0 };
}

function planUnit(state: BattleState, unit: Unit, nation: Nation): AiAction {
  if (unit.type === 'commander') return planCommander(state, unit, nation);

  const stance = stanceFor(state, nation);
  const anchor = objectiveAnchors(state, nation).get(unit.id);
  const anchorVacant =
    anchor !== undefined &&
    !state.units.some((u) => u.nation === nation && u.q === anchor.q && u.r === anchor.r);
  const garrisonUrgent = anchorVacant && isInfantry(unit.type);
  const options = [...reachableHexes(state, unit).values()];
  const origin = { q: unit.q, r: unit.r };
  let best: Candidate | null = null;

  for (const option of options) {
    const moved = option.path.length > 0;
    if (moved && state.units.some((u) => u.id !== unit.id && u.q === option.q && u.r === option.r)) continue;

    unit.q = option.q;
    unit.r = option.r;
    const oldMoved = unit.distanceMoved;
    unit.distanceMoved += option.path.length;
    const attackOption = bestAttack(state, unit, moved);
    unit.distanceMoved = oldMoved;

    const attackScore = attackOption?.score ?? 0;
    let score =
      (garrisonUrgent ? attackScore * 0.35 : attackScore) +
      positionScore(state, unit, stance, option.q, option.r, anchor);
    if (!moved) score += 2;
    if (attackOption && attackOption.mode === 'melee' && attackOption.score < 8) score -= 6;
    if (best === null || score > best.score) {
      best = {
        q: option.q,
        r: option.r,
        path: option.path,
        score,
        attack: attackOption ?? undefined,
      };
    }
  }

  unit.q = origin.q;
  unit.r = origin.r;

  // Infantry will form square when enemy horse is close, unless a decisive attack is on offer.
  if (isInfantry(unit.type)) {
    const horseNear = state.units.filter(
      (u) =>
        u.nation !== nation &&
        u.type === 'cavalry' &&
        u.strength > 220 &&
        hexDistance(u, unit) <= 3,
    );
    const exposed = TERRAIN[terrainAt(state, unit.q, unit.r)].cover < 1.15;
    const decisive = best?.attack && best.attack.score > 62;
    let wanted: Formation | null = null;
    if (horseNear.length > 0 && unit.formation !== 'square' && !decisive && (exposed || hexDistance(horseNear[0], unit) <= 1)) {
      wanted = 'square';
    }
    if (unit.formation === 'square' && horseNear.length === 0) wanted = 'line';

    if (wanted) {
      const previous = unit.formation;
      unit.formation = wanted;
      const shot = bestAttack(state, unit, false);
      unit.formation = previous;
      const fireOption = shot && shot.mode === 'fire' ? shot : null;
      return {
        unitId: unit.id,
        path: [],
        formation: wanted,
        targetId: fireOption?.target.id,
        mode: fireOption?.mode,
      };
    }
  }

  if (!best) return { unitId: unit.id, path: [], wait: true };

  const attack = best.attack;
  if (attack) {
    if (best.path.length === 0) {
      return { unitId: unit.id, path: [], targetId: attack.target.id, mode: attack.mode };
    }
    return { unitId: unit.id, path: best.path, targetId: attack.target.id, mode: attack.mode };
  }

  if (best.path.length > 0 && best.score > positionScore(state, unit, stance, unit.q, unit.r, anchor) + 0.5) {
    return { unitId: unit.id, path: best.path };
  }
  return { unitId: unit.id, path: [], wait: true };
}

export function chooseAiAction(state: BattleState, nation: Nation): AiAction | null {
  if (state.winner) return null;
  const ready = state.units
    .filter((u) => u.nation === nation && !u.acted)
    .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9));
  const unit = ready[0];
  if (!unit) return null;
  return planUnit(state, unit, nation);
}

export interface AiApplied {
  moved: boolean;
  attacked: boolean;
  rallied: boolean;
  reformed: boolean;
}

export function applyAiAction(state: BattleState, action: AiAction): AiApplied {
  const unit = findUnit(state, action.unitId);
  if (!unit) return { moved: false, attacked: false, rallied: false, reformed: false };

  let rallied = false;
  let reformed = false;
  let moved = false;
  let attacked = false;

  if (action.rally) {
    rallied = rally(state, unit).length > 0;
  } else {
    if (action.formation) reformed = changeFormation(state, unit, action.formation);
    if (action.path.length > 0 && !reformed) moved = moveAlongPath(state, unit, action.path);
    if (action.targetId) {
      const target = findUnit(state, action.targetId);
      if (target && !state.winner) {
        attacked = attack(state, unit, target) !== null;
      }
    }
  }

  unit.acted = true;
  unit.mp = 0;
  return { moved, attacked, rallied, reformed };
}

/** Test helper: resolve an entire AI phase synchronously. */
export function runAiPhaseSync(state: BattleState, nation: Nation): number {
  let count = 0;
  while (!state.winner && count < 60) {
    const action = chooseAiAction(state, nation);
    if (!action) break;
    applyAiAction(state, action);
    count++;
  }
  return count;
}

