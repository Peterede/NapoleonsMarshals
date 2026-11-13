import { hexDistance, keyOf, neighbors, offsetToAxial } from './hex';
import { artilleryCanFire, forecastAttack, resolveAttack, terrainAt, unitAt } from './combat';
import type {
  BattleState,
  CombatForecast,
  CombatResult,
  Formation,
  HexData,
  LogKind,
  Nation,
  Objective,
  ReachableHex,
  Scenario,
  Terrain,
  Unit,
  UnitType,
} from './types';
import { TERRAIN, TERRAIN_CHAR, UNIT_STATS, defaultQuality, moveAllowance, qualityLabel, terrainCost } from './units';
import { getScenario } from './scenarios';

const INFANTRY: UnitType[] = ['line', 'light', 'guard'];

export function log(state: BattleState, text: string, kind: LogKind = 'info'): void {
  state.log.push({ id: state.nextLogId++, turn: state.turn, text, kind });
  if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
}

function buildMap(scenario: Scenario): Record<string, HexData> {
  const map: Record<string, HexData> = {};
  scenario.map.forEach((row, rowIndex) => {
    if (row.length !== scenario.map[0].length) {
      throw new Error(`${scenario.id}: map row ${rowIndex} has ${row.length} columns, expected ${scenario.map[0].length}`);
    }
    for (let col = 0; col < row.length; col++) {
      const char = row[col];
      const terrain = TERRAIN_CHAR[char];
      if (!terrain) throw new Error(`${scenario.id}: unknown terrain "${char}" at ${col},${rowIndex}`);
      const { q, r } = offsetToAxial(col, rowIndex);
      map[keyOf(q, r)] = { q, r, col, row: rowIndex, terrain };
    }
  });
  return map;
}

function hexFor(scenario: Scenario, map: Record<string, HexData>, col: number, row: number): HexData {
  const { q, r } = offsetToAxial(col, row);
  const hex = map[keyOf(q, r)];
  if (!hex) throw new Error(`${scenario.id}: position ${col},${row} is off the map`);
  return hex;
}

export function createBattle(scenarioId: string): BattleState {
  const scenario = getScenario(scenarioId);
  const map = buildMap(scenario);

  const objectives: Objective[] = scenario.objectives.map((seed) => {
    const hex = hexFor(scenario, map, seed.col, seed.row);
    return { id: seed.id, name: seed.name, q: hex.q, r: hex.r, owner: seed.owner };
  });

  const units: Unit[] = [];
  const occupied = new Set<string>();
  scenario.units.forEach((seed, index) => {
    const hex = hexFor(scenario, map, seed.col, seed.row);
    if (TERRAIN[hex.terrain].moveCost === Infinity) {
      throw new Error(`${scenario.id}: ${seed.name} deployed in impassable terrain at ${seed.col},${seed.row}`);
    }
    if (occupied.has(keyOf(hex.q, hex.r))) {
      throw new Error(`${scenario.id}: overlapping deployment at ${seed.col},${seed.row}`);
    }
    occupied.add(keyOf(hex.q, hex.r));
    const quality = seed.quality ?? defaultQuality(seed.type, seed.nation);
    const unit: Unit = {
      id: `${seed.nation === 'france' ? 'fr' : 'co'}-${index + 1}`,
      name: seed.name,
      nation: seed.nation,
      type: seed.type,
      q: hex.q,
      r: hex.r,
      strength: UNIT_STATS[seed.type].strength,
      maxStrength: UNIT_STATS[seed.type].strength,
      quality,
      morale: Math.min(98, 74 + quality * 4),
      formation: 'line',
      mp: Math.max(1, UNIT_STATS[seed.type].move),
      acted: false,
      reformed: false,
      distanceMoved: 0,
      rallyUsed: false,
    };
    units.push(unit);
  });

  const initialStrength: Record<Nation, number> = { france: 0, coalition: 0 };
  for (const unit of units) initialStrength[unit.nation] += unit.maxStrength;

  const state: BattleState = {
    scenarioId,
    turn: 1,
    maxTurns: scenario.turnLimit,
    phase: 'player',
    aiStance: scenario.aiStance,
    units,
    map,
    objectives,
    log: [],
    winner: null,
    endReason: null,
    initialStrength,
    stats: { shots: 0, charges: 0, casualties: { france: 0, coalition: 0 } },
    nextLogId: 1,
  };

  log(state, `${scenario.place}, ${scenario.date}. ${scenario.command} stands to arms.`, 'info');
  log(state, `Orders: take ${objectives.map((o) => o.name).join(', ')} within ${scenario.turnLimit} turns.`, 'manoeuvre');
  beginPhase(state, 'france');
  return state;
}

export function sideStrength(state: BattleState, nation: Nation): number {
  return state.units.filter((u) => u.nation === nation).reduce((sum, u) => sum + u.strength, 0);
}

export function sideUnits(state: BattleState, nation: Nation): Unit[] {
  return state.units.filter((u) => u.nation === nation);
}

export function findUnit(state: BattleState, id: string): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

export function objectivesHeld(state: BattleState, nation: Nation): number {
  return state.objectives.filter((o) => o.owner === nation).length;
}

export function isInfantry(type: UnitType): boolean {
  return INFANTRY.includes(type);
}

export function unitLabel(unit: Unit): string {
  if (unit.type === 'commander') return unit.name;
  return UNIT_STATS[unit.type].label;
}

export function unitQuality(unit: Unit): string {
  return qualityLabel(unit.quality);
}

export function beginPhase(state: BattleState, nation: Nation): void {
  for (const unit of state.units) {
    if (unit.nation !== nation) continue;
    unit.acted = false;
    unit.reformed = false;
    unit.distanceMoved = 0;
    unit.mp = moveAllowance(unit.type, unit.formation);
    if (unit.type === 'commander') unit.mp = UNIT_STATS.commander.move;
    const enemyNearby = state.units.some(
      (enemy) => enemy.nation !== nation && hexDistance(enemy, unit) <= 2,
    );
    if (!enemyNearby && unit.morale < 88) unit.morale = Math.min(88, unit.morale + 6);
  }
  if (nation === 'france') {
    log(state, `Turn ${state.turn} — ${state.turn === 1 ? 'the engagement opens.' : 'the Emperor expects an answer.'}`, 'info');
  }
}

export function reachableHexes(state: BattleState, unit: Unit): Map<string, ReachableHex> {
  const result = new Map<string, ReachableHex>();
  const start: ReachableHex = { q: unit.q, r: unit.r, cost: 0, path: [] };
  result.set(keyOf(unit.q, unit.r), start);
  if (unit.acted || unit.mp <= 0) return result;

  const engaged = state.units.some(
    (enemy) => enemy.nation !== unit.nation && hexDistance(enemy, unit) === 1,
  );
  const disengageCost = engaged ? 2 : 0;

  interface Node extends ReachableHex {
    cost: number;
  }
  const frontier: Node[] = [{ ...start }];
  const best = new Map<string, number>([[keyOf(unit.q, unit.r), 0]]);

  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost);
    const node = frontier.shift();
    if (!node) break;
    if (node.cost > (best.get(keyOf(node.q, node.r)) ?? Infinity)) continue;

    for (const n of neighbors(node.q, node.r)) {
      const hex = state.map[keyOf(n.q, n.r)];
      if (!hex) continue;
      const cost = terrainCost(unit.type, hex.terrain);
      if (!Number.isFinite(cost)) continue;
      if (state.units.some((u) => u.id !== unit.id && u.q === n.q && u.r === n.r)) continue;

      const stepCost = cost + (node.q === unit.q && node.r === unit.r ? disengageCost : 0);
      const total = node.cost + stepCost;
      if (total > unit.mp) continue;
      const existing = best.get(keyOf(n.q, n.r));
      if (existing !== undefined && existing <= total) continue;

      best.set(keyOf(n.q, n.r), total);
      const reach: ReachableHex = { q: n.q, r: n.r, cost: total, path: [...node.path, { q: n.q, r: n.r }] };
      result.set(keyOf(n.q, n.r), reach);
      frontier.push({ ...reach });
    }
  }
  return result;
}

export function moveAlongPath(state: BattleState, unit: Unit, path: Array<{ q: number; r: number }>): boolean {
  if (unit.acted || path.length === 0) return false;
  const options = reachableHexes(state, unit);
  const destination = path[path.length - 1];
  const reach = options.get(keyOf(destination.q, destination.r));
  if (!reach) return false;
  if (reach.path.length !== path.length) return false;
  for (let i = 0; i < path.length; i++) {
    if (reach.path[i].q !== path[i].q || reach.path[i].r !== path[i].r) return false;
  }
  unit.q = destination.q;
  unit.r = destination.r;
  unit.mp = Math.max(0, unit.mp - reach.cost);
  unit.distanceMoved += path.length;
  return true;
}

export function attackModeFor(_state: BattleState, attacker: Unit, defender: Unit): 'fire' | 'melee' | null {
  const distance = hexDistance(attacker, defender);
  if (distance === 1) {
    if (attacker.type === 'commander' || attacker.type === 'artillery' || attacker.reformed) return null;
    return 'melee';
  }
  if (attacker.type === 'commander') return null;
  if (!artilleryCanFire(attacker)) return null;
  if (distance > UNIT_STATS[attacker.type].range) return null;
  return 'fire';
}

export function canAttack(state: BattleState, attacker: Unit, defender: Unit): boolean {
  if (attacker.acted || attacker.nation === defender.nation) return false;
  return attackModeFor(state, attacker, defender) !== null;
}

export interface AttackOutcome {
  result: CombatResult;
  attacker: Unit;
  defender: Unit;
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
}

export function attack(state: BattleState, attacker: Unit, defender: Unit): AttackOutcome | null {
  if (!canAttack(state, attacker, defender)) return null;
  const mode = attackModeFor(state, attacker, defender);
  if (!mode) return null;

  const result = resolveAttack(state, attacker, defender, mode);

  if (mode === 'fire') {
    const weapon = attacker.type === 'artillery' ? 'the battery' : 'a crashing volley';
    log(state, `${attacker.name} delivers ${weapon} into ${defender.name}: ${result.actualDamage} men down.`, 'combat');
  } else {
    log(state, `${attacker.name} charges ${defender.name}: ${result.actualDamage} enemy down, ${result.actualSelfDamage} of our own.`, 'combat');
  }

  attacker.acted = true;
  attacker.mp = 0;

  let defenderDestroyed = false;
  let attackerDestroyed = false;

  if (result.targetDestroyed) {
    defenderDestroyed = true;
    const causedByMorale = defender.strength > 0;
    log(
      state,
      causedByMorale
        ? `${defender.name} breaks under the strain and streams from the field.`
        : `${defender.name} is destroyed where it stands.`,
      'rout',
    );
    removeUnit(state, defender);
    moraleShock(state, defender);
    if (defender.type === 'commander') {
      log(state, `Word spreads that ${defender.name} has fallen. The army reels.`, 'rout');
      for (const unit of state.units) {
        if (unit.nation === defender.nation) unit.morale = Math.max(0, unit.morale - 8);
      }
    }
  }

  if (result.attackerDestroyed) {
    attackerDestroyed = true;
    log(state, `${attacker.name} is shattered in the attack and quits the field.`, 'rout');
    removeUnit(state, attacker);
    moraleShock(state, attacker);
  }

  sweepBroken(state);
  checkImmediateEnd(state);
  return { result, attacker, defender, defenderDestroyed, attackerDestroyed };
}

function moraleShock(state: BattleState, fallen: Unit): void {
  for (const unit of state.units) {
    if (unit.nation !== fallen.nation) continue;
    if (hexDistance(unit, fallen) <= 2) unit.morale = Math.max(0, unit.morale - 3);
  }
}

function removeUnit(state: BattleState, unit: Unit): void {
  const index = state.units.findIndex((u) => u.id === unit.id);
  if (index >= 0) state.units.splice(index, 1);
}

/** Regiments whose morale has been shocked to breaking point leave the field. */
export function sweepBroken(state: BattleState): Unit[] {
  const broken: Unit[] = [];
  for (const unit of [...state.units]) {
    if (unit.strength <= 0 || unit.morale <= 0) {
      broken.push(unit);
      log(state, `${unit.name} can stand no more and breaks apart.`, 'rout');
      removeUnit(state, unit);
    }
  }
  return broken;
}

export function changeFormation(state: BattleState, unit: Unit, formation: Formation): boolean {
  if (!isInfantry(unit.type) || unit.acted || unit.reformed || unit.formation === formation) return false;
  unit.formation = formation;
  unit.mp = 0;
  unit.reformed = true;
  const text =
    formation === 'square'
      ? `${unit.name} forms square, bayonets out.`
      : formation === 'column'
        ? `${unit.name} forms column of assault.`
        : `${unit.name} deploys into line.`;
  log(state, text, 'manoeuvre');
  return true;
}

export function rally(state: BattleState, commander: Unit): Unit[] {
  if (commander.type !== 'commander' || commander.acted || commander.rallyUsed) return [];
  const affected: Unit[] = [];
  for (const unit of state.units) {
    if (unit.nation !== commander.nation || unit.type === 'commander') continue;
    if (hexDistance(unit, commander) <= 2) {
      unit.morale = Math.min(97, unit.morale + 18);
      affected.push(unit);
    }
  }
  commander.rallyUsed = true;
  commander.acted = true;
  commander.mp = 0;
  log(
    state,
    affected.length
      ? `${commander.name} rides the line: ${affected.length} regiment${affected.length > 1 ? 's' : ''} steadied.`
      : `${commander.name} rides the line, but finds no broken troops to steady.`,
    'manoeuvre',
  );
  return affected;
}

export function forecast(state: BattleState, attacker: Unit, defender: Unit): CombatForecast | null {
  if (!canAttack(state, attacker, defender)) return null;
  return forecastAttack(state, attacker, defender);
}

export function endPlayerTurn(state: BattleState): void {
  if (state.phase !== 'player' || state.winner) return;
  state.phase = 'enemy';
  beginPhase(state, 'coalition');
  log(state, 'The allied commanders issue their orders.', 'info');
}

export function refreshObjectives(state: BattleState): void {
  updateObjectiveControl(state);
}

export function finishRound(state: BattleState): void {
  if (state.winner) return;
  updateObjectiveControl(state);
  checkBattleEnd(state);
  if (state.winner) return;
  state.turn += 1;
  state.phase = 'player';
  beginPhase(state, 'france');
}

function updateObjectiveControl(state: BattleState): void {
  for (const objective of state.objectives) {
    const holder = state.units.find((u) => u.q === objective.q && u.r === objective.r);
    const nextOwner = holder ? holder.nation : null;
    if (nextOwner === objective.owner) continue;
    objective.owner = nextOwner;
    if (holder) {
      const verb = holder.nation === 'france' ? 'seizes' : 'retakes';
      log(state, `${holder.name} ${verb} ${objective.name}.`, 'manoeuvre');
    }
  }
}

function checkBattleEnd(state: BattleState): void {
  if (state.winner) return;
  const frenchMen = sideStrength(state, 'france');
  const alliedMen = sideStrength(state, 'coalition');
  const frenchFloor = state.initialStrength.france * 0.12;
  const alliedFloor = state.initialStrength.coalition * 0.12;

  if (sideUnits(state, 'france').length === 0 || frenchMen <= frenchFloor) {
    endBattle(state, 'coalition', 'annihilation');
    return;
  }
  if (sideUnits(state, 'coalition').length === 0 || alliedMen <= alliedFloor) {
    endBattle(state, 'france', 'annihilation');
    return;
  }
  if (state.objectives.every((o) => o.owner === 'france')) {
    endBattle(state, 'france', 'objectives');
    return;
  }
  if (state.turn >= state.maxTurns) {
    endBattle(state, 'coalition', 'time');
  }
}

export function checkImmediateEnd(state: BattleState): void {
  if (state.winner) return;
  if (sideUnits(state, 'france').length === 0) {
    endBattle(state, 'coalition', 'annihilation');
    return;
  }
  if (sideUnits(state, 'coalition').length === 0) {
    endBattle(state, 'france', 'annihilation');
  }
}

function endBattle(state: BattleState, winner: Nation, reason: 'objectives' | 'annihilation' | 'time'): void {
  state.winner = winner;
  state.endReason = reason;
  state.phase = 'over';
  if (winner === 'france') {
    const text =
      reason === 'objectives'
        ? 'Every objective is in French hands. The field, and the day, are ours.'
        : reason === 'annihilation'
          ? 'The allied army has ceased to exist as a fighting force.'
          : 'The allies quit the field. Victory is ours.';
    log(state, text, 'victory');
  } else {
    const text =
      reason === 'time'
        ? 'The sun sinks and the objectives remain in allied hands. The attack has failed.'
        : 'The French army can no longer continue the fight. The eagles are lost.';
    log(state, text, 'defeat');
  }
}

export interface BattleResultSummary {
  winner: Nation;
  reason: 'objectives' | 'annihilation' | 'time';
  stars: number;
  turnsUsed: number;
  frenchRemaining: number;
  alliedRemaining: number;
  frenchLosses: number;
  alliedLosses: number;
  objectivesHeld: number;
  objectiveTotal: number;
}

export function summariseBattle(state: BattleState): BattleResultSummary {
  const frenchRemaining = sideStrength(state, 'france');
  const alliedRemaining = sideStrength(state, 'coalition');
  const heldCount = objectivesHeld(state, 'france');
  let stars = 0;
  if (state.winner === 'france') {
    stars = 1;
    if (frenchRemaining >= state.initialStrength.france * 0.5) stars++;
    if (state.turn <= Math.ceil(state.maxTurns * 0.7)) stars++;
  }
  return {
    winner: state.winner ?? 'coalition',
    reason: state.endReason ?? 'time',
    stars: Math.min(3, stars),
    turnsUsed: state.turn,
    frenchRemaining,
    alliedRemaining,
    frenchLosses: state.initialStrength.france - frenchRemaining,
    alliedLosses: state.initialStrength.coalition - alliedRemaining,
    objectivesHeld: heldCount,
    objectiveTotal: state.objectives.length,
  };
}

export function terrainLabel(state: BattleState, q: number, r: number): string {
  return TERRAIN[terrainAt(state, q, r)].label;
}

export function occupiedBy(state: BattleState, q: number, r: number): Unit | undefined {
  return unitAt(state, q, r);
}

export function objectiveAt(state: BattleState, q: number, r: number): Objective | undefined {
  return state.objectives.find((o) => o.q === q && o.r === r);
}

/** Counts a unit's strength as a rough combat power for UI and AI. */
export function unitPower(unit: Unit): number {
  return unit.strength * (0.55 + unit.quality * 0.09) * (unit.morale / 100) * (unit.type === 'commander' ? 0 : 1);
}

export function terrainCover(state: BattleState, q: number, r: number): number {
  return TERRAIN[terrainAt(state, q, r)].cover;
}

export function terrainTypeAt(state: BattleState, q: number, r: number): Terrain {
  return terrainAt(state, q, r);
}
