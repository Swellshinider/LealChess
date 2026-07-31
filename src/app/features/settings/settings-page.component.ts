import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_ACTIONS,
  KEYBINDING_LABELS,
  cloneDefaultKeybindings,
  formatKeyChord,
  isAssignableKeyChord,
  keyChordFromEvent,
  keyChordId,
  type KeybindingAction,
} from '../../core/keyboard/keybindings';
import {
  SettingsPersistenceService,
  type LealChessStorageUsage,
} from '../../core/persistence/settings-persistence.service';
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
  protected readonly keybindingActions = KEYBINDING_ACTIONS;
  protected readonly keybindingLabels = KEYBINDING_LABELS;
  protected readonly capturingKeybinding = signal<KeybindingAction | null>(null);
  protected readonly keybindingError = signal<string | null>(null);
  protected readonly usernameError = signal(false);
  protected readonly clearConfirmationOpen = signal(false);
  protected readonly clearing = signal(false);
  protected readonly storageUsage = signal<LealChessStorageUsage | null | undefined>(undefined);
  protected readonly storageUsageLabel = computed(() => {
    const usage = this.storageUsage();
    return formatStorageUsage(usage === null || usage === undefined ? usage : usage.total);
  });
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
    this.storageUsage.set(await this.settingsPersistence.calculateStorageUsage());
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
    await this.refreshStorageUsage();
  }

  protected async retry(platform: ChessPlatform): Promise<void> {
    await this.coach.retry(platform);
    await this.refreshStorageUsage();
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

  protected beginKeybindingCapture(action: KeybindingAction): void {
    this.capturingKeybinding.set(action);
    this.keybindingError.set(null);
  }

  protected captureKeybinding(action: KeybindingAction, event: KeyboardEvent): void {
    if (this.capturingKeybinding() !== action) return;
    if (event.key === 'Tab') {
      this.capturingKeybinding.set(null);
      this.keybindingError.set(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.capturingKeybinding.set(null);
      this.keybindingError.set(null);
      return;
    }
    const chord = keyChordFromEvent(event);
    if (!chord) {
      this.keybindingError.set('Add a non-modifier key to the shortcut.');
      return;
    }
    if (!isAssignableKeyChord(chord)) {
      this.keybindingError.set('Escape and Tab are reserved for navigation.');
      return;
    }
    const duplicate = KEYBINDING_ACTIONS.find(
      (candidate) =>
        candidate !== action &&
        keyChordId(this.preferences().keybindings[candidate]) === keyChordId(chord),
    );
    if (duplicate) {
      this.keybindingError.set(`Already assigned to ${KEYBINDING_LABELS[duplicate]}.`);
      return;
    }
    this.savePreferences({
      keybindings: { ...this.preferences().keybindings, [action]: chord },
    });
    this.capturingKeybinding.set(null);
    this.keybindingError.set(null);
  }

  protected resetKeybinding(action: KeybindingAction): void {
    const defaultChord = DEFAULT_KEYBINDINGS[action];
    const duplicate = KEYBINDING_ACTIONS.find(
      (candidate) =>
        candidate !== action &&
        keyChordId(this.preferences().keybindings[candidate]) === keyChordId(defaultChord),
    );
    if (duplicate) {
      this.keybindingError.set(
        `The default is assigned to ${KEYBINDING_LABELS[duplicate]}. Change it before resetting.`,
      );
      return;
    }
    this.savePreferences({
      keybindings: {
        ...this.preferences().keybindings,
        [action]: { ...defaultChord },
      },
    });
    this.capturingKeybinding.set(null);
    this.keybindingError.set(null);
  }

  protected restoreDefaultKeybindings(): void {
    this.savePreferences({ keybindings: cloneDefaultKeybindings() });
    this.capturingKeybinding.set(null);
    this.keybindingError.set(null);
  }

  protected keybindingLabel(action: KeybindingAction): string {
    return formatKeyChord(this.preferences().keybindings[action]);
  }

  protected keybindingIsDefault(action: KeybindingAction): boolean {
    return (
      keyChordId(this.preferences().keybindings[action]) === keyChordId(DEFAULT_KEYBINDINGS[action])
    );
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

  private async refreshStorageUsage(): Promise<void> {
    this.storageUsage.set(undefined);
    this.storageUsage.set(await this.settingsPersistence.calculateStorageUsage());
  }
}

export function formatStorageUsage(bytes: number | null | undefined): string {
  if (bytes === undefined) return 'Calculating…';
  if (bytes === null) return 'Unavailable';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${Math.round(value * 10) / 10} ${units[unitIndex]}`;
}
