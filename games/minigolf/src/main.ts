import { createGame } from '@studio/core/phaser';
import { PlayScene } from './scenes/PlayScene';
import { TitleScene } from './scenes/TitleScene';

// Title boots first; it jumps straight to Play when the URL has ?hole= or ?seed=.
createGame({ scenes: [TitleScene, PlayScene] });
