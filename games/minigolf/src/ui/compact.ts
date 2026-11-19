import type { PlayerResult } from '../logic/match';

/** Compact Title panel: text plus slots the action layer fills. */
export interface TitleCompactRefs {
  root: HTMLElement;
  soundSlot: HTMLElement;
  playSlot: HTMLElement;
  continueSlot: HTMLElement;
  record: HTMLElement;
}

export const buildTitleCompact = (
  parent: HTMLElement,
  options: { record: string; resumableHole: number | null },
): TitleCompactRefs => {
  const root = document.createElement('div');
  root.className = 'ui-title-panel';
  const top = document.createElement('div');
  top.className = 'ui-top-row';
  const title = document.createElement('h1');
  title.className = 'ui-title';
  title.textContent = 'Putt Duel';
  const soundSlot = document.createElement('div');
  soundSlot.className = 'ui-slot';
  soundSlot.dataset.slot = 'sound';
  top.append(title, soundSlot);
  const subtitle = document.createElement('p');
  subtitle.className = 'ui-subtitle';
  subtitle.textContent = 'You vs the bot · 3 holes';
  const record = document.createElement('p');
  record.className = 'ui-caption';
  record.textContent = options.record;
  const actions = document.createElement('div');
  actions.className = 'ui-stack ui-title-actions';
  const playSlot = document.createElement('div');
  playSlot.className = 'ui-slot';
  playSlot.dataset.slot = 'play';
  const continueSlot = document.createElement('div');
  continueSlot.className = 'ui-slot';
  continueSlot.dataset.slot = 'continue';
  continueSlot.hidden = options.resumableHole === null;
  actions.append(playSlot, continueSlot);
  root.append(top, subtitle, record, actions);
  parent.replaceChildren(root);
  return { root, soundSlot, playSlot, continueSlot, record };
};

export interface CompactScoreCard {
  root: HTMLElement;
  name: HTMLElement;
  points: HTMLElement;
  status: HTMLElement;
  turn: HTMLElement;
}

export interface PlayCompactRefs {
  root: HTMLElement;
  holeLine: HTMLElement;
  cards: [CompactScoreCard, CompactScoreCard];
  soundSlot: HTMLElement;
  status: HTMLElement;
  rotate: HTMLElement;
}

const makeScoreCard = (name: string): CompactScoreCard => {
  const root = document.createElement('article');
  root.className = 'ui-score-card';
  const top = document.createElement('div');
  top.className = 'ui-score-row';
  const nameEl = document.createElement('span');
  nameEl.className = 'ui-score-name';
  nameEl.textContent = name;
  const points = document.createElement('span');
  points.className = 'ui-score-points';
  points.textContent = '0';
  top.append(nameEl, points);
  const bottom = document.createElement('div');
  bottom.className = 'ui-score-row';
  const status = document.createElement('span');
  status.className = 'ui-score-status';
  status.textContent = 'SHOT 0';
  const turn = document.createElement('span');
  turn.className = 'ui-score-turn';
  turn.textContent = 'TURN';
  turn.hidden = true;
  bottom.append(status, turn);
  root.append(top, bottom);
  return { root, name: nameEl, points, status, turn };
};

export const buildPlayCompact = (parent: HTMLElement): PlayCompactRefs => {
  const root = document.createElement('div');
  root.className = 'ui-play-panel';
  const holeLine = document.createElement('p');
  holeLine.className = 'ui-caption';
  const card0 = makeScoreCard('YOU');
  const card1 = makeScoreCard('BOT');
  const soundSlot = document.createElement('div');
  soundSlot.className = 'ui-slot';
  soundSlot.dataset.slot = 'sound';
  const status = document.createElement('p');
  status.className = 'ui-body ui-play-status';
  const rotate = document.createElement('p');
  rotate.className = 'ui-caption ui-rotate';
  rotate.textContent = 'Rotate for a larger course';
  root.append(holeLine, card0.root, card1.root, soundSlot, status, rotate);
  parent.replaceChildren(root);
  return { root, holeLine, cards: [card0, card1], soundSlot, status, rotate };
};

export interface CompactCardModel {
  points: number;
  status: string;
  active: boolean;
}

export interface CompactPlayModel {
  holeLine: string;
  cards: [CompactCardModel, CompactCardModel];
  status: string;
}

export const updatePlayCompact = (refs: PlayCompactRefs, model: CompactPlayModel): void => {
  refs.holeLine.textContent = model.holeLine;
  for (let i = 0; i < 2; i++) {
    const card = refs.cards[i]!;
    const data = model.cards[i]!;
    card.points.textContent = String(data.points);
    card.status.textContent = data.status;
    card.turn.hidden = !data.active;
    card.root.dataset.active = data.active ? 'true' : 'false';
  }
  refs.status.textContent = model.status;
};

/** HUD status text shared by the canvas cards and the compact panel. */
export const statusLabel = (result: PlayerResult, shots: number): string => {
  if (result === 'holed') return '✓ HOLED';
  if (result === 'out') return '— OUT';
  return `SHOT ${shots}`;
};
