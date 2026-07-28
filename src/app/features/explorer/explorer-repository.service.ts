import { Injectable, inject } from '@angular/core';
import { LealChessDatabaseService } from '../../core/persistence/leal-chess-database.service';
import { EXPLORER_SESSION_SCHEMA_VERSION, type ExplorerSession } from './explorer.types';
import { resetAnalysisVersion } from './explorer-session';

@Injectable()
export class ExplorerRepositoryService {
  private readonly database = inject(LealChessDatabaseService);
  private writes = Promise.resolve();

  async restore(): Promise<ExplorerSession | null> {
    try {
      const record = await (await this.database.open()).get('explorerSessions', 'active');
      if (!isExplorerSession(record)) return null;
      return resetAnalysisVersion(record);
    } catch {
      return null;
    }
  }

  save(session: ExplorerSession): Promise<void> {
    const snapshot = structuredClone(session);
    const queued = this.writes.then(async () => {
      await (await this.database.open()).put('explorerSessions', snapshot);
    });
    this.writes = queued.catch(() => undefined);
    return queued;
  }

  clear(): Promise<void> {
    const queued = this.writes.then(async () => {
      await (await this.database.open()).delete('explorerSessions', 'active');
    });
    this.writes = queued.catch(() => undefined);
    return queued;
  }

  flush(): Promise<void> {
    return this.writes;
  }
}

function isExplorerSession(value: unknown): value is ExplorerSession {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ExplorerSession>;
  return (
    record.id === 'active' &&
    record.schemaVersion === EXPLORER_SESSION_SCHEMA_VERSION &&
    typeof record.rootFen === 'string' &&
    typeof record.rootId === 'string' &&
    typeof record.selectedNodeId === 'string' &&
    typeof record.nodes === 'object' &&
    record.nodes !== null &&
    Boolean(record.nodes[record.rootId]) &&
    Boolean(record.nodes[record.selectedNodeId])
  );
}
