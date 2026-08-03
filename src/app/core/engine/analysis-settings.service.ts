import { Injectable, inject, signal } from '@angular/core';
import {
  DEFAULT_ANALYSIS_PROFILES,
  normalizeAnalysisSettings,
  type AnalysisProfile,
  type AnalysisSettings,
  type AnalysisWorkflow,
} from './analysis-profiles';
import { LealChessDatabaseService } from '../persistence/leal-chess-database.service';

@Injectable({ providedIn: 'root' })
export class AnalysisSettingsService {
  private readonly database = inject(LealChessDatabaseService);
  private readonly mutableSettings = signal<AnalysisSettings>(
    normalizeAnalysisSettings({ profiles: DEFAULT_ANALYSIS_PROFILES }),
  );
  private loading: Promise<void> | null = null;
  private writes = Promise.resolve();

  readonly settings = this.mutableSettings.asReadonly();

  load(): Promise<void> {
    this.loading ??= this.loadStored();
    return this.loading;
  }

  async profile(workflow: AnalysisWorkflow): Promise<AnalysisProfile> {
    await this.load();
    return { ...this.mutableSettings().profiles[workflow] };
  }

  updateProfile(workflow: AnalysisWorkflow, changes: Partial<AnalysisProfile>): Promise<void> {
    const current = this.mutableSettings();
    this.mutableSettings.set(
      normalizeAnalysisSettings({
        profiles: {
          ...current.profiles,
          [workflow]: { ...current.profiles[workflow], ...changes },
        },
      }),
    );
    this.writes = this.writes.then(async () => {
      await this.load();
      const latest = this.mutableSettings();
      const normalized = normalizeAnalysisSettings({
        profiles: {
          ...latest.profiles,
          [workflow]: { ...latest.profiles[workflow], ...changes },
        },
      });
      this.mutableSettings.set(normalized);
      const database = await this.database.open();
      await database.put('state', { key: 'analysis-settings', value: normalized });
    });
    return this.writes;
  }

  private async loadStored(): Promise<void> {
    try {
      const database = await this.database.open();
      const record = await database.get('state', 'analysis-settings');
      const normalized = normalizeAnalysisSettings(record?.value);
      this.mutableSettings.set(normalized);
      if (!record || JSON.stringify(record.value) !== JSON.stringify(normalized)) {
        await database.put('state', { key: 'analysis-settings', value: normalized });
      }
    } catch {
      // Private browsing or test environments may not expose IndexedDB; defaults remain usable.
    }
  }
}
