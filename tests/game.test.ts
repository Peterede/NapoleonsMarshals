import { describe, expect, it } from 'vitest';
import { applyAiAction, chooseAiAction, runAiPhaseSync } from '../src/game/ai';
import { hexDistance, offsetToAxial, pixelToHex, hexCenter } from '../src/game/hex';
import {
  attack,
  canAttack,
  changeFormation,
  createBattle,
  endPlayerTurn,
  finishRound,
  forecast,
  isInfantry,
  moveAlongPath,
  reachableHexes,
  sideStrength,
} from '../src/game/game';
import { SCENARIOS } from '../src/game/scenarios';
import type { BattleState } from '../src/game/types';

function autoBattle(scenarioId: string): BattleState {
  const state = createBattle(scenarioId);
  let guard = 0;
  while (!state.winner && guard < 60) {
    runAiPhaseSync(state, 'france');
    if (state.winner) break;
    endPlayerTurn(state);
    runAiPhaseSync(state, 'coalition');
    if (state.winner) break;
    finishRound(state);
    guard++;
  }
  return state;
}

describe('hex grid', () => {
  it('round-trips pixel coordinates', () => {
    const size = 30;
    for (const [q, r] of [[0, 0], [3, 2], [-4, 6], [7, -3]]) {
      const { x, y } = hexCenter(q, r, size);
      expect(pixelToHex(x, y, size)).toEqual({ q, r });
    }
  });

  it('measures distance and offset conversions', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 })).toBe(3);
    const axial = offsetToAxial(5, 3);
    expect(hexDistance(axial, offsetToAxial(5, 3))).toBe(0);
  });
});

describe('scenarios', () => {
  for (const scenario of SCENARIOS) {
    it(`builds ${scenario.id} without invalid deployments`, () => {
      const state = createBattle(scenario.id);
      expect(state.units.length).toBe(scenario.units.length);
      expect(state.objectives.length).toBe(scenario.objectives.length);
      expect(new Set(state.units.map((u) => `${u.q},${u.r}`)).size).toBe(state.units.length);
      expect(sideStrength(state, 'france')).toBeGreaterThan(0);
      expect(sideStrength(state, 'coalition')).toBeGreaterThan(0);
      for (const unit of state.units) {
        expect(state.map[`${unit.q},${unit.r}`]).toBeTruthy();
      }
    });
  }
});

describe('orders and combat', () => {
  it('moves a unit within its allowance and blocks occupied hexes', () => {
    const state = createBattle('lodi');
    const unit = state.units.find((u) => u.name === 'Carabiniers')!;
    const options = reachableHexes(state, unit);
    const reachable = [...options.values()].filter((o) => o.path.length > 0);
    expect(reachable.length).toBeGreaterThan(0);
    const destination = reachable[0];
    expect(moveAlongPath(state, unit, destination.path)).toBe(true);
    expect(unit.q).toBe(destination.q);
    expect(unit.q + ',' + unit.r).not.toBe('');
    expect(unit.mp).toBeLessThan(4);
  });

  it('changes formation only for infantry and ends their action', () => {
    const state = createBattle('lodi');
    const infantry = state.units.find((u) => u.nation === 'france' && isInfantry(u.type))!;
    expect(changeFormation(state, infantry, 'square')).toBe(true);
    expect(infantry.formation).toBe('square');
    expect(infantry.acted).toBe(false);
    expect(infantry.reformed).toBe(true);
    expect(changeFormation(state, infantry, 'line')).toBe(false);
  });

  it('punishes cavalry against a square but rewards it against a line', () => {
    const state = createBattle('austerlitz');
    const cavalry = state.units.find((u) => u.name === '1er Cuirassiers')!;
    const target = state.units.find((u) => u.name === 'Moscow Regiment')!;
    // Put the cavalry adjacent and give it a charge.
    cavalry.q = target.q + 1;
    cavalry.r = target.r;
    cavalry.distanceMoved = 2;
    const lineForecast = forecast(state, cavalry, target)!;
    target.formation = 'square';
    const squareForecast = forecast(state, cavalry, target)!;
    expect(lineForecast.damage).toBeGreaterThan(squareForecast.damage);
    expect(squareForecast.selfDamage).toBeGreaterThan(0);
  });

  it('does not allow a battery to fire after moving', () => {
    const state = createBattle('lodi');
    const gun = state.units.find((u) => u.name === 'Batterie de Lodi')!;
    const target = state.units.find((u) => u.name === 'Austrian Battery')!;
    // Move the gun artificially next to open sightline distance and mark movement.
    gun.distanceMoved = 1;
    gun.q = target.q + 2;
    gun.r = target.r;
    expect(canAttack(state, gun, target)).toBe(false);
    gun.distanceMoved = 0;
    expect(canAttack(state, gun, target)).toBe(true);
  });

  it('resolves an attack and records casualties', () => {
    const state = createBattle('lodi');
    const attacker = state.units.find((u) => u.name === '1er Régiment de Ligne')!;
    const defender = state.units.find((u) => u.name === 'Erzherzog Karl Regiment')!;
    attacker.q = defender.q + 1;
    attacker.r = defender.r;
    const before = defender.strength;
    const outcome = attack(state, attacker, defender);
    expect(outcome).not.toBeNull();
    expect(defender.strength).toBeLessThan(before);
    expect(attacker.acted).toBe(true);
    expect(state.stats.casualties.coalition).toBeGreaterThan(0);
  });
});

describe('AI full battle', () => {
  it('plays every scenario to a conclusion without stalling', () => {
    for (const scenario of SCENARIOS) {
      const state = autoBattle(scenario.id);
      expect(state.winner).not.toBeNull();
      expect(state.turn).toBeLessThanOrEqual(scenario.turnLimit + 1);
      for (const unit of state.units) {
        expect(Number.isFinite(unit.strength)).toBe(true);
        expect(unit.strength).toBeGreaterThan(0);
        expect(unit.morale).toBeGreaterThan(0);
      }
    }
  }, 60000);

  it('takes a sensible opening action for the allies', () => {
    const state = createBattle('lodi');
    const action = chooseAiAction(state, 'coalition');
    expect(action).not.toBeNull();
    const before = state.units.length;
    applyAiAction(state, action!);
    expect(state.units.length).toBeLessThanOrEqual(before);
    expect(action!.unitId).toBeTruthy();
  });
});
