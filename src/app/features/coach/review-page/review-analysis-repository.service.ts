import { Injectable, inject } from '@angular/core';
import {
  LealChessDatabaseService,
  type LealChessStoreRecords,
} from '../../../core/persistence/leal-chess-database.service';
import type { ImportedGame } from '../domain/coach.types';
import { restoreReviewAnalysisSession } from './review-analysis-session';
import type { ReviewAnalysisSession } from './review-analysis-session.types';

interface ReviewRecords extends LealChessStoreRecords {
  reviewAnalysisSessions: ReviewAnalysisSession;
}

@Injectable()
export class ReviewAnalysisRepositoryService {
  private readonly database = inject(LealChessDatabaseService);
  private writes = Promise.resolve();

  async restore(game: ImportedGame): Promise<ReviewAnalysisSession> {
    let stored: unknown;
    try {
      stored = await (
        await this.database.open<ReviewRecords>()
      ).get('reviewAnalysisSessions', game.key);
    } catch {
      stored = null;
    }
    return restoreReviewAnalysisSession(stored, game);
  }

  save(session: ReviewAnalysisSession): Promise<void> {
    const snapshot = structuredClone(session);
    const queued = this.writes.then(async () => {
      await (await this.database.open<ReviewRecords>()).put('reviewAnalysisSessions', snapshot);
    });
    this.writes = queued.catch(() => undefined);
    return queued;
  }

  flush(): Promise<void> {
    return this.writes;
  }
}
