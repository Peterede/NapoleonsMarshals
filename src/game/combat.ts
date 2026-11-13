import { hexDistance } from './hex';
import type { AttackMode, BattleState, CombatForecast, CombatResult, Formation, Nation, Terrain, Unit } from './types';
import { FORMATION_MODS, TERRAIN, UNIT_STATS, qualityFactor } from './units';

export function terrainAt(state: BattleState, q: number, r: number): Terrain {
  return state.map[`${q},${r}`]?.terrain ?? 'grass';
}

export function unitAt(state: BattleState, q: number, r: number): Unit | undefined {
  return state.units.find((u) => u.q === q && u.r === r);
}

export function enemiesOf(state: BattleState, nation: Nation): Unit[] {
  return state.units.filter((u) => u.nation !== nation);
}

export function friendsOf(state: BattleState, nation: Nation): Unit[] {
  return state.units.filter((u) => u.nation === nation);
}

export function unitsWithin(state: BattleState, center: Unit, radius: number, nation?: Nation): Unit[] {
  return state.units.filter(
    (u) =>
      u.id !== center.id &&
      hexDistance(u, center) <= radius &&
      (nation === undefined || u.nation === nation),
  );
}

/** Headquarters inspiration: a friendly commander within two hexes steadies the regiment. */
export function auraBonus(state: BattleState, unit: Unit): number {
  if (unit.type === 'commander') return 1;
  const inspired = state.units.some(
    (u) => u.type === 'commander' && u.nation === unit.nation && hexDistance(u, unit) <= 2,
  );
  return inspired ? 1.07 : 1;
}

function moraleFactor(morale: number): number {
  return Math.max(0.62, Math.min(1.1, 0.65 + 0.45 * (morale / 100)));
}

function supportFactor(state: BattleState, defender: Unit, attacker: Unit): number {
  const others = state.units.filter(
    (u) =>
      u.nation !== defender.nation &&
      u.id !== attacker.id &&
      hexDistance(u, defender) === 1,
  ).length;
  return 1 + Math.min(2, others) * 0.09;
}

export function formationOf(unit: Unit): Formation {
  return unit.formation;
}

interface AttackMath {
  damage: number;
  moraleLoss: number;
  selfDamage: number;
  selfMoraleLoss: number;
}

function computeAttackMath(state: BattleState, attacker: Unit, defender: Unit, mode: AttackMode): AttackMath {
  const aStats = UNIT_STATS[attacker.type];
  const dStats = UNIT_STATS[defender.type];
  const aForm = FORMATION_MODS[attacker.formation];
  const dForm = FORMATION_MODS[defender.formation];
  const cover = TERRAIN[terrainAt(state, defender.q, defender.r)].cover;
  const qDiff = attacker.quality - defender.quality;
  const range = hexDistance(attacker, defender);

  if (mode === 'fire') {
    let rangeFactor = 1;
    if (attacker.type === 'artillery') {
      rangeFactor = range === 1 ? 2.05 : Math.max(0.72, 1 - 0.045 * (range - 1));
    } else {
      rangeFactor = Math.max(0.62, 1 - 0.11 * (range - 1));
    }

    let power =
      attacker.strength *
      aStats.fire *
      qualityFactor(attacker.quality) *
      aForm.fire *
      moraleFactor(attacker.morale) *
      rangeFactor *
      auraBonus(state, attacker) *
      supportFactor(state, defender, attacker);

    if (attacker.type === 'artillery' && defender.formation === 'column') power *= 1.28;
    if (attacker.type === 'artillery' && defender.formation === 'square') power *= 0.82;
    if (attacker.type === 'light' && (terrainAt(state, defender.q, defender.r) === 'forest' || terrainAt(state, defender.q, defender.r) === 'village')) {
      power *= 1.1;
    }

    power *= dForm.incomingFire;

    const damage = Math.max(3, power * 0.058 / cover);
    const moraleLoss = Math.min(32, 3 + (damage / defender.maxStrength) * 95 + Math.max(-3, qDiff) * 1.3 + (attacker.type === 'artillery' ? 2 : 0));
    return { damage, moraleLoss, selfDamage: 0, selfMoraleLoss: 0 };
  }

  // Melee: attackers and defenders trade blows.
  const squareTarget = defender.formation === 'square';
  let charge = 1;
  if (attacker.type === 'cavalry') {
    if (attacker.distanceMoved >= 2) charge = 1.6;
    if (squareTarget) charge *= 0.38;
  }

  const aTerrainCover = TERRAIN[terrainAt(state, attacker.q, attacker.r)].cover;
  const attackPower =
    attacker.strength *
    aStats.melee *
    qualityFactor(attacker.quality) *
    aForm.melee *
    moraleFactor(attacker.morale) *
    auraBonus(state, attacker) *
    supportFactor(state, defender, attacker) *
    charge;

  let defensePower =
    defender.strength *
    dStats.melee *
    qualityFactor(defender.quality) *
    dForm.melee *
    moraleFactor(defender.morale) *
    auraBonus(state, defender) *
    cover;

  if (squareTarget && attacker.type === 'cavalry') defensePower *= 1.65;
  if (defender.type === 'artillery' && attacker.type === 'cavalry') defensePower *= 0.5;

  const defenseDivisor = dForm.defense * (attacker.type === 'cavalry' ? dForm.cavalryDefense : 1);
  const damage = Math.max(3, (attackPower * 0.066) / defenseDivisor);
  const selfDamage = Math.max(2, defensePower * 0.046 / (1 + (aTerrainCover - 1) * 0.6));

  const moraleLoss = Math.min(
    40,
    4 +
      (damage / defender.maxStrength) * 120 +
      Math.max(-3, qDiff) * 1.3 +
      (attacker.type === 'cavalry' ? 3 : 0) +
      (squareTarget && attacker.type === 'cavalry' ? 3 : 0),
  );
  const selfMoraleLoss = Math.min(
    28,
    2 +
      (selfDamage / attacker.maxStrength) * 85 +
      (squareTarget && attacker.type === 'cavalry' ? 7 : 0),
  );

  return { damage, moraleLoss, selfDamage, selfMoraleLoss };
}

export function forecastAttack(state: BattleState, attacker: Unit, defender: Unit, mode?: AttackMode): CombatForecast {
  const finalMode: AttackMode = mode ?? (hexDistance(attacker, defender) === 1 ? 'melee' : 'fire');
  const math = computeAttackMath(state, attacker, defender, finalMode);
  return {
    mode: finalMode,
    damage: Math.round(math.damage),
    minDamage: Math.max(1, Math.round(math.damage * 0.78)),
    maxDamage: Math.round(math.damage * 1.24),
    moraleLoss: Math.round(math.moraleLoss),
    selfDamage: Math.round(math.selfDamage),
    selfMoraleLoss: Math.round(math.selfMoraleLoss),
    breaksTarget: math.moraleLoss >= defender.morale,
  };
}

export function resolveAttack(state: BattleState, attacker: Unit, defender: Unit, mode?: AttackMode): CombatResult {
  const finalMode: AttackMode = mode ?? (hexDistance(attacker, defender) === 1 ? 'melee' : 'fire');
  const math = computeAttackMath(state, attacker, defender, finalMode);
  const roll = 0.8 + Math.random() * 0.4;
  const moraleRoll = 0.9 + Math.random() * 0.2;

  const forecast = forecastAttack(state, attacker, defender, finalMode);
  const actualDamage = Math.max(1, Math.round(math.damage * roll));
  const actualSelfDamage = Math.round(math.selfDamage * (0.85 + Math.random() * 0.3));
  const actualMoraleLoss = Math.round(math.moraleLoss * moraleRoll);
  const actualSelfMoraleLoss = Math.round(math.selfMoraleLoss * moraleRoll);

  defender.strength = Math.max(0, defender.strength - actualDamage);
  defender.morale = Math.max(0, defender.morale - actualMoraleLoss);
  attacker.strength = Math.max(0, attacker.strength - actualSelfDamage);
  attacker.morale = Math.max(0, attacker.morale - actualSelfMoraleLoss);

  const targetDestroyed = defender.strength <= 0 || defender.morale <= 0;
  const attackerDestroyed = attacker.strength <= 0 || attacker.morale <= 0;

  if (finalMode === 'melee') state.stats.charges++;
  else state.stats.shots++;
  state.stats.casualties[defender.nation] += actualDamage;
  state.stats.casualties[attacker.nation] += actualSelfDamage;

  return {
    ...forecast,
    mode: finalMode,
    actualDamage,
    actualSelfDamage,
    targetDestroyed,
    attackerDestroyed,
  };
}

/** True when a battery has moved and therefore cannot unlimber this turn. */
export function artilleryCanFire(unit: Unit): boolean {
  return unit.type !== 'artillery' || unit.distanceMoved === 0;
}
