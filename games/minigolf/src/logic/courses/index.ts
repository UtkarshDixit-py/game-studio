// The three holes of a match, in play order. Pure data, no Phaser.
import type { Course } from '../course';
import { hole1 } from './hole1';
import { hole2 } from './hole2';
import { hole3 } from './hole3';

export { hole1, hole2, hole3 };

/** Every hole of the match, in order. Courses are never mutated by the game. */
export const HOLES: readonly Course[] = [hole1(), hole2(), hole3()];
