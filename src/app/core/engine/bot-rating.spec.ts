import { describe, expect, it } from 'vitest';
import {
  BOT_RATING_STOPS,
  botMoveTimeMs,
  isBotRating,
  legacyBotRating,
  normalizeBotRating,
} from './bot-rating';

describe('bot ratings', () => {
  it('offers the native Stockfish floor, rounded intermediate stops, and native ceiling', () => {
    expect(BOT_RATING_STOPS).toEqual([
      1320, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700,
      2800, 2900, 3000, 3100, 3190,
    ]);
    expect(isBotRating(1320)).toBe(true);
    expect(isBotRating(3190)).toBe(true);
    expect(isBotRating(1350)).toBe(false);
  });

  it('migrates legacy presets and safely defaults invalid preferences', () => {
    expect(legacyBotRating('beginner')).toBe(1320);
    expect(legacyBotRating('casual')).toBe(1500);
    expect(legacyBotRating('intermediate')).toBe(1800);
    expect(legacyBotRating('advanced')).toBe(2200);
    expect(legacyBotRating('expert')).toBe(3190);
    expect(legacyBotRating('unknown')).toBeNull();
    expect(normalizeBotRating(1350)).toBe(1320);
  });

  it('derives bounded move times that increase with rating', () => {
    expect(botMoveTimeMs(1320)).toBe(100);
    expect(botMoveTimeMs(3190)).toBe(1500);
    expect(botMoveTimeMs(2200)).toBeGreaterThan(botMoveTimeMs(1500));
  });
});
