export const BOT_RATING_STOPS = [
  1320,
  ...Array.from({ length: 18 }, (_, index) => 1400 + index * 100),
  3190,
] as const;

export type BotRating = (typeof BOT_RATING_STOPS)[number];

export const DEFAULT_BOT_RATING: BotRating = 1320;

const LEGACY_RATINGS: Readonly<Record<string, BotRating>> = {
  beginner: 1320,
  casual: 1500,
  intermediate: 1800,
  advanced: 2200,
  expert: 3190,
};

export function isBotRating(value: unknown): value is BotRating {
  return typeof value === 'number' && BOT_RATING_STOPS.includes(value as BotRating);
}

export function normalizeBotRating(value: unknown, legacyValue?: unknown): BotRating {
  if (isBotRating(value)) return value;
  const legacyRating = legacyBotRating(legacyValue);
  if (legacyRating) return legacyRating;
  return DEFAULT_BOT_RATING;
}

export function legacyBotRating(value: unknown): BotRating | null {
  return typeof value === 'string' ? (LEGACY_RATINGS[value] ?? null) : null;
}

export function botMoveTimeMs(rating: BotRating): number {
  const progress =
    (rating - BOT_RATING_STOPS[0]) / (BOT_RATING_STOPS.at(-1)! - BOT_RATING_STOPS[0]);
  return Math.round(100 + progress * 1400);
}
