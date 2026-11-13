import { chooseAiAction } from '../game/ai';
import { terrainAt } from '../game/combat';
import {
  attack,
  canAttack,
  changeFormation,
  checkImmediateEnd,
  createBattle,
  endPlayerTurn,
  findUnit,
  finishRound,
  forecast,
  moveAlongPath,
  objectivesHeld,
  rally,
  reachableHexes,
  refreshObjectives,
  summariseBattle,
  unitLabel,
  unitQuality,
} from '../game/game';
import { keyOf } from '../game/hex';
import { getScenario } from '../game/scenarios';
import type { BattleState, Formation, Nation, ReachableHex, Scenario, Unit } from '../game/types';
import { TERRAIN, UNIT_STATS, formationName } from '../game/units';
import { audio } from './audio';
import { BattleRenderer } from './render';
import type { BattleResultSummary } from '../game/game';

export interface BattleCallbacks {
  onExit: () => void;
  onManual: () => void;
  onComplete: (summary: BattleResultSummary, state: BattleState) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moraleWord(morale: number): string {
  if (morale >= 75) return 'Steady';
  if (morale >= 50) return 'Shaken';
  if (morale >= 25) return 'Wavering';
  return 'Breaking';
}

function nationWord(nation: Nation): string {
  return nation === 'france' ? 'French' : 'Allied';
}

export class BattleScreen {
  private root: HTMLElement;
  private state: BattleState;
  private scenario: Scenario;
  private callbacks: BattleCallbacks;
  private renderer!: BattleRenderer;
  private canvas!: HTMLCanvasElement;
  private resizeObserver!: ResizeObserver;
  private selectedId: string | null = null;
  private reachable = new Map<string, ReachableHex>();
  private attackable = new Set<string>();
  private hover: { q: number; r: number } | null = null;
  private busy = false;
  private finished = false;
  private undoStack: BattleState[] = [];
  private lastLogCount = 0;
  private listeners: Array<() => void> = [];

  constructor(root: HTMLElement, scenarioId: string, callbacks: BattleCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.scenario = getScenario(scenarioId);
    this.state = createBattle(scenarioId);
    this.mount();
  }

  destroy(): void {
    this.finished = true;
    this.resizeObserver?.disconnect();
    this.renderer?.destroy();
    for (const off of this.listeners) off();
    this.listeners = [];
    this.root.innerHTML = '';
  }

  private mount(): void {
    this.root.innerHTML = `
      <div class="battle-shell">
        <header class="battle-bar">
          <div class="battle-title">
            <button class="btn btn-ghost btn-back" data-act="exit">‹ Campaign</button>
            <div class="battle-heading">
              <h1>${escapeHtml(this.scenario.title)}</h1>
              <p>${escapeHtml(this.scenario.date)} · ${escapeHtml(this.scenario.place)}</p>
            </div>
          </div>
          <div class="turn-box">
            <span class="turn-label">Turn</span>
            <span class="turn-value" id="turn-value">1<small> / ${this.scenario.turnLimit}</small></span>
            <span class="phase-pill" id="phase-pill">Your command</span>
          </div>
          <div class="battle-actions">
            <button class="btn btn-ghost" data-act="undo" id="undo-btn" title="Undo last order (U)">Undo</button>
            <button class="btn btn-ghost" data-act="manual">Manual</button>
            <button class="btn btn-ghost" data-act="sound" id="sound-btn">Sound</button>
            <button class="btn btn-primary" data-act="end" id="end-btn">End Turn</button>
          </div>
        </header>

        <div class="battle-grid">
          <aside class="side-panel panel-left">
            <section class="panel-block">
              <div class="panel-heading">
                <h2 class="panel-title">Objectives</h2>
                <span class="panel-meta" id="objective-count"></span>
              </div>
              <div class="objective-list" id="objective-list"></div>
              <p class="panel-note">Hold every objective at the end of a turn to win the field.</p>
            </section>
            <section class="panel-block detail-block" id="detail-panel"></section>
          </aside>

          <section class="board" id="board">
            <div class="canvas-holder" id="canvas-holder">
              <canvas id="battle-canvas" aria-label="Battlefield hex map"></canvas>
            </div>
            <div class="order-plate" id="order-plate"></div>
            <div class="phase-veil" id="phase-veil" hidden>
              <div class="veil-card">
                <span class="veil-mark">⚜</span>
                <strong>The allies are moving</strong>
                <small>Orders are being carried across the field…</small>
              </div>
            </div>
          </section>

          <aside class="side-panel panel-right">
            <section class="panel-block log-panel">
              <div class="panel-heading">
                <h2 class="panel-title">Dispatches</h2>
                <span class="panel-meta">${escapeHtml(this.scenario.command)}</span>
              </div>
              <div class="log" id="log"></div>
            </section>
            <section class="panel-block notes-block">
              <h2 class="panel-title">Field notes</h2>
              <ul class="hint-list">
                ${this.scenario.hints.map((hint) => `<li>${escapeHtml(hint)}</li>`).join('')}
              </ul>
              <div class="terrain-key">
                <span><i class="terrain-swatch swatch-grass"></i>Open</span>
                <span><i class="terrain-swatch swatch-field"></i>Field</span>
                <span><i class="terrain-swatch swatch-forest"></i>Wood</span>
                <span><i class="terrain-swatch swatch-hill"></i>Height</span>
                <span><i class="terrain-swatch swatch-village"></i>Village</span>
                <span><i class="terrain-swatch swatch-ford"></i>Ford</span>
              </div>
            </section>
          </aside>
        </div>

        <footer class="battle-foot">
          <span><kbd>Space</kbd> end turn</span>
          <span><kbd>U</kbd> undo</span>
          <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> formation</span>
          <span><kbd>R</kbd> rally</span>
          <span><kbd>Esc</kbd> deselect</span>
          <span class="foot-note">Left-click a regiment, then a highlighted hex or an enemy.</span>
        </footer>
      </div>
    `;

    const canvas = this.root.querySelector<HTMLCanvasElement>('#battle-canvas');
    const holder = this.root.querySelector<HTMLElement>('#canvas-holder');
    if (!canvas || !holder) throw new Error('Battle canvas failed to mount');
    this.canvas = canvas;
    this.renderer = new BattleRenderer(canvas);
    this.renderer.setState(this.state);

    this.resizeObserver = new ResizeObserver(() => this.renderer.resize());
    this.resizeObserver.observe(holder);
    requestAnimationFrame(() => this.renderer.resize());

    this.bindEvents();
    this.refreshAll();
    this.updateSoundButton();
  }

  private on<K extends keyof WindowEventMap>(target: Window, type: K, handler: (event: WindowEventMap[K]) => void): void;
  private on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): void;
  private on(target: Window | HTMLElement, type: string, handler: (event: Event) => void): void {
    const bound = handler as EventListener;
    target.addEventListener(type, bound);
    this.listeners.push(() => target.removeEventListener(type, bound));
  }

  private bindEvents(): void {
    this.on(this.root, 'click', (event) => this.handleClick(event as MouseEvent));
    this.on(this.canvas, 'pointermove', (event) => this.handlePointerMove(event as PointerEvent));
    this.on(this.canvas, 'pointerleave', () => {
      this.hover = null;
      this.renderer.setView({ hover: null, path: null });
      this.updateOrderPlate();
    });
    this.on(this.canvas, 'contextmenu', (event) => {
      event.preventDefault();
      this.select(null);
    });
    this.on(window, 'keydown', (event) => this.handleKey(event as KeyboardEvent));
  }

  private handleKey(event: KeyboardEvent): void {
    if (document.querySelector('.modal-overlay')) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    switch (event.key.toLowerCase()) {
      case 'escape':
        this.select(null);
        break;
      case ' ':
      case 'enter':
        event.preventDefault();
        void this.endTurn();
        break;
      case 'u':
        this.undo();
        break;
      case 'r':
        this.rallySelected();
        break;
      case '1':
      case '2':
      case '3': {
        const formation: Formation = event.key === '1' ? 'line' : event.key === '2' ? 'column' : 'square';
        this.changeSelectedFormation(formation);
        break;
      }
      case 'm':
        this.toggleSound();
        break;
      default:
        break;
    }
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (action) {
      audio.play('click');
      switch (action) {
        case 'exit':
          this.callbacks.onExit();
          return;
        case 'manual':
          this.callbacks.onManual();
          return;
        case 'end':
          void this.endTurn();
          return;
        case 'undo':
          this.undo();
          return;
        case 'sound':
          this.toggleSound();
          return;
        default:
          break;
      }
    }

    const formationButton = target.closest<HTMLElement>('[data-formation]');
    if (formationButton?.dataset.formation) {
      this.changeSelectedFormation(formationButton.dataset.formation as Formation);
      return;
    }

    const rallyButton = target.closest<HTMLElement>('[data-rally]');
    if (rallyButton) {
      this.rallySelected();
      return;
    }

    const objectiveButton = target.closest<HTMLElement>('[data-objective]');
    if (objectiveButton?.dataset.objective) {
      const objective = this.state.objectives.find((o) => o.id === objectiveButton.dataset.objective);
      if (objective) {
        this.renderer.ping(objective.q, objective.r);
        const unit = this.state.units.find((u) => u.q === objective.q && u.r === objective.r);
        if (unit) this.select(unit.id);
      }
      return;
    }

    if (event.target === this.canvas) this.handleBoardClick(event);
  }

  private handleBoardClick(event: MouseEvent): void {
    if (this.busy || this.finished || this.state.phase !== 'player' || this.state.winner) return;
    const hex = this.renderer.hexAt(event.clientX, event.clientY);
    if (!hex) {
      this.select(null);
      return;
    }
    const clicked = this.state.units.find((u) => u.q === hex.q && u.r === hex.r);
    const selected = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;

    if (clicked) {
      if (clicked.nation === 'france') {
        this.select(this.selectedId === clicked.id ? null : clicked.id);
        return;
      }
      if (selected && selected.nation === 'france' && canAttack(this.state, selected, clicked)) {
        this.doAttack(selected, clicked);
        return;
      }
      this.select(clicked.id);
      return;
    }

    if (selected && selected.nation === 'france') {
      const reach = this.reachable.get(keyOf(hex.q, hex.r));
      if (reach && reach.path.length > 0) {
        this.doMove(selected, reach.path);
        return;
      }
    }
    this.select(null);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.busy || this.state.phase !== 'player') return;
    const hex = this.renderer.hexAt(event.clientX, event.clientY);
    const same = this.hover && hex && this.hover.q === hex.q && this.hover.r === hex.r;
    if (same || (!hex && !this.hover)) return;
    this.hover = hex;
    const selected = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;
    const reach = hex ? this.reachable.get(keyOf(hex.q, hex.r)) : undefined;
    this.renderer.setView({ hover: hex, path: selected && reach && reach.path.length > 0 ? reach.path : null });
    this.updateOrderPlate();
  }

  private select(unitId: string | null): void {
    this.selectedId = unitId;
    this.hover = null;
    this.refreshSelection();
    this.renderer.setView({ hover: null, path: null });
    this.renderDetail();
    this.updateOrderPlate();
  }

  private refreshSelection(): void {
    const selected = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;
    if (!selected) {
      this.selectedId = null;
      this.reachable = new Map();
      this.attackable = new Set();
    } else if (
      selected.nation === 'france' &&
      this.state.phase === 'player' &&
      !selected.acted &&
      !this.busy &&
      !this.state.winner
    ) {
      this.reachable = reachableHexes(this.state, selected);
      this.attackable = new Set(
        this.state.units
          .filter((u) => u.nation !== 'france' && canAttack(this.state, selected, u))
          .map((u) => u.id),
      );
    } else {
      this.reachable = new Map();
      this.attackable = new Set();
    }
    this.renderer.setView({
      selectedId: this.selectedId,
      reachable: this.reachable,
      attackable: this.attackable,
    });
  }

  private snapshot(): void {
    this.undoStack.push(structuredClone(this.state));
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  private undo(): void {
    if (this.busy || this.finished || this.state.phase !== 'player') return;
    const previous = this.undoStack.pop();
    if (!previous) return;
    audio.play('click');
    this.state = previous;
    this.renderer.setState(this.state);
    this.selectedId = null;
    this.refreshAll();
    this.renderer.setView({ selectedId: null, reachable: new Map(), attackable: new Set(), path: null, hover: null });
  }

  private doMove(unit: Unit, path: Array<{ q: number; r: number }>): void {
    this.snapshot();
    const from = { q: unit.q, r: unit.r };
    const moved = moveAlongPath(this.state, unit, path);
    if (!moved) {
      this.undoStack.pop();
      return;
    }
    audio.play('move');
    this.renderer.animateMove(unit.id, from, path);
    this.renderer.setView({ hover: null, path: null });
    this.hover = null;
    refreshObjectives(this.state);
    this.selectedId = unit.id;
    this.refreshAll();
    this.checkCompletion();
  }

  private doAttack(attacker: Unit, defender: Unit): void {
    this.snapshot();
    const outcome = attack(this.state, attacker, defender);
    if (!outcome) {
      this.undoStack.pop();
      return;
    }
    audio.play(
      outcome.result.mode === 'melee'
        ? 'charge'
        : attacker.type === 'artillery'
          ? 'cannon'
          : 'musket',
    );
    this.renderer.combatEffect(
      attacker,
      defender,
      outcome.result,
      outcome.result.mode,
      outcome.defenderDestroyed,
    );
    refreshObjectives(this.state);
    if (outcome.attackerDestroyed) this.selectedId = null;
    this.refreshAll();
    this.checkCompletion();
  }

  private checkCompletion(): void {
    if (this.finished) return;
    checkImmediateEnd(this.state);
    if (this.state.winner) this.completeBattle();
  }

  private completeBattle(): void {
    if (this.finished || this.state.winner === null) return;
    this.finished = true;
    this.busy = true;
    this.showVeil(false);
    const summary = summariseBattle(this.state);
    audio.play(summary.winner === 'france' ? 'victory' : 'defeat');
    this.refreshAll();
    setTimeout(() => this.callbacks.onComplete(summary, this.state), 900);
  }

  private changeSelectedFormation(formation: Formation): void {
    if (this.busy || this.finished || this.state.phase !== 'player') return;
    const unit = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;
    if (!unit || unit.nation !== 'france' || !['line', 'light', 'guard'].includes(unit.type)) return;
    if (unit.acted || unit.reformed || unit.formation === formation) return;
    this.snapshot();
    if (!changeFormation(this.state, unit, formation)) {
      this.undoStack.pop();
      return;
    }
    audio.play('click');
    this.renderer.ping(unit.q, unit.r, 'rgba(240, 205, 120, 0.9)');
    this.refreshAll();
  }

  private rallySelected(): void {
    if (this.busy || this.finished || this.state.phase !== 'player') return;
    const unit = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;
    if (!unit || unit.nation !== 'france' || unit.type !== 'commander') return;
    if (unit.acted || unit.rallyUsed) return;
    this.snapshot();
    const affected = rally(this.state, unit);
    audio.play('rally');
    this.renderer.rallyEffect(affected.length > 0 ? affected : [unit]);
    this.refreshAll();
  }

  private async endTurn(): Promise<void> {
    if (this.busy || this.finished || this.state.phase !== 'player') return;
    this.select(null);
    this.undoStack = [];
    this.busy = true;
    this.showVeil(true);
    endPlayerTurn(this.state);
    this.refreshAll();
    await sleep(420);

    let guard = 0;
    try {
      while (!this.finished && !this.state.winner && guard < 120) {
        guard++;
        const action = chooseAiAction(this.state, 'coalition');
        if (!action) break;
        await this.executeAiAction(action);
        if (this.finished) return;
        if (this.state.winner) break;
        await sleep(200);
      }
      if (this.finished) return;
      if (!this.state.winner) {
        finishRound(this.state);
        this.renderer.setView({ hover: null, path: null });
      }
    } finally {
      this.busy = false;
      this.showVeil(false);
      this.refreshAll();
      if (this.state.winner) this.completeBattle();
    }
  }

  private async executeAiAction(action: ReturnType<typeof chooseAiAction>): Promise<void> {
    if (!action) return;
    const unit = findUnit(this.state, action.unitId);
    if (!unit) return;
    const target = action.targetId ? findUnit(this.state, action.targetId) : undefined;
    const from = { q: unit.q, r: unit.r };

    if (action.rally) {
      const affected = rally(this.state, unit);
      audio.play('rally');
      this.renderer.rallyEffect(affected.length > 0 ? affected : [unit]);
    } else {
      if (action.formation) {
        changeFormation(this.state, unit, action.formation);
        this.renderer.ping(unit.q, unit.r, 'rgba(240, 235, 210, 0.65)');
      }
      if (action.path.length > 0) {
        const moved = moveAlongPath(this.state, unit, action.path);
        if (moved) {
          audio.play('move');
          this.renderer.animateMove(unit.id, from, action.path);
          refreshObjectives(this.state);
          this.refreshAll();
          await sleep(260);
        }
      }
      if (target && findUnit(this.state, unit.id) && findUnit(this.state, target.id) && canAttack(this.state, unit, target)) {
        const outcome = attack(this.state, unit, target);
        if (outcome) {
          audio.play(
            outcome.result.mode === 'melee'
              ? 'charge'
              : unit.type === 'artillery'
                ? 'cannon'
                : 'musket',
          );
          this.renderer.combatEffect(
            unit,
            target,
            outcome.result,
            outcome.result.mode,
            outcome.defenderDestroyed,
          );
          refreshObjectives(this.state);
        }
      }
    }

    if (findUnit(this.state, unit.id)) {
      unit.acted = true;
      unit.mp = 0;
    }
    this.refreshAll();
  }

  private showVeil(show: boolean): void {
    const veil = this.root.querySelector<HTMLElement>('#phase-veil');
    if (!veil) return;
    veil.hidden = !show;
    veil.classList.toggle('visible', show);
  }

  private toggleSound(): void {
    const muted = audio.toggle();
    this.updateSoundButton();
    const button = this.root.querySelector<HTMLElement>('#sound-btn');
    if (button) button.textContent = muted ? 'Muted' : 'Sound';
  }

  private updateSoundButton(): void {
    const button = this.root.querySelector<HTMLElement>('#sound-btn');
    if (button) button.textContent = audio.muted ? 'Muted' : 'Sound';
  }

  private refreshAll(): void {
    this.updateHeader();
    this.renderObjectives();
    this.renderDetail();
    this.renderLog();
    this.refreshSelection();
    this.updateOrderPlate();
  }

  private updateHeader(): void {
    const turnValue = this.root.querySelector<HTMLElement>('#turn-value');
    if (turnValue) turnValue.innerHTML = `${this.state.turn}<small> / ${this.state.maxTurns}</small>`;
    const pill = this.root.querySelector<HTMLElement>('#phase-pill');
    if (pill) {
      pill.textContent = this.state.winner
        ? this.state.winner === 'france'
          ? 'Field won'
          : 'Field lost'
        : this.state.phase === 'player'
          ? 'Your command'
          : 'Allied move';
      pill.className = `phase-pill ${this.state.winner ? 'over' : this.state.phase}`;
    }
    const end = this.root.querySelector<HTMLButtonElement>('#end-btn');
    if (end) {
      end.disabled = this.busy || this.state.phase !== 'player' || !!this.state.winner;
      end.textContent = this.state.phase === 'enemy' ? 'Allied Move…' : 'End Turn';
    }
    const undo = this.root.querySelector<HTMLButtonElement>('#undo-btn');
    if (undo) undo.disabled = this.busy || this.undoStack.length === 0 || this.state.phase !== 'player' || !!this.state.winner;
  }

  private renderObjectives(): void {
    const list = this.root.querySelector<HTMLElement>('#objective-list');
    const count = this.root.querySelector<HTMLElement>('#objective-count');
    if (!list) return;
    if (count) count.textContent = `${objectivesHeld(this.state, 'france')} of ${this.state.objectives.length} held`;
    list.innerHTML = this.state.objectives
      .map((objective) => {
        const holder = this.state.units.find((u) => u.q === objective.q && u.r === objective.r);
        const status = holder
          ? holder.nation === objective.owner
            ? 'Garrisoned'
            : 'Contested'
          : objective.owner === 'france'
            ? 'In French hands'
            : objective.owner === 'coalition'
              ? 'In allied hands'
              : 'Unoccupied';
        const ownerClass = objective.owner ?? 'neutral';
        return `
          <button class="objective-row ${ownerClass}" data-objective="${objective.id}" type="button">
            <span class="obj-flag ${ownerClass}"></span>
            <span class="obj-copy">
              <strong>${escapeHtml(objective.name)}</strong>
              <small>${status}</small>
            </span>
            <span class="obj-mark">⌖</span>
          </button>
        `;
      })
      .join('');
  }

  private renderDetail(): void {
    const panel = this.root.querySelector<HTMLElement>('#detail-panel');
    if (!panel) return;
    const unit = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;
    if (!unit) {
      panel.innerHTML = `
        <div class="detail-hero">
          <span class="eyebrow">Your command</span>
          <h3>${escapeHtml(this.scenario.command)}</h3>
          <p>${escapeHtml(this.scenario.subtitle)}</p>
        </div>
        <div class="detail-line"><span>Turns remaining</span><b>${Math.max(0, this.state.maxTurns - this.state.turn + 1)}</b></div>
        <div class="detail-line"><span>Objectives held</span><b>${objectivesHeld(this.state, 'france')} / ${this.state.objectives.length}</b></div>
        <p class="panel-note">Select a regiment on the field to issue orders. Hover an enemy to read the odds before you strike.</p>
      `;
      return;
    }

    const stats = UNIT_STATS[unit.type];
    const isPlayer = unit.nation === 'france';
    const strengthPct = Math.round((unit.strength / unit.maxStrength) * 100);
    const moralePct = Math.round(unit.morale);
    const canReform = isPlayer && ['line', 'light', 'guard'].includes(unit.type);
    const formationLocked = !canReform || unit.acted || unit.reformed || this.busy || this.state.phase !== 'player' || !!this.state.winner;
    const canRally =
      isPlayer &&
      unit.type === 'commander' &&
      !unit.acted &&
      !unit.rallyUsed &&
      this.state.phase === 'player' &&
      !this.busy &&
      !this.state.winner;
    const terrain = TERRAIN[terrainAt(this.state, unit.q, unit.r)];

    panel.innerHTML = `
      <div class="unit-head">
        <span class="nation-stripe ${unit.nation}"></span>
        <div>
          <span class="eyebrow">${nationWord(unit.nation)} · ${escapeHtml(stats.label)}</span>
          <h3>${escapeHtml(unit.name)}</h3>
          <p class="unit-quality">${stats.icon === 'commander' ? 'Commanding officer' : `${unitQuality(unit)} · ${stats.range > 0 ? `range ${stats.range}` : 'shock troops'}`}</p>
        </div>
      </div>
      <div class="meter-row">
        <span class="meter-label">Men</span>
        <div class="meter"><i class="meter-fill men" style="width:${strengthPct}%"></i></div>
        <b>${Math.round(unit.strength)}</b>
      </div>
      <div class="meter-row">
        <span class="meter-label">Morale</span>
        <div class="meter"><i class="meter-fill morale ${moralePct < 35 ? 'low' : moralePct < 60 ? 'mid' : ''}" style="width:${moralePct}%"></i></div>
        <b>${moralePct}</b>
      </div>
      <div class="unit-meta-grid">
        <div><span>Quality</span><b>${unit.quality} / 5</b></div>
        <div><span>Movement</span><b>${unit.mp} MP</b></div>
        <div><span>Morale</span><b>${moraleWord(unit.morale)}</b></div>
        <div><span>Ground</span><b>${terrain.label}</b></div>
      </div>
      <p class="terrain-note">${escapeHtml(terrain.description)}</p>
      ${unit.type === 'commander' ? `<p class="terrain-note">Commanders inspire nearby regiments (+7% attack and defence) and can sound one rally per battle.</p>` : ''}
      ${
        canReform
          ? `<div class="formation-control">
              <span class="control-label">Formation</span>
              <div class="segmented">
                ${(['line', 'column', 'square'] as Formation[])
                  .map(
                    (f) => `<button type="button" data-formation="${f}" class="${unit.formation === f ? 'active' : ''}" ${formationLocked ? 'disabled' : ''} title="${formationTip(f)}">
                      ${formationName(f)}
                    </button>`,
                  )
                  .join('')}
              </div>
              <small class="control-note">${unit.reformed ? 'Reformed this turn.' : unit.acted ? 'Orders complete this turn.' : 'Reforming ends movement; you may still fire.'}</small>
            </div>`
          : ''
      }
      ${
        canRally
          ? `<button type="button" class="btn btn-rally" data-rally="1">Sound the Rally <span>+18 morale</span></button>`
          : unit.type === 'commander'
            ? `<p class="control-note">${unit.rallyUsed ? 'The rally has already been sounded.' : unit.acted ? 'Orders complete this turn.' : ''}</p>`
            : ''
      }
      <div class="unit-state ${unit.acted ? 'done' : ''}">${unit.acted ? 'Orders complete' : isPlayer ? 'Awaiting orders' : 'Allied regiment'}</div>
    `;
  }

  private renderLog(): void {
    const log = this.root.querySelector<HTMLElement>('#log');
    if (!log) return;
    if (this.state.log.length !== this.lastLogCount) {
      this.lastLogCount = this.state.log.length;
      log.innerHTML = this.state.log
        .slice(-60)
        .map(
          (entry) => `
          <div class="log-entry ${entry.kind}">
            <span class="log-turn">T${entry.turn}</span>
            <p>${escapeHtml(entry.text)}</p>
          </div>`,
        )
        .join('');
      log.scrollTop = log.scrollHeight;
    }
  }

  private updateOrderPlate(): void {
    const plate = this.root.querySelector<HTMLElement>('#order-plate');
    if (!plate) return;
    const selected = this.selectedId ? findUnit(this.state, this.selectedId) : undefined;

    if (this.state.winner) {
      plate.innerHTML = `<span class="plate-kicker">Battle concluded</span><p>${this.state.winner === 'france' ? 'The field is ours.' : 'The day is lost.'}</p>`;
      return;
    }
    if (this.busy || this.state.phase === 'enemy') {
      plate.innerHTML = `<span class="plate-kicker">Allied move</span><p>Enemy orders are being executed.</p>`;
      return;
    }

    const hoverUnit = this.hover ? this.state.units.find((u) => u.q === this.hover?.q && u.r === this.hover?.r) : undefined;

    if (selected && hoverUnit && hoverUnit.nation !== selected.nation) {
      const odds = forecast(this.state, selected, hoverUnit);
      if (odds) {
        const charge = odds.mode === 'melee';
        const warning =
          selected.type === 'cavalry' && hoverUnit.formation === 'square'
            ? '<span class="plate-warning">Square — the charge will break on their bayonets.</span>'
            : '';
        plate.innerHTML = `
          <span class="plate-kicker">${charge ? 'Charge' : 'Fire'} · ${escapeHtml(hoverUnit.name)}</span>
          <div class="plate-forecast">
            <span>Enemy loss</span><b>~${odds.damage} men</b>
            <span>Morale</span><b>−${odds.moraleLoss}</b>
            ${charge ? `<span>Our loss</span><b>~${odds.selfDamage} men</b>` : ''}
          </div>
          ${warning}
          <p class="plate-hint">Click the enemy to ${charge ? 'charge' : 'open fire'}.</p>
        `;
        return;
      }
      plate.innerHTML = `<span class="plate-kicker">No shot</span><p>${escapeHtml(hoverUnit.name)} is out of range or cannot be engaged from here.</p>`;
      return;
    }

    if (selected && this.hover) {
      const reach = this.reachable.get(keyOf(this.hover.q, this.hover.r));
      if (reach && reach.path.length > 0) {
        const terrain = TERRAIN[terrainAt(this.state, this.hover.q, this.hover.r)];
        plate.innerHTML = `
          <span class="plate-kicker">March · ${terrain.label}</span>
          <p>${reach.cost} MP · ${Math.max(0, selected.mp - reach.cost)} MP remaining</p>
          <p class="plate-hint">Click to move. ${terrain.cover > 1.1 ? `Cover ${Math.round((terrain.cover - 1) * 100)}%.` : ''}</p>
        `;
        return;
      }
    }

    if (hoverUnit) {
      plate.innerHTML = `
        <span class="plate-kicker">${nationWord(hoverUnit.nation)} · ${UNIT_STATS[hoverUnit.type].label}</span>
        <p>${escapeHtml(hoverUnit.name)} — ${Math.round(hoverUnit.strength)} men, morale ${Math.round(hoverUnit.morale)} (${moraleWord(hoverUnit.morale)}).</p>
      `;
      return;
    }

    if (selected) {
      plate.innerHTML = `<span class="plate-kicker">${escapeHtml(selected.name)}</span><p>${unitLabel(selected)} · ${selected.mp} MP · ${moraleWord(selected.morale)}</p><p class="plate-hint">Choose a highlighted hex or an enemy in range.</p>`;
      return;
    }

    if (this.hover) {
      const terrain = TERRAIN[terrainAt(this.state, this.hover.q, this.hover.r)];
      plate.innerHTML = `<span class="plate-kicker">${terrain.label}</span><p>${escapeHtml(terrain.description)}</p>`;
      return;
    }

    plate.innerHTML = `<span class="plate-kicker">Awaiting orders</span><p>Select one of your regiments, then move or engage.</p>`;
  }
}

function formationTip(formation: Formation): string {
  if (formation === 'line') return 'Line: volleys and steady defence.';
  if (formation === 'column') return 'Column: melee bonus, but vulnerable to cannon.';
  return 'Square: nearly immune to cavalry, feeble fire and slow movement.';
}
