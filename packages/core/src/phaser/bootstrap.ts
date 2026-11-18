import Phaser from 'phaser';

export const DESIGN_WIDTH = 480;
export const DESIGN_HEIGHT = 800;

declare global {
  interface Window {
    /** Exposed for Playwright. */
    __GAME__?: Phaser.Game;
  }
}

export interface BootstrapOptions {
  scenes: Phaser.Types.Scenes.SceneType[];
  parent?: string;
  backgroundColor?: string;
  /** Enable Arcade physics (most small games want it). */
  arcade?: boolean | Phaser.Types.Physics.Arcade.ArcadeWorldConfig;
}

/**
 * Creates a portrait 480x800 Phaser game that FIT-scales to the device,
 * supports three simultaneous touches and exposes itself on window.__GAME__.
 */
export const createGame = ({
  scenes,
  parent = 'app',
  backgroundColor = '#111218',
  arcade = true,
}: BootstrapOptions): Phaser.Game => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 3 },
    physics: arcade
      ? { default: 'arcade', arcade: typeof arcade === 'object' ? arcade : {} }
      : undefined,
    scene: scenes,
  });
  window.__GAME__ = game;
  return game;
};
