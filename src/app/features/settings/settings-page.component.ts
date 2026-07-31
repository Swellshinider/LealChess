import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BOARD_THEMES } from '../../core/game/board-themes';
import {
  DEFAULT_PREFERENCES,
  type BoardTheme,
  type ChessColor,
  type GamePreferences,
} from '../../core/game/game.types';
import { PERSISTENCE_PORT } from '../../core/persistence/persistence.types';
import { SettingsPersistenceService } from '../../core/persistence/settings-persistence.service';
import { ModalFocusDirective } from '../../shared/a11y/modal-focus.directive';
import { SideNavigationComponent } from '../../shared/layout/side-navigation/side-navigation.component';
import { CoachImportService } from '../coach/data/coach-import.service';
import type { ChessPlatform, SpeedFilter } from '../coach/domain/coach.types';
import { SettingsPreviewBoardComponent } from './settings-preview-board/settings-preview-board.component';
import type { Subscription } from 'rxjs';

@Component({
  selector: 'app-settings-page',
  imports: [
    ModalFocusDirective,
    ReactiveFormsModule,
    SettingsPreviewBoardComponent,
    SideNavigationComponent,
  ],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent implements OnInit, OnDestroy {
  private readonly persistence = inject(PERSISTENCE_PORT);
  private readonly settingsPersistence = inject(SettingsPersistenceService);
  protected readonly coach = inject(CoachImportService);
  protected readonly themes = BOARD_THEMES;
  protected readonly preferences = signal<GamePreferences>({ ...DEFAULT_PREFERENCES });
  protected readonly usernameError = signal(false);
  protected readonly clearConfirmationOpen = signal(false);
  protected readonly clearing = signal(false);
  protected readonly importForm = new FormGroup({
    chessComUsername: new FormControl('', { nonNullable: true }),
    lichessUsername: new FormControl('', { nonNullable: true }),
    maxGames: new FormControl(20, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(100)],
    }),
    speed: new FormControl<SpeedFilter>('any', { nonNullable: true }),
  });
  private importPreferencesSubscription: Subscription | null = null;

  constructor() {
    this.importForm.disable();
  }

  async ngOnInit(): Promise<void> {
    await this.coach.initialize();
    const [restored, importPreferences] = await Promise.all([
      this.persistence.restore(),
      this.settingsPersistence.importPreferences(this.coach.profiles()),
    ]);
    this.preferences.set(restored.preferences);
    this.importForm.setValue(importPreferences, { emitEvent: false });
    this.importForm.enable({ emitEvent: false });
    this.importPreferencesSubscription = this.importForm.valueChanges.subscribe(() => {
      if (this.importForm.valid) {
        void this.settingsPersistence.saveImportPreferences(this.importForm.getRawValue());
      }
    });
  }

  ngOnDestroy(): void {
    this.importPreferencesSubscription?.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  protected closeClearConfirmation(): void {
    this.clearConfirmationOpen.set(false);
  }

  protected async importGames(): Promise<void> {
    const request = this.importForm.getRawValue();
    const hasUsername = Boolean(request.chessComUsername.trim() || request.lichessUsername.trim());
    this.usernameError.set(!hasUsername);
    if (!hasUsername || this.importForm.invalid || this.coach.loading()) {
      this.importForm.markAllAsTouched();
      return;
    }
    await this.settingsPersistence.saveImportPreferences(request);
    await this.coach.import(request);
  }

  protected retry(platform: ChessPlatform): void {
    void this.coach.retry(platform);
  }

  protected updateBoolean(key: 'showLegalMoves' | 'premovesEnabled', event: Event): void {
    this.savePreferences({ [key]: (event.target as HTMLInputElement).checked });
  }

  protected updateMute(event: Event): void {
    this.savePreferences({ soundEnabled: !(event.target as HTMLInputElement).checked });
  }

  protected updateSoundVolume(event: Event): void {
    this.savePreferences({ soundVolume: Number((event.target as HTMLInputElement).value) });
  }

  protected updateTheme(event: Event): void {
    this.savePreferences({
      boardTheme: (event.target as HTMLSelectElement).value as BoardTheme,
    });
  }

  protected updateOrientation(event: Event): void {
    this.savePreferences({
      orientation: (event.target as HTMLSelectElement).value as ChessColor,
    });
  }

  protected async clearAllData(): Promise<void> {
    if (this.clearing()) return;
    this.clearing.set(true);
    await this.settingsPersistence.clearAll();
    window.location.assign('/');
  }

  private savePreferences(changes: Partial<GamePreferences>): void {
    const next = { ...this.preferences(), ...changes };
    this.preferences.set(next);
    void this.persistence.savePreferences(next);
  }
}
