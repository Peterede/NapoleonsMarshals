import { SCENARIOS } from './game/scenarios';

const KEY = 'napoleons-marshals.campaign.v1';

export interface BattleRecord {
  victory: boolean;
  stars: number;
  turns: number;
  losses: number;
}

export interface Progress {
  completed: Record<string, BattleRecord>;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { completed: {} };
    const parsed = JSON.parse(raw) as Progress;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.completed !== 'object') {
      return { completed: {} };
    }
    return { completed: parsed.completed };
  } catch {
    return { completed: {} };
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage failures; the campaign still plays in-memory.
  }
}

export function recordVictory(progress: Progress, scenarioId: string, record: BattleRecord): Progress {
  const previous = progress.completed[scenarioId];
  const best = previous && previous.victory && previous.stars >= record.stars ? previous : record;
  return { completed: { ...progress.completed, [scenarioId]: best } };
}

export function recordDefeat(progress: Progress, scenarioId: string, record: BattleRecord): Progress {
  if (progress.completed[scenarioId]?.victory) return progress;
  return { completed: { ...progress.completed, [scenarioId]: record } };
}

export function highestUnlocked(progress: Progress): number {
  let index = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    if (progress.completed[SCENARIOS[i].id]?.victory) index = i + 1;
    else break;
  }
  return Math.min(index, SCENARIOS.length - 1);
}

export function isUnlocked(progress: Progress, index: number): boolean {
  return index <= highestUnlocked(progress);
}

export function nextUnplayed(progress: Progress): number {
  for (let i = 0; i < SCENARIOS.length; i++) {
    if (!progress.completed[SCENARIOS[i].id]?.victory) return i;
  }
  return SCENARIOS.length - 1;
}

export function totalStars(progress: Progress): number {
  return SCENARIOS.reduce((sum, s) => sum + (progress.completed[s.id]?.victory ? progress.completed[s.id].stars : 0), 0);
}

export function isCampaignComplete(progress: Progress): boolean {
  return SCENARIOS.every((s) => progress.completed[s.id]?.victory);
}
