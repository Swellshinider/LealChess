import { describe, expect, it } from 'vitest';
import type { ImportedMove } from '../domain/coach.types';
import { reviewSoundEvents } from './review-sound';

describe('reviewSoundEvents', () => {
  it.each([
    ['e4', ['move']],
    ['Nxe5', ['capture']],
    ['O-O', ['castle']],
    ['e8=Q', ['promotion']],
    ['Qxh7+', ['capture', 'check']],
    ['Qh7#', ['move', 'check']],
  ])('maps %s to its review sounds', (san, expected) => {
    expect(reviewSoundEvents(move(san))).toEqual(expected);
  });
});

function move(san: string): ImportedMove {
  return {
    ply: 1,
    color: 'white',
    san,
    from: 'e2',
    to: 'e4',
    uci: 'e2e4',
    fenBefore: '',
    fenAfter: '',
  };
}
