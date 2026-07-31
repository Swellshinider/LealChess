import { Injectable, effect, inject, signal } from '@angular/core';
import { DEFAULT_PREFERENCES, type BoardTheme } from '../../core/game/game.types';
import type { KeybindingPreferences } from '../../core/keyboard/keybindings';
import { PERSISTENCE_PORT } from '../../core/persistence/persistence.types';
import { ExplorerRepositoryService } from './explorer-repository.service';
import { createExplorerSession } from './explorer-session';
import type { ExplorerSession } from './explorer.types';

@Injectable()
export class ExplorerPageStore {
  private readonly repository = inject(ExplorerRepositoryService);
  private readonly persistence = inject(PERSISTENCE_PORT);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private restored = false;

  readonly session = signal(createExplorerSession());
  readonly loading = signal(true);
  readonly boardTheme = signal<BoardTheme>('tournament');
  readonly keybindings = signal<KeybindingPreferences>(DEFAULT_PREFERENCES.keybindings);

  constructor() {
    effect(() => {
      const session = this.session();
      if (!this.restored) return;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => void this.repository.save(session), 250);
    });
  }

  async initialize(): Promise<void> {
    const [restored, persistedState] = await Promise.all([
      this.repository.restore(),
      this.persistence.restore(),
    ]);
    this.boardTheme.set(persistedState.preferences.boardTheme);
    this.keybindings.set(persistedState.preferences.keybindings);
    if (restored) {
      this.session.set({
        ...restored,
        batch:
          restored.batch.status === 'running'
            ? { ...restored.batch, status: 'running' }
            : restored.batch,
      });
    }
    this.restored = true;
    this.loading.set(false);
  }

  save(session = this.session()): void {
    void this.repository.save(session);
  }

  update(update: (session: ExplorerSession) => ExplorerSession): void {
    this.session.update(update);
  }

  async destroy(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    await this.repository.save(this.session());
    await this.repository.flush();
  }
}
