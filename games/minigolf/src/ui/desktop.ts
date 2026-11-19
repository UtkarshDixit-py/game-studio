import type { Player, PlayerResult } from '../logic/match';
import type { GameLike, UiHost } from '@studio/ui/dom';
import { statusLabel } from './compact';
import titleHeroUrl from '../assets/pd/brand/title-hero.svg?url';
import logoMarkUrl from '../assets/pd/brand/logo-mark.svg?url';
import wordmarkUrl from '../assets/pd/brand/wordmark@2x.png';
import ballYouUrl from '../assets/pd/sprites/ball-you.svg?url';
import ballBotUrl from '../assets/pd/sprites/ball-bot.svg?url';
import iconPlayUrl from '../assets/pd/icons/play.svg?url';
import iconSoundOnUrl from '../assets/pd/icons/sound-on.svg?url';
import iconSoundOffUrl from '../assets/pd/icons/sound-off.svg?url';
import iconTrophyUrl from '../assets/pd/icons/trophy.svg?url';
import iconPlaceUrl from '../assets/pd/icons/place.svg?url';
import iconDragBackUrl from '../assets/pd/icons/drag-back.svg?url';
import iconWaitUrl from '../assets/pd/icons/wait.svg?url';
import iconRollingUrl from '../assets/pd/icons/rolling.svg?url';
import iconReloadUrl from '../assets/pd/icons/reload.svg?url';
import resultWinUrl from '../assets/pd/art/result-win.svg?url';
import resultLossUrl from '../assets/pd/art/result-loss.svg?url';
import resultDrawUrl from '../assets/pd/art/result-draw.svg?url';
import holeCompleteUrl from '../assets/pd/art/hole-complete.svg?url';

export interface DesktopPlayModel {
  holeIndex: number;
  courseName: string;
  cap: number;
  points: [number, number];
  shots: [number, number];
  results: [PlayerResult, PlayerResult];
  activePlayer: Player;
  phase: 'placing' | 'aiming' | 'rolling' | 'holeOver' | 'matchOver';
  power: number | null;
}

export interface DesktopHoleRow {
  player: Player;
  line: string;
  award: number;
}

export interface DesktopTitleModel {
  record: string;
  resumableHole: number | null;
}

export interface DesktopSlots {
  sound: HTMLElement;
  play?: HTMLElement;
  continue?: HTMLElement;
}

export interface DesktopDialogContent {
  art: HTMLElement;
  content?: HTMLElement;
}

interface CardRefs {
  root: HTMLElement;
  points: HTMLElement;
  status: HTMLElement;
  pill: HTMLElement;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const image = (url: string, className: string, alt = ''): HTMLImageElement => {
  const img = el('img', className);
  img.src = url;
  img.alt = alt;
  return img;
};

const isDesktopViewport = (): boolean => {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return width >= 1024 && height >= 640 && width > height;
};

/** Putt Duel only: centered tabletop desktop composition. */
export class PuttDuelDesktop {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly play: HTMLElement;
  readonly titleSlots: DesktopSlots;
  readonly playSlots: DesktopSlots;
  private readonly host: UiHost;
  private readonly app: HTMLElement;
  private readonly canvasFrame: HTMLElement;
  private readonly board: HTMLElement;
  private readonly holeLabel: HTMLElement;
  private readonly pips: HTMLElement;
  private readonly holeName: HTMLElement;
  private readonly capChip: HTMLElement;
  private readonly cards: [CardRefs, CardRefs];
  private readonly placard: HTMLElement;
  private readonly placardIcon: HTMLImageElement;
  private readonly placardText: HTMLElement;
  private readonly power: HTMLElement;
  private readonly record: HTMLElement;
  private readonly continueSlot: HTMLElement;
  private readonly modeListeners = new Set<(active: boolean) => void>();
  private readonly layoutListeners = new Set<() => void>();
  private game: GameLike | null = null;
  private activeValue = false;
  private currentView: 'title' | 'play' | null = null;
  private resizeFrame: number | null = null;
  private readonly onResize = (): void => {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.applyActive();
      this.layout();
    });
  };

  constructor(host: UiHost) {
    this.host = host;
    this.app = document.getElementById('app') as HTMLElement;
    this.root = el('div', 'pd-root');
    this.root.hidden = true;

    this.title = el('section', 'pd-view pd-title');
    this.title.hidden = true;
    const hero = el('div', 'pd-hero');
    hero.append(image(titleHeroUrl, 'pd-hero-art', 'Putt Duel tabletop diorama'));
    const copy = el('div', 'pd-title-copy');
    const brand = el('div', 'pd-brand');
    brand.append(image(logoMarkUrl, 'pd-mark', ''));
    const wordmark = el('h1', 'pd-wordmark');
    wordmark.append(image(wordmarkUrl, '', 'Putt Duel'));
    brand.append(wordmark);
    this.record = el('span', 'pd-record');
    this.record.append(image(iconTrophyUrl, 'pd-record-icon', ''));
    const recordText = el('span', 'pd-record-text');
    this.record.append(recordText);
    const actions = el('div', 'pd-title-actions');
    const playSlot = el('div', 'pd-slot');
    playSlot.dataset.slot = 'play';
    this.continueSlot = el('div', 'pd-slot');
    this.continueSlot.dataset.slot = 'continue';
    actions.append(playSlot, this.continueSlot);
    copy.append(
      brand,
      el('p', 'pd-tagline', 'You vs the bot · 3 holes'),
      this.record,
      actions,
      el('p', 'pd-foot', 'Mouse or touch · drag back to putt'),
    );
    const titleSound = el('div', 'pd-title-sound');
    titleSound.dataset.slot = 'sound';
    this.title.append(hero, copy, titleSound);
    this.titleSlots = { sound: titleSound, play: playSlot, continue: this.continueSlot };
    this.recordText = recordText;

    this.play = el('section', 'pd-view pd-play');
    this.play.hidden = true;
    const card0 = this.makeCard(0, 'YOU', ballYouUrl);
    const card1 = this.makeCard(1, 'BOT', ballBotUrl);
    this.cards = [card0, card1];
    const center = el('section', 'pd-center');
    const header = el('header', 'pd-header');
    const holeid = el('div', 'pd-holeid');
    const eyebrow = el('span', 'pd-eyebrow');
    this.holeLabel = el('span', 'pd-hole-label');
    this.pips = el('span', 'pd-pips');
    eyebrow.append(this.holeLabel, this.pips);
    this.holeName = el('span', 'pd-holename');
    holeid.append(eyebrow, this.holeName);
    const tools = el('div', 'pd-tools');
    this.capChip = el('span', 'pd-chip');
    const soundSlot = el('span', 'pd-sound');
    soundSlot.dataset.slot = 'sound';
    tools.append(this.capChip, soundSlot);
    header.append(holeid, tools);
    this.board = el('div', 'pd-board');
    this.canvasFrame = el('div', 'pd-canvas-frame');
    this.canvasFrame.id = 'pd-canvas-frame';
    this.board.append(this.canvasFrame);
    this.placard = el('div', 'pd-placard');
    const iconWrap = el('span', 'pd-placard-icon');
    this.placardIcon = image(iconPlaceUrl, '', '');
    iconWrap.append(this.placardIcon);
    this.placardText = el('span', 'pd-placard-text');
    this.power = el('span', 'pd-power');
    this.power.hidden = true;
    this.placard.append(iconWrap, this.placardText, this.power);
    center.append(header, this.board, this.placard);
    this.play.append(card0.root, center, card1.root);
    this.playSlots = { sound: soundSlot };

    this.root.append(this.title, this.play);
    this.host.stage.append(this.root);
    this.installIconVariables();
    this.root.style.setProperty('--pd-icon-sound-on', `url(${iconSoundOnUrl})`);
    this.root.style.setProperty('--pd-icon-sound-off', `url(${iconSoundOffUrl})`);
    this.root.style.setProperty('--pd-icon-play', `url(${iconPlayUrl})`);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.applyActive();
    this.layout();
  }

  get active(): boolean {
    return this.activeValue;
  }

  attachGame(game: GameLike): void {
    this.game = game;
    if (this.activeValue && this.currentView === 'play') this.refreshGame();
  }

  onModeChange(listener: (active: boolean) => void): () => void {
    this.modeListeners.add(listener);
    return () => this.modeListeners.delete(listener);
  }

  onLayout(listener: () => void): () => void {
    this.layoutListeners.add(listener);
    return () => this.layoutListeners.delete(listener);
  }

  showTitle(model: DesktopTitleModel): void {
    this.currentView = 'title';
    if (this.activeValue) this.root.hidden = false;
    this.title.hidden = false;
    this.play.hidden = true;
    this.recordText.textContent = model.record;
    this.continueSlot.hidden = model.resumableHole === null;
    if (this.activeValue) this.showAppInFrame();
  }

  showPlay(): void {
    this.currentView = 'play';
    if (this.activeValue) this.root.hidden = false;
    this.title.hidden = true;
    this.play.hidden = false;
    if (this.activeValue) {
      this.showAppInFrame();
      this.refreshGame();
      requestAnimationFrame(() => this.refreshGame());
    }
  }

  updatePlay(model: DesktopPlayModel): void {
    this.holeLabel.textContent = `HOLE ${model.holeIndex + 1}`;
    this.pips.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const pip = el('span', 'pd-pip');
      if (i < model.holeIndex) pip.classList.add('done');
      else if (i === model.holeIndex) pip.classList.add('now');
      this.pips.append(pip);
    }
    this.holeName.textContent = model.courseName;
    this.capChip.textContent = `MAX SHOTS ${model.cap}`;
    for (const player of [0, 1] as const) {
      const card = this.cards[player];
      const active = (model.phase === 'placing' || model.phase === 'aiming' || model.phase === 'rolling') && model.activePlayer === player;
      card.points.textContent = String(model.points[player]);
      card.status.textContent = statusLabel(model.results[player], model.shots[player]);
      card.root.dataset.active = active ? 'true' : 'false';
      card.pill.hidden = !active;
      card.pill.className = 'pd-pill turn';
      card.pill.textContent = 'TURN';
      if (model.results[player] === 'holed') {
        card.pill.hidden = false;
        card.pill.className = 'pd-pill holed';
        card.pill.textContent = 'HOLED';
      } else if (model.results[player] === 'out') {
        card.pill.hidden = false;
        card.pill.className = 'pd-pill out';
        card.pill.textContent = 'OUT';
      }
    }

    let kind: 'place' | 'aim' | 'wait' = 'wait';
    let text = '';
    if (model.phase === 'placing' && model.activePlayer === 0) {
      kind = 'place';
      text = 'Click the checkered start zone to place your ball';
    } else if (model.phase === 'aiming' && model.activePlayer === 0) {
      kind = 'aim';
      text = 'Drag back from the board and release anywhere';
    } else if (model.phase === 'rolling') {
      text = 'Rolling…';
    } else if (model.activePlayer === 1 && (model.phase === 'placing' || model.phase === 'aiming')) {
      text = 'The bot is taking its turn…';
    } else if (model.phase === 'holeOver') {
      text = 'Hole complete.';
    } else if (model.phase === 'matchOver') {
      text = 'Match complete.';
    }
    this.placard.className = `pd-placard ${kind}`;
    this.placardIcon.src =
      kind === 'place' ? iconPlaceUrl : kind === 'aim' ? iconDragBackUrl : model.phase === 'rolling' ? iconRollingUrl : iconWaitUrl;
    this.placardText.textContent = text;
    if (model.phase === 'aiming' && model.activePlayer === 0 && model.power !== null) {
      this.power.hidden = false;
      this.power.textContent = `${Math.round(model.power * 100)}%`;
    } else {
      this.power.hidden = true;
      this.power.textContent = '';
    }
  }

  holeCompleteContent(holeIndex: number, courseName: string, rows: DesktopHoleRow[]): DesktopDialogContent {
    const art = el('div', 'pd-dialog-art hole');
    art.append(image(holeCompleteUrl, '', ''));
    const content = el('div', 'pd-dialog-rows');
    for (const row of rows) {
      const line = el('div', 'pd-dialog-row');
      line.append(
        image(row.player === 0 ? ballYouUrl : ballBotUrl, '', ''),
        el('span', 'nm', row.player === 0 ? 'YOU' : 'BOT'),
        el('span', 'ln', row.line),
        el('span', 'aw', `+${row.award}`),
      );
      content.append(line);
    }
    return { art, content };
  }

  resultContent(winner: Player | 'draw'): DesktopDialogContent {
    const art = el('div', 'pd-dialog-art');
    art.append(image(winner === 0 ? resultWinUrl : winner === 1 ? resultLossUrl : resultDrawUrl, '', ''));
    return { art };
  }

  layout(): void {
    const width = window.visualViewport?.width ?? window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const card = width < 1200 ? 208 : width >= 1800 ? 264 : 232;
    const gap = width < 1200 ? 24 : 32;
    const pad = height < 800 ? 24 : 32;
    const sW = (Math.min(width, 1480) - 2 * pad - 2 * card - 2 * gap) / 424;
    const sAt = (placard: number): number =>
      Math.max(0.75, Math.min(1.5, (height - (2 * pad + 44 + 12 + 12 + placard)) / 584, sW));
    let s = sAt(52);
    let placard = 52;
    if (424 * s < 470) {
      s = sAt(76);
      placard = 76;
    }
    const style = this.root.style;
    style.setProperty('--pd-s', s.toFixed(4));
    style.setProperty('--pd-card', `${card}px`);
    style.setProperty('--pd-gap', `${gap}px`);
    style.setProperty('--pd-pad', `${pad}px`);
    style.setProperty('--pd-placard', placard === 76 ? '66px' : '52px');
    this.root.dataset.s = s.toFixed(3);
    this.layoutListeners.forEach((listener) => listener());
    if (this.activeValue && this.currentView === 'play') {
      this.refreshGame();
      requestAnimationFrame(() => this.refreshGame());
    }
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.host.stage.appendChild(this.app);
    document.body.classList.remove('pd-desktop');
    this.root.remove();
    this.modeListeners.clear();
    this.layoutListeners.clear();
  }

  private recordText!: HTMLElement;

  private makeCard(player: 0 | 1, name: string, ballUrl: string): CardRefs {
    const root = el('article', 'pd-card');
    root.dataset.player = String(player);
    const who = el('div', 'pd-who');
    who.append(image(ballUrl, '', ''), el('span', '', name));
    const points = el('span', 'pd-num');
    const pts = el('div', 'pd-pts');
    pts.append(points, el('span', 'pd-unit', 'points'));
    const status = el('span', 'pd-shots', 'SHOT 0');
    const pill = el('span', 'pd-pill turn', 'TURN');
    pill.hidden = true;
    const prow = el('div', 'pd-prow');
    prow.append(status, pill);
    root.append(who, pts, prow);
    return { root, points, status, pill };
  }

  private installIconVariables(): void {
    // Dialogs sit on the shared host overlay outside .pd-root, so the icon
    // variables must live on the host to reach both the tabletop and dialogs.
    // The dialog overlay is a sibling of the host under <body>, so both get
    // the variables; everything else inherits from one of them.
    for (const style of [this.host.host.style, document.body.style]) {
      style.setProperty('--pd-icon-sound-on', `url(${iconSoundOnUrl})`);
      style.setProperty('--pd-icon-sound-off', `url(${iconSoundOffUrl})`);
      style.setProperty('--pd-icon-play', `url(${iconPlayUrl})`);
      style.setProperty('--pd-icon-reload', `url(${iconReloadUrl})`);
    }
  }

  private applyActive(): void {
    const next = isDesktopViewport();
    if (next === this.activeValue) return;
    this.activeValue = next;
    document.body.classList.toggle('pd-desktop', next);
    this.host.host.classList.toggle('pd-desktop', next);
    if (next) {
      this.root.hidden = this.currentView === null;
      if (this.currentView === null) {
        this.title.hidden = false;
        this.play.hidden = true;
        this.currentView = 'title';
      }
      if (this.currentView === 'play') this.showAppInFrame();
    } else {
      this.root.hidden = true;
      this.title.hidden = true;
      this.play.hidden = true;
      this.currentView = null;
      this.host.stage.appendChild(this.app);
      this.app.style.removeProperty('display');
    }
    this.modeListeners.forEach((listener) => listener(next));
    requestAnimationFrame(() => this.refreshGame());
  }

  private showAppInFrame(): void {
    if (this.app.parentElement !== this.canvasFrame) this.canvasFrame.append(this.app);
    this.app.style.removeProperty('display');
  }

  private refreshGame(): void {
    // Also runs when desktop mode turns off: #app has just moved back to the
    // fallback stage, so Phaser must re-measure instead of keeping the crop size.
    if (!this.game) return;
    this.game.scale.refresh();
  }
}

let current: PuttDuelDesktop | null = null;

export const createPuttDuelDesktop = (host: UiHost): PuttDuelDesktop => {
  current?.destroy();
  current = new PuttDuelDesktop(host);
  return current;
};

export const getPuttDuelDesktop = (): PuttDuelDesktop | null => current;
