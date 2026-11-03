import { Injectable, inject } from '@angular/core';
import { LealChessDatabaseService } from '../../core/persistence/leal-chess-database.service';
import type { CachedDailyPuzzle, PuzzleAttempt, PuzzleStats } from './puzzle.types';

@Injectable({ providedIn: 'root' })
export class PuzzleRepositoryService {
  private readonly database = inject(LealChessDatabaseService);

  async cachedDaily(provider: 'lichess' | 'chess-com'): Promise<CachedDailyPuzzle | null> {
    return (
      ((await (await this.database.open()).get('puzzleDaily', provider)) as
        CachedDailyPuzzle | undefined) ?? null
    );
  }

  async cacheDaily(record: CachedDailyPuzzle): Promise<void> {
    await (await this.database.open()).put('puzzleDaily', record);
  }

  async attempts(): Promise<PuzzleAttempt[]> {
    const attempts = (await (
      await this.database.open()
    ).getAll('puzzleAttempts')) as PuzzleAttempt[];
    return attempts.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }

  async recordAttempt(attempt: PuzzleAttempt): Promise<void> {
    const database = await this.database.open();
    await database.put('puzzleAttempts', attempt);
    const attempts = (await database.getAll('puzzleAttempts')) as PuzzleAttempt[];
    if (attempts.length <= 500) return;
    const creditCounts = new Map<string, number>();
    for (const item of attempts.filter(
      (candidate) => candidate.dailyCredit && candidate.dailyDate,
    )) {
      creditCounts.set(item.dailyDate!, (creditCounts.get(item.dailyDate!) ?? 0) + 1);
    }
    const removable = attempts.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    let remaining = attempts.length;
    for (const old of removable) {
      if (remaining <= 500) break;
      if (old.dailyCredit && old.dailyDate && (creditCounts.get(old.dailyDate) ?? 0) <= 1) continue;
      await database.delete('puzzleAttempts', old.id);
      remaining -= 1;
      if (old.dailyCredit && old.dailyDate) {
        creditCounts.set(old.dailyDate, (creditCounts.get(old.dailyDate) ?? 1) - 1);
      }
    }
  }
}

export function puzzleStats(attempts: readonly PuzzleAttempt[], today: string): PuzzleStats {
  const completed = attempts.length;
  const clean = attempts.filter((attempt) => attempt.outcome === 'clean-solved').length;
  const dates = [
    ...new Set(
      attempts
        .filter((attempt) => attempt.dailyCredit && attempt.dailyDate)
        .map((attempt) => attempt.dailyDate!),
    ),
  ].sort();
  let longestStreak = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const value of dates) {
    const date = new Date(`${value}T12:00:00`);
    run =
      previous && Math.round((date.getTime() - previous.getTime()) / 86_400_000) === 1
        ? run + 1
        : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }
  let currentStreak = 0;
  const dateSet = new Set(dates);
  const cursor = new Date(`${today}T12:00:00`);
  if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(localIso(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    total: completed,
    clean,
    cleanRate: completed ? Math.round((clean / completed) * 100) : 0,
    currentStreak,
    longestStreak,
  };
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
