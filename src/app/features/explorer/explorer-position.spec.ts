import { STARTING_FEN } from '../../core/game/game.types';
import {
  parseExplorerFen,
  parseExplorerPgn,
  setupStateFromFen,
  setupStateToFen,
} from './explorer-position';

describe('Explorer position input', () => {
  it('parses standard PGN and preserves its initial position', () => {
    const result = parseExplorerPgn('1. e4 e5 2. Nf3 Nc6');

    expect(result.ok).toBe(true);
    expect(result.rootFen).toBe(STARTING_FEN);
    expect(result.moves?.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('supports PGN that starts from a FEN header', () => {
    const fen = 'k7/8/8/8/8/8/4K3/7R w - - 0 1';
    const result = parseExplorerPgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. Rh8+`);

    expect(result.ok).toBe(true);
    expect(result.rootFen).toBe(fen);
    expect(result.moves?.[0]?.san).toBe('Rh8+');
  });

  it('rejects engine-unsafe metadata and impossible king placement', () => {
    expect(parseExplorerFen('8/8/8/8/8/8/4k3/4K3 w - - 0 1')).toMatchObject({
      ok: false,
      error: 'Kings cannot occupy adjacent squares.',
    });
    expect(parseExplorerFen('4k3/8/8/8/8/8/8/4K3 w K - 0 1')).toMatchObject({
      ok: false,
      error: expect.stringContaining('Castling right K'),
    });
  });

  it('round-trips board metadata and normalizes setup clocks', () => {
    const state = setupStateFromFen(STARTING_FEN);
    expect(setupStateToFen(state)).toBe(STARTING_FEN);
  });
});
