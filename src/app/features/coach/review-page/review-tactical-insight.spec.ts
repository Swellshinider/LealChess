import { createTacticalLineInsight } from './review-tactical-insight';

describe('review tactical insight', () => {
  it('finds the net pawn won by the reported exchange sequence', () => {
    const insight = createTacticalLineInsight(
      'r1bqkbnr/pp3ppp/2n1p3/2pp4/P2P4/N3P3/1PPB1PPP/R2QKBNR b KQkq - 2 5',
      ['c5d4', 'e3d4', 'c6d4'],
      'black',
    );

    expect(insight).toMatchObject({
      beneficiary: 'black',
      line: ['cxd4', 'exd4', 'Nxd4'],
      materialDelta: 1,
      outcome: 'a pawn',
    });
  });

  it.each([
    ['fork', 'r3k3/8/8/1N6/8/8/8/4K3 w q - 0 1', ['b5c7', 'e8d7', 'c7a8'], 'a rook'],
    ['pin', '4k3/p3b3/5B2/8/8/8/8/R5K1 w - - 0 1', ['a1e1', 'a7a6', 'e1e7'], 'a bishop'],
    ['skewer', '8/8/8/8/3k3q/8/8/R5K1 w - - 0 1', ['a1a4', 'd4c5', 'a4h4'], 'a queen'],
    ['discovered attack', '4k3/7p/8/8/8/8/4B3/4R1K1 w - - 0 1', ['e2d3', 'e8f8', 'd3h7'], 'a pawn'],
  ] as const)('recognizes a demonstrated %s', (motif, fen, line, outcome) => {
    expect(createTacticalLineInsight(fen, [...line], 'white')).toMatchObject({
      beneficiary: 'white',
      motif,
      outcome,
    });
  });

  it('reports material won by the opponent from the requested perspective', () => {
    const insight = createTacticalLineInsight(
      'r3k3/8/8/1N6/8/8/8/4K3 w q - 0 1',
      ['b5c7', 'e8d7', 'c7a8'],
      'black',
    );

    expect(insight).toMatchObject({
      beneficiary: 'white',
      materialDelta: -5,
      outcome: 'a rook',
    });
  });

  it('resolves an early queen trade before unrelated later captures', () => {
    const insight = createTacticalLineInsight(
      'r1b1kb1r/ppp2ppp/8/2q1p3/8/2NPBQ2/PPP2PPP/R4RK1 b kq - 0 10',
      ['c5b6', 'e3b6', 'a7b6', 'c3e4', 'f7f5', 'e4g5', 'h7h6', 'g5f7', 'e8f7'],
      'black',
    );

    expect(insight).toMatchObject({
      beneficiary: 'white',
      line: ['Qb6', 'Bxb6', 'axb6'],
      materialDelta: -6,
      outcome: 'a queen for a bishop',
    });
  });

  it('rejects a temporary capture that the line gives back', () => {
    expect(
      createTacticalLineInsight(
        'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        ['e4d5', 'd8d5'],
        'white',
      ),
    ).toBeNull();
  });

  it('keeps long tactical lines out of the concise coach note', () => {
    expect(
      createTacticalLineInsight(
        'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1',
        ['g1g2', 'g8h7', 'g2g1', 'h7g8', 'g1g2', 'g8h7', 'a1a8'],
        'white',
      ),
    ).toBeNull();
  });

  it('rejects malformed, truncated, and promotion lines', () => {
    expect(createTacticalLineInsight(newGameFen, ['e2e4'], 'white')).toBeNull();
    expect(createTacticalLineInsight(newGameFen, ['not-a-move', 'e7e5'], 'white')).toBeNull();
    expect(
      createTacticalLineInsight('7k/P7/8/8/8/8/8/7K w - - 0 1', ['a7a8q', 'h8g7'], 'white'),
    ).toBeNull();
  });
});

const newGameFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
