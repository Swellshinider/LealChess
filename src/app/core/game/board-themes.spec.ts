import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, boardTheme } from './board-themes';

describe('board themes', () => {
  it('defines all six palettes centrally', () => {
    expect(BOARD_THEMES).toHaveLength(6);
    expect(boardTheme('rosewood')).toMatchObject({ light: '#e8d8bc', dark: '#8a4752' });
    expect(boardTheme('green-felt')).toMatchObject({ light: '#d9e1c3', dark: '#55745b' });
    expect(boardTheme('blue-steel')).toMatchObject({ light: '#c9d8e2', dark: '#4c657a' });
  });
});
