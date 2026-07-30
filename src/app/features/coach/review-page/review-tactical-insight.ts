import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { parseUci } from '../../../core/game/chess-move';
import type { ChessColor } from '../../../shared/chess/chess.types';

export type TacticalMotif = 'fork' | 'pin' | 'skewer' | 'discovered attack';

export interface TacticalLineInsight {
  beneficiary: ChessColor;
  line: string[];
  materialDelta: number;
  motif?: TacticalMotif;
  outcome: string;
}

interface ReplayedPly {
  beforeFen: string;
  afterFen: string;
  move: Move;
}

interface AlignedTargets {
  front: Square;
  frontPiece: PieceSymbol;
  rear: Square;
  rearPiece: PieceSymbol;
}

const MAX_EXPLANATION_PLIES = 6;
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function createTacticalLineInsight(
  fen: string,
  principalVariation: string[],
  perspective: ChessColor,
): TacticalLineInsight | null {
  const replay = replayLine(fen, principalVariation);
  if (!replay || replay.length < 2) return null;

  const perspectiveColor = colorCode(perspective);
  const startingBalance = materialBalance(new Chess(fen), perspectiveColor);
  const deltas = replay.map(
    (ply) => materialBalance(new Chess(ply.afterFen), perspectiveColor) - startingBalance,
  );
  const decisiveIndex = resolvedMaterialIndex(replay, deltas);
  if (decisiveIndex < 0) return null;
  const decisiveDelta = deltas[decisiveIndex]!;

  const beneficiaryColor = decisiveDelta > 0 ? perspectiveColor : oppositeColor(perspectiveColor);
  const decisiveLine = replay.slice(0, decisiveIndex + 1);
  const materialDelta = Math.abs(decisiveDelta);
  const motif = detectMotif(decisiveLine, beneficiaryColor);

  return {
    beneficiary: colorName(beneficiaryColor),
    line: decisiveLine.map((ply) => ply.move.san),
    materialDelta: decisiveDelta,
    ...(motif ? { motif } : {}),
    outcome: materialOutcome(decisiveLine, beneficiaryColor, materialDelta),
  };
}

function replayLine(fen: string, principalVariation: string[]): ReplayedPly[] | null {
  const chess = new Chess(fen);
  const replay: ReplayedPly[] = [];
  for (const uci of principalVariation) {
    const parsed = parseUci(uci);
    if (!parsed) return null;
    const beforeFen = chess.fen();
    try {
      const move = chess.move(parsed);
      if (move.isPromotion()) return null;
      replay.push({ beforeFen, afterFen: chess.fen(), move });
    } catch {
      return null;
    }
  }
  return replay;
}

function resolvedMaterialIndex(replay: ReplayedPly[], deltas: number[]): number {
  const confidenceWindowEnd = Math.min(replay.length, MAX_EXPLANATION_PLIES);
  for (let index = 0; index < confidenceWindowEnd; index += 1) {
    const delta = deltas[index] ?? 0;
    if (delta === 0) continue;
    if (
      deltas.slice(index, confidenceWindowEnd).some((candidateDelta) => candidateDelta !== delta)
    ) {
      continue;
    }
    if (confidenceWindowEnd < replay.length || index < replay.length - 1) return index;
    if (terminalCaptureCannotBeRecaptured(replay[index]!)) return index;
  }
  return -1;
}

function terminalCaptureCannotBeRecaptured(ply: ReplayedPly): boolean {
  if (!ply.move.captured) return false;
  return !new Chess(ply.afterFen)
    .moves({ verbose: true })
    .some((reply) => reply.isCapture() && reply.to === ply.move.to);
}

function materialBalance(chess: Chess, perspective: Color): number {
  return chess
    .board()
    .flat()
    .reduce(
      (total, piece) =>
        total + (piece ? PIECE_VALUES[piece.type] * (piece.color === perspective ? 1 : -1) : 0),
      0,
    );
}

function materialOutcome(replay: ReplayedPly[], beneficiary: Color, delta: number): string {
  const won: PieceSymbol[] = [];
  const lost: PieceSymbol[] = [];
  for (const { move } of replay) {
    if (!move.captured) continue;
    (move.color === beneficiary ? won : lost).push(move.captured);
  }

  if (delta === 2 && won.includes('r') && (lost.includes('b') || lost.includes('n'))) {
    return 'the exchange';
  }
  if (won.includes('q') && lost.length === 1 && (lost[0] === 'b' || lost[0] === 'n')) {
    return `a queen for a ${lost[0] === 'b' ? 'bishop' : 'knight'}`;
  }
  if (delta === 4 && won.includes('q') && lost.includes('r')) {
    return 'a queen for a rook';
  }
  if (lost.length === 0 && won.length === 1) {
    return pieceOutcome(won[0]!);
  }
  if (won.every((piece) => piece === 'p') && lost.every((piece) => piece === 'p')) {
    return delta === 1 ? 'a pawn' : `${delta} pawns`;
  }
  if (delta === 1) return 'a pawn';
  return `${delta} pawns of material`;
}

function pieceOutcome(piece: PieceSymbol): string {
  return {
    p: 'a pawn',
    n: 'a knight',
    b: 'a bishop',
    r: 'a rook',
    q: 'a queen',
    k: 'material',
  }[piece];
}

function detectMotif(replay: ReplayedPly[], beneficiary: Color): TacticalMotif | undefined {
  for (let index = 0; index < replay.length; index += 1) {
    const ply = replay[index]!;
    if (ply.move.color !== beneficiary) continue;
    if (isFork(replay, index, beneficiary)) return 'fork';
    if (isSkewer(replay, index, beneficiary)) return 'skewer';
    if (isPin(replay, index, beneficiary)) return 'pin';
    if (isDiscoveredAttack(replay, index, beneficiary)) return 'discovered attack';
  }
  return undefined;
}

function isFork(replay: ReplayedPly[], index: number, beneficiary: Color): boolean {
  const ply = replay[index]!;
  const after = new Chess(ply.afterFen);
  const attackerValue = PIECE_VALUES[ply.move.promotion ?? ply.move.piece];
  const targets = after
    .board()
    .flat()
    .filter((piece): piece is NonNullable<typeof piece> =>
      Boolean(
        piece &&
        piece.color !== beneficiary &&
        after.attackers(piece.square, beneficiary).includes(ply.move.to) &&
        (piece.type === 'k' || PIECE_VALUES[piece.type] > attackerValue),
      ),
    );
  if (targets.length < 2) return false;

  return samePieceLaterCaptures(replay, index, ply.move.to, ply.move.piece);
}

function isPin(replay: ReplayedPly[], index: number, beneficiary: Color): boolean {
  const ply = replay[index]!;
  if (!isSlider(ply.move.piece)) return false;
  const after = new Chess(ply.afterFen);
  for (const targets of alignedEnemyTargets(after, ply.move.to, beneficiary, ply.move.piece)) {
    if (
      targets.rearPiece !== 'k' &&
      PIECE_VALUES[targets.rearPiece] <= PIECE_VALUES[targets.frontPiece]
    ) {
      continue;
    }
    if (pieceMovesFrom(replay, index + 1, targets.front)) continue;
    if (beneficiaryCapturesSquare(replay, index + 1, beneficiary, targets.front)) return true;
  }
  return false;
}

function isSkewer(replay: ReplayedPly[], index: number, beneficiary: Color): boolean {
  const ply = replay[index]!;
  if (!isSlider(ply.move.piece)) return false;
  const after = new Chess(ply.afterFen);
  for (const targets of alignedEnemyTargets(after, ply.move.to, beneficiary, ply.move.piece)) {
    if (
      targets.frontPiece !== 'k' &&
      PIECE_VALUES[targets.frontPiece] <= PIECE_VALUES[targets.rearPiece]
    ) {
      continue;
    }
    const frontMoveIndex = replay.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.move.from === targets.front,
    );
    if (frontMoveIndex < 0) continue;
    if (
      trackedPieceCapturesSquare(
        replay,
        index,
        ply.move.to,
        ply.move.piece,
        targets.rear,
        frontMoveIndex,
      )
    ) {
      return true;
    }
  }
  return false;
}

function isDiscoveredAttack(replay: ReplayedPly[], index: number, beneficiary: Color): boolean {
  const ply = replay[index]!;
  const before = new Chess(ply.beforeFen);
  const after = new Chess(ply.afterFen);
  const enemyPieces = after
    .board()
    .flat()
    .filter((piece): piece is NonNullable<typeof piece> =>
      Boolean(piece && piece.color !== beneficiary),
    );

  for (const target of enemyPieces) {
    const newlyRevealedSliders = after.attackers(target.square, beneficiary).filter((square) => {
      if (square === ply.move.to || before.attackers(target.square, beneficiary).includes(square)) {
        return false;
      }
      const piece = after.get(square);
      return Boolean(
        piece && isSlider(piece.type) && liesBetween(square, ply.move.from, target.square),
      );
    });
    if (!newlyRevealedSliders.length) continue;
    if (
      target.type === 'k'
        ? samePieceLaterCaptures(replay, index, ply.move.to, ply.move.piece)
        : beneficiaryCapturesSquare(replay, index + 1, beneficiary, target.square)
    ) {
      return true;
    }
  }
  return false;
}

function alignedEnemyTargets(
  chess: Chess,
  attacker: Square,
  beneficiary: Color,
  piece: PieceSymbol,
): AlignedTargets[] {
  const targets: AlignedTargets[] = [];
  for (const [fileStep, rankStep] of sliderDirections(piece)) {
    const occupied: Array<{ square: Square; type: PieceSymbol; color: Color }> = [];
    let [file, rank] = squareCoordinates(attacker);
    while (true) {
      file += fileStep;
      rank += rankStep;
      const square = coordinatesSquare(file, rank);
      if (!square) break;
      const found = chess.get(square);
      if (found) occupied.push({ square, ...found });
      if (occupied.length === 2) break;
    }
    if (
      occupied.length === 2 &&
      occupied[0]!.color !== beneficiary &&
      occupied[1]!.color !== beneficiary
    ) {
      targets.push({
        front: occupied[0]!.square,
        frontPiece: occupied[0]!.type,
        rear: occupied[1]!.square,
        rearPiece: occupied[1]!.type,
      });
    }
  }
  return targets;
}

function samePieceLaterCaptures(
  replay: ReplayedPly[],
  index: number,
  startingSquare: Square,
  piece: PieceSymbol,
): boolean {
  let square = startingSquare;
  for (const candidate of replay.slice(index + 1)) {
    if (candidate.move.from !== square || candidate.move.piece !== piece) continue;
    square = candidate.move.to;
    if (candidate.move.captured) return true;
  }
  return false;
}

function trackedPieceCapturesSquare(
  replay: ReplayedPly[],
  index: number,
  startingSquare: Square,
  piece: PieceSymbol,
  target: Square,
  afterIndex: number,
): boolean {
  let square = startingSquare;
  for (let candidateIndex = index + 1; candidateIndex < replay.length; candidateIndex += 1) {
    const candidate = replay[candidateIndex]!;
    if (candidate.move.from !== square || candidate.move.piece !== piece) continue;
    square = candidate.move.to;
    if (candidateIndex > afterIndex && candidate.move.to === target && candidate.move.captured) {
      return true;
    }
  }
  return false;
}

function beneficiaryCapturesSquare(
  replay: ReplayedPly[],
  fromIndex: number,
  beneficiary: Color,
  square: Square,
): boolean {
  return replay
    .slice(fromIndex)
    .some(
      (candidate) =>
        candidate.move.color === beneficiary &&
        candidate.move.to === square &&
        Boolean(candidate.move.captured),
    );
}

function pieceMovesFrom(replay: ReplayedPly[], fromIndex: number, square: Square): boolean {
  return replay.slice(fromIndex).some((candidate) => candidate.move.from === square);
}

function liesBetween(start: Square, middle: Square, end: Square): boolean {
  const [startFile, startRank] = squareCoordinates(start);
  const [middleFile, middleRank] = squareCoordinates(middle);
  const [endFile, endRank] = squareCoordinates(end);
  const fileDistance = endFile - startFile;
  const rankDistance = endRank - startRank;
  if (
    fileDistance !== 0 &&
    rankDistance !== 0 &&
    Math.abs(fileDistance) !== Math.abs(rankDistance)
  ) {
    return false;
  }
  const fileStep = Math.sign(fileDistance);
  const rankStep = Math.sign(rankDistance);
  let file = startFile + fileStep;
  let rank = startRank + rankStep;
  while (file !== endFile || rank !== endRank) {
    if (file === middleFile && rank === middleRank) return true;
    file += fileStep;
    rank += rankStep;
  }
  return false;
}

function sliderDirections(piece: PieceSymbol): Array<[number, number]> {
  const orthogonal: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const diagonal: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  if (piece === 'b') return diagonal;
  if (piece === 'r') return orthogonal;
  return piece === 'q' ? [...orthogonal, ...diagonal] : [];
}

function isSlider(piece: PieceSymbol): boolean {
  return piece === 'b' || piece === 'r' || piece === 'q';
}

function squareCoordinates(square: Square): [number, number] {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1];
}

function coordinatesSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
}

function colorCode(color: ChessColor): Color {
  return color === 'white' ? 'w' : 'b';
}

function colorName(color: Color): ChessColor {
  return color === 'w' ? 'white' : 'black';
}

function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}
