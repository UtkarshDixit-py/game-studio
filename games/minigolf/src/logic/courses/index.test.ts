import { describe, expect, it } from 'vitest';
import { validateCourse } from '../course';
import { MATCH_HOLES } from '../match';
import { HOLES } from './index';

describe('HOLES', () => {
  it('lists the three holes in play order with caps 5, 4, 6', () => {
    expect(HOLES).toHaveLength(MATCH_HOLES);
    expect(HOLES.map((h) => h.cap)).toEqual([5, 4, 6]);
    expect(HOLES.map((h) => h.name)).toEqual(['Open field', 'Portal pegs', 'Belt maze']);
  });

  it('every hole validates clean', () => {
    for (const hole of HOLES) expect(validateCourse(hole)).toEqual([]);
  });
});
