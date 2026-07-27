import { describe, expect, it } from 'vitest';
import { boardOverlayPosition } from './board-overlay-position';

describe('boardOverlayPosition', () => {
  it('keeps a square-corner overlay inside either board orientation', () => {
    expect(boardOverlayPosition('a8', 'white')).toBe(
      'left: 0.75%; top: 11.75%; transform: translate(0, -100%)',
    );
    expect(boardOverlayPosition('a8', 'black')).toBe(
      'left: 99.25%; top: 99.25%; transform: translate(-100%, -100%)',
    );
    expect(boardOverlayPosition('h1', 'white')).toBe(
      'left: 99.25%; top: 99.25%; transform: translate(-100%, -100%)',
    );
    expect(boardOverlayPosition('h1', 'black')).toBe(
      'left: 0.75%; top: 11.75%; transform: translate(0, -100%)',
    );
  });
});
