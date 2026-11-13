import type { BattleState } from '../game/types';
import { SCENARIOS, getScenario } from '../game/scenarios';
import { UNIT_STATS } from '../game/units';
import type { Scenario } from '../game/types';
import {
  isCampaignComplete,
  isUnlocked,
  loadProgress,
  nextUnplayed,
  recordDefeat,
  recordVictory,
  saveProgress,
  totalStars,
  type BattleRecord,
  type Progress,
} from '../storage';
import { audio } from './audio';
import { BattleScreen } from './battle';
import type { BattleResultSummary } from '../game/game';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const number = new Intl.NumberFormat('en-GB');

function starsMarkup(stars: number, total = 3): string {
  return Array.from({ length: total }, (_, i) => `<span class="${i < stars ? 'star filled' : 'star'}">★</span>`).join('');
}

function forceOf(scenario: Scenario, nation: 'france' | 'coalition'): { men: number; units: number; names: string[] } {
  const units = scenario.units.filter((u) => u.nation === nation);
  return {
    units: units.length,
    men: units.reduce((sum, u) => sum + UNIT_STATS[u.type].strength, 0),
    names: units.map((u) => `${u.name} · ${UNIT_STATS[u.type].label}`),
  };
}

function typeCounts(scenario: Scenario, nation: 'france' | 'coalition'): string {
  const counts = new Map<string, number>();
  for (const unit of scenario.units.filter((u) => u.nation === nation)) {
    const label = UNIT_STATS[unit.type].label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => `${count} ${label.toLowerCase()}${count > 1 ? 's' : ''}`).join(' · ');
}

export class GameApp {
  private root: HTMLElement;
  private progress: Progress;
  private battle: BattleScreen | null = null;
  private resultShown = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.progress = loadProgress();
    this.showTitle();
  }

  private clearBattle(): void {
    if (this.battle) {
      this.battle.destroy();
      this.battle = null;
    }
    this.resultShown = false;
    this.root.innerHTML = '';
  }

  private showTitle(): void {
    this.clearBattle();
    const hasProgress = Object.keys(this.progress.completed).length > 0;
    const nextIndex = nextUnplayed(this.progress);
    const next = SCENARIOS[nextIndex];
    this.root.innerHTML = `
      <div class="title-screen">
        <div class="title-frame">
          <div class="title-topline"><span></span><em>MDCCXCVI — MDCCCXV</em><span></span></div>
          <div class="title-eyebrow">A game of columns, squares and cannon smoke</div>
          <h1 class="game-title">Napoleon's<br /><span>Marshals</span></h1>
          <p class="title-sub">Three battles. One empire. The fate of Europe on a hex grid.</p>
          <div class="title-ornament"><span></span><b>⚜</b><span></span></div>
          <div class="title-actions">
            ${
              hasProgress
                ? `<button class="btn btn-primary btn-large" data-go="continue">${isCampaignComplete(this.progress) ? 'Review the Campaign' : 'Continue the Campaign'}</button>`
                : `<button class="btn btn-primary btn-large" data-go="continue">Begin the Campaign</button>`
            }
            <button class="btn btn-ghost btn-large" data-go="campaign">The Campaign</button>
            <button class="btn btn-ghost btn-large" data-go="manual">Field Manual</button>
          </div>
          <p class="title-continue-hint">${
            hasProgress
              ? isCampaignComplete(this.progress)
                ? `All three fields won · ${totalStars(this.progress)} of 9 honours`
                : `Next engagement: ${escapeHtml(next.title)} · ${escapeHtml(next.date)}`
              : 'Begin at the bridge at Lodi, 10 May 1796.'
          }</p>
        </div>
        <div class="title-footer">
          <span>Turn-based hex strategy</span>
          <span>·</span>
          <span>Command the French army against a thinking opponent</span>
          <span>·</span>
          <span>Progress is stored in this browser</span>
        </div>
      </div>
    `;

    this.root.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.unlock();
        audio.play('click');
        const go = el.dataset.go;
        if (go === 'continue') {
          if (isCampaignComplete(this.progress)) this.showCampaign();
          else this.showBriefing(nextUnplayed(this.progress));
        } else if (go === 'campaign') {
          this.showCampaign();
        } else if (go === 'manual') {
          this.showManual();
        }
      });
    });
  }

  private showCampaign(): void {
    this.clearBattle();
    const unlocked = SCENARIOS.map((_, index) => isUnlocked(this.progress, index));
    const nextIndex = nextUnplayed(this.progress);
    this.root.innerHTML = `
      <div class="campaign-screen">
        <header class="screen-head">
          <button class="btn btn-ghost" data-nav="title">‹ Title</button>
          <div class="screen-heading">
            <span class="eyebrow">The Emperor's itinerary</span>
            <h1>The Campaign</h1>
            <p>From the rush of the bridge at Lodi to the last squares on the ridge of Mont-Saint-Jean.</p>
          </div>
          <div class="campaign-honours">
            <span class="eyebrow">Honours</span>
            <strong>${totalStars(this.progress)} <small>/ 9</small></strong>
            <div class="star-row">${starsMarkup(totalStars(this.progress), 9)}</div>
          </div>
        </header>

        <div class="campaign-track">
          ${SCENARIOS.map((scenario, index) => {
            const record = this.progress.completed[scenario.id];
            const open = unlocked[index];
            const best = record?.victory ? record.stars : 0;
            return `
              <article class="battle-card ${open ? '' : 'locked'} ${record?.victory ? 'won' : ''}">
                <div class="card-index"><span>${['I', 'II', 'III'][index] ?? index + 1}</span></div>
                <div class="card-head">
                  <span class="eyebrow">${escapeHtml(scenario.date)} · ${escapeHtml(scenario.place)}</span>
                  <h2>${escapeHtml(scenario.title)}</h2>
                  <p class="card-sub">${escapeHtml(scenario.subtitle)}</p>
                </div>
                <div class="card-rules"></div>
                <p class="card-copy">${escapeHtml(scenario.intro)}</p>
                <div class="card-facts">
                  <div><span>Objectives</span><b>${scenario.objectives.length}</b></div>
                  <div><span>Turn limit</span><b>${scenario.turnLimit}</b></div>
                  <div><span>Your force</span><b>${forceOf(scenario, 'france').units} regiments</b></div>
                </div>
                <div class="card-foot">
                  <div class="card-stars">${record?.victory ? starsMarkup(best) : open ? '<span class="star-ghost">Not yet fought</span>' : '<span class="star-ghost">Locked</span>'}</div>
                  ${
                    open
                      ? `<button class="btn ${nextIndex === index && !record?.victory ? 'btn-primary' : 'btn-ghost'}" data-start="${scenario.id}">${record?.victory ? 'Refight' : 'Take Command'}</button>`
                      : `<button class="btn btn-ghost" disabled>Sealed Orders</button>`
                  }
                </div>
              </article>
            `;
          }).join('')}
        </div>

        <footer class="screen-foot">
          <p>Victories unlock the next engagement. Honours are awarded for speed and for keeping the army intact.</p>
          <button class="btn btn-ghost" data-nav="manual">Read the Field Manual</button>
        </footer>
      </div>
    `;

    this.root.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.play('click');
        if (el.dataset.nav === 'title') this.showTitle();
        else this.showManual();
      });
    });
    this.root.querySelectorAll<HTMLElement>('[data-start]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.play('click');
        const id = el.dataset.start;
        const index = SCENARIOS.findIndex((s) => s.id === id);
        if (index >= 0 && isUnlocked(this.progress, index)) this.showBriefing(index);
      });
    });
  }

  private showBriefing(index: number): void {
    this.clearBattle();
    if (!isUnlocked(this.progress, index)) {
      this.showCampaign();
      return;
    }
    const scenario = SCENARIOS[index];
    const france = forceOf(scenario, 'france');
    const allies = forceOf(scenario, 'coalition');
    const record = this.progress.completed[scenario.id];
    this.root.innerHTML = `
      <div class="briefing-screen">
        <header class="briefing-bar">
          <button class="btn btn-ghost" data-nav="campaign">‹ Campaign</button>
          <div class="briefing-title">
            <span class="eyebrow">${escapeHtml(scenario.date)} · ${escapeHtml(scenario.place)}</span>
            <h1>${escapeHtml(scenario.title)}</h1>
          </div>
          <div class="briefing-stars">${record?.victory ? starsMarkup(record.stars) : ''}</div>
        </header>

        <div class="briefing-body">
          <section class="briefing-main">
            <div class="briefing-parchment">
              <span class="eyebrow">Orders from headquarters</span>
              <h2>${escapeHtml(scenario.subtitle)}</h2>
              <p class="briefing-intro">${escapeHtml(scenario.intro)}</p>
              <div class="briefing-objectives">
                ${scenario.objectives
                  .map(
                    (o, i) => `
                    <div class="brief-objective">
                      <span class="objective-number">${i + 1}</span>
                      <span><b>${escapeHtml(o.name)}</b><small>Held by the allies · must be taken</small></span>
                    </div>`,
                  )
                  .join('')}
              </div>
              <div class="briefing-limits">
                <div><span>Turns</span><b>${scenario.turnLimit}</b></div>
                <div><span>Victory</span><b>All objectives held</b></div>
                <div><span>Defeat</span><b>Army broken or time expired</b></div>
              </div>
              <div class="historical-note">
                <span class="eyebrow">Historical note</span>
                <p>${escapeHtml(scenario.history)}</p>
              </div>
            </div>
            <div class="briefing-hints">
              <h3>Notes from the staff</h3>
              <ul>${scenario.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
            </div>
          </section>

          <aside class="briefing-side">
            <div class="force-card france">
              <span class="eyebrow">Your command</span>
              <h3>${escapeHtml(scenario.command)}</h3>
              <div class="force-numbers"><b>${number.format(france.men)}</b><span>men · ${france.units} regiments</span></div>
              <p class="force-types">${escapeHtml(typeCounts(scenario, 'france'))}</p>
              <ul class="force-list">
                ${france.names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
              </ul>
            </div>
            <div class="force-card coalition">
              <span class="eyebrow">Against you</span>
              <h3>Allied Army</h3>
              <div class="force-numbers"><b>${number.format(allies.men)}</b><span>men · ${allies.units} regiments</span></div>
              <p class="force-types">${escapeHtml(typeCounts(scenario, 'coalition'))}</p>
              <ul class="force-list">
                ${allies.names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
              </ul>
            </div>
          </aside>
        </div>

        <footer class="briefing-foot">
          <p>Review the ground, then take command. The enemy is waiting.</p>
          <div class="briefing-actions">
            <button class="btn btn-ghost" data-nav="campaign">Withdraw</button>
            <button class="btn btn-primary btn-large" data-begin="${scenario.id}">Take Command</button>
          </div>
        </footer>
      </div>
    `;

    this.root.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.play('click');
        this.showCampaign();
      });
    });
    this.root.querySelector<HTMLElement>('[data-begin]')?.addEventListener('click', () => {
      audio.play('click');
      this.startBattle(scenario.id);
    });
  }

  private startBattle(scenarioId: string): void {
    this.clearBattle();
    this.root.innerHTML = '';
    this.resultShown = false;
    const container = document.createElement('div');
    container.className = 'battle-root';
    this.root.appendChild(container);
    this.battle = new BattleScreen(container, scenarioId, {
      onExit: () => this.showCampaign(),
      onManual: () => this.showManual(),
      onComplete: (summary, state) => this.finishBattle(summary, state),
    });
  }

  private finishBattle(summary: BattleResultSummary, state: BattleState): void {
    if (this.resultShown) return;
    this.resultShown = true;
    const record: BattleRecord = {
      victory: summary.winner === 'france',
      stars: summary.stars,
      turns: summary.turnsUsed,
      losses: summary.frenchLosses,
    };
    this.progress =
      summary.winner === 'france'
        ? recordVictory(this.progress, state.scenarioId, record)
        : recordDefeat(this.progress, state.scenarioId, record);
    saveProgress(this.progress);

    const scenario = getScenario(state.scenarioId);
    const index = SCENARIOS.findIndex((s) => s.id === state.scenarioId);
    const next = SCENARIOS[index + 1];
    const victory = summary.winner === 'france';
    const complete = victory && isCampaignComplete(this.progress);
    const byReason: Record<string, string> = {
      objectives: 'Every objective is in French hands.',
      annihilation: 'The allied army has ceased to exist as a fighting force.',
      time: victory ? 'The allies have quit the field.' : 'The sun has set on an unfinished attack.',
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay result-overlay';
    overlay.innerHTML = `
      <div class="result-panel ${victory ? 'victory' : 'defeat'}">
        <div class="result-ribbon"><span>${victory ? 'Victory' : 'Defeat'}</span></div>
        <div class="result-head">
          <span class="eyebrow">${escapeHtml(scenario.date)} · ${escapeHtml(scenario.place)}</span>
          <h1>${complete ? 'The Campaign Is Complete' : victory ? 'The Field Is Ours' : 'The Day Is Lost'}</h1>
          <p>${byReason[summary.reason] ?? ''}</p>
          ${victory ? `<div class="result-stars">${starsMarkup(summary.stars)}</div>` : ''}
        </div>
        <div class="result-stats">
          <div><span>French losses</span><b>${number.format(summary.frenchLosses)}</b></div>
          <div><span>Allied losses</span><b>${number.format(summary.alliedLosses)}</b></div>
          <div><span>Objectives</span><b>${summary.objectivesHeld} / ${summary.objectiveTotal}</b></div>
          <div><span>Turns</span><b>${summary.turnsUsed}</b></div>
        </div>
        <div class="result-account">
          <div><span>French remaining</span><b>${number.format(summary.frenchRemaining)} men</b></div>
          <div><span>Allied remaining</span><b>${number.format(summary.alliedRemaining)} men</b></div>
        </div>
        <p class="result-quote">${
          complete
            ? '“Soldiers, from the summit of these pyramids, forty centuries look down upon you.” The eagles have flown over three fields and Europe holds its breath.'
            : victory
              ? '“The battlefield is a scene of constant chaos. The winner will be the one who controls that chaos.”'
              : '“From the sublime to the ridiculous is but a step.” Re-form your battalions and try the field again.'
        }</p>
        <div class="result-actions">
          ${
            complete
              ? `<button class="btn btn-primary btn-large" data-result="campaign">Return to the Campaign</button>`
              : victory && next
                ? `<button class="btn btn-primary btn-large" data-result="next">Next Battle · ${escapeHtml(next.title)}</button>
                   <button class="btn btn-ghost" data-result="campaign">Campaign</button>`
                : `<button class="btn btn-primary btn-large" data-result="retry">${victory ? 'Refight the Battle' : 'Try the Battle Again'}</button>
                   <button class="btn btn-ghost" data-result="campaign">Campaign</button>`
          }
        </div>
      </div>
    `;
    this.root.appendChild(overlay);
    overlay.querySelectorAll<HTMLElement>('[data-result]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.play('click');
        const action = el.dataset.result;
        if (action === 'next' && next) {
          this.showBriefing(index + 1);
        } else if (action === 'retry') {
          this.startBattle(state.scenarioId);
        } else {
          this.showCampaign();
        }
      });
    });
  }

  private showManual(): void {
    const existing = this.root.querySelector('.modal-overlay.manual-overlay');
    if (existing) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay manual-overlay';
    overlay.innerHTML = `
      <div class="manual-panel">
        <header class="manual-head">
          <div>
            <span class="eyebrow">Field manual</span>
            <h2>The Art of Command</h2>
          </div>
          <button class="btn btn-ghost" data-close-manual>Close</button>
        </header>
        <div class="manual-columns">
          <section>
            <h3>The object of the day</h3>
            <p>You command the French army. Take <b>every objective</b> and hold them all at the end of a full turn. If the turn limit expires with an objective still in allied hands, or your army is broken, the field is lost.</p>

            <h3>Order of the turn</h3>
            <p>Select one of your regiments, trace a path to a highlighted hex, then fire or charge. Each regiment may attack or reform once per turn, but may spend its movement points in several steps until it acts.</p>

            <h3>Movement and ground</h3>
            <p>Woods, heights and fords cost extra movement. Open ground is quick but offers no cover. Leaving a hex adjacent to an enemy costs <b>+2 MP</b> — lines are sticky once engaged.</p>
            <p>The <b>Undo</b> button reverses your last order. It is cleared when you end the turn.</p>
          </section>
          <section>
            <h3>Fire and charge</h3>
            <p>Infantry fire at range; artillery can bombard at four hexes, but may not fire on a turn it moved. Cavalry cannot shoot and must charge adjacent enemies.</p>
            <p>Charging from three or more hexes away gives cavalry a powerful charge bonus. A charge into a formed <b>square</b> is shattered.</p>

            <h3>Formations</h3>
            <p><b>Line</b> is the best formation for volleys and steady defence. <b>Column</b> is built for the assault — stronger in melee, but vulnerable to cannon. <b>Square</b> is near-immune to cavalry but fires weakly and moves slowly. Reforming ends movement; you may still fire afterwards.</p>

            <h3>Morale and command</h3>
            <p>Regiments do not fight to the last man. Losses, flanking and heavy fire sap morale; at zero a regiment breaks and quits the field. A nearby commander steadies his troops. A commander may sound one <b>rally</b> per battle to restore morale to regiments within two hexes.</p>
          </section>
          <section>
            <h3>Ground at a glance</h3>
            <ul class="manual-terrain">
              <li><i class="terrain-swatch swatch-grass"></i><span><b>Open ground</b> — no cover, fastest going</span></li>
              <li><i class="terrain-swatch swatch-field"></i><span><b>Wheat field</b> — slight cover</span></li>
              <li><i class="terrain-swatch swatch-forest"></i><span><b>Wood</b> — good cover, slow, blocks guns</span></li>
              <li><i class="terrain-swatch swatch-hill"></i><span><b>Height</b> — cover and a commanding view</span></li>
              <li><i class="terrain-swatch swatch-village"></i><span><b>Village</b> — strongest cover; ideal for a garrison</span></li>
              <li><i class="terrain-swatch swatch-ford"></i><span><b>Ford</b> — the only crossing; a deadly choke point</span></li>
            </ul>

            <h3>Keyboard</h3>
            <p class="manual-keys"><kbd>Space</kbd> end turn · <kbd>U</kbd> undo · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> formation · <kbd>R</kbd> rally · <kbd>Esc</kbd> deselect · <kbd>M</kbd> mute</p>

            <h3>A word on honours</h3>
            <p>Win quickly and keep your army intact to earn all three stars. A costly victory is still a victory — but the Emperor is watching.</p>
          </section>
        </div>
        <footer class="manual-foot">
          <p>“In war, morale is to the material as three is to one.”</p>
          <button class="btn btn-primary" data-close-manual>To the Field</button>
        </footer>
      </div>
    `;
    this.root.appendChild(overlay);
    const close = (): void => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    overlay.querySelectorAll<HTMLElement>('[data-close-manual]').forEach((el) => el.addEventListener('click', close));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
  }
}
