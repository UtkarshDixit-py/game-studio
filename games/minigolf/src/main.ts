import '@studio/ui/styles/tokens.css';
import '@studio/ui/styles/fonts.css';
import '@studio/ui/styles/game.css';
import './ui/desktop.css';
import { uiTokens } from '@studio/ui';
import { createUiHost, loadUiFonts } from '@studio/ui/dom';
import { createGame } from '@studio/core/phaser';
import { PlayScene } from './scenes/PlayScene';
import { TitleScene } from './scenes/TitleScene';
import { createPuttDuelDesktop } from './ui/desktop';

const host = createUiHost({ title: 'Putt Duel' });
const desktop = createPuttDuelDesktop(host);
// One family for the whole session; Phaser text must not reflow later.
await loadUiFonts();
try {
  // Title boots first; it jumps straight to Play when the URL has ?hole= or ?seed=.
  const game = createGame({ scenes: [TitleScene, PlayScene], backgroundColor: uiTokens.color.background });
  host.attachGame(game);
  desktop.attachGame(game);
} catch (error) {
  host.showError();
  throw error;
}
