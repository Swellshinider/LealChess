import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Subscription } from 'rxjs';
import { OnboardingService } from '../../../core/onboarding/onboarding.service';
import { SettingsPersistenceService } from '../../../core/persistence/settings-persistence.service';
import { CoachImportService } from '../data/coach-import.service';
import type { ChessPlatform, SpeedFilter } from '../domain/coach.types';

@Component({
  selector: 'app-import-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './import-panel.component.html',
  styleUrl: './import-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportPanelComponent implements OnInit, OnDestroy {
  private readonly settingsPersistence = inject(SettingsPersistenceService);
  private readonly onboarding = inject(OnboardingService);
  protected readonly coach = inject(CoachImportService);
  protected readonly usernameError = signal(false);
  protected readonly open = signal(false);
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
    effect(() => {
      const step = this.onboarding.active() ? this.onboarding.step() : null;
      if (
        this.coach.games().length === 0 ||
        this.coach.hasFailures() ||
        step?.id === 'learn-import'
      ) {
        this.open.set(true);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.coach.initialize();
    const importPreferences = await this.settingsPersistence.importPreferences(
      this.coach.profiles(),
    );
    this.importForm.setValue(importPreferences, { emitEvent: false });
    this.importPreferencesSubscription = this.importForm.valueChanges.subscribe(() => {
      if (this.importForm.valid) {
        void this.settingsPersistence.saveImportPreferences(this.importForm.getRawValue());
      }
    });
    this.importForm.enable({ emitEvent: false });
  }

  ngOnDestroy(): void {
    this.importPreferencesSubscription?.unsubscribe();
  }

  protected setOpen(event: Event): void {
    this.open.set((event.target as HTMLDetailsElement).open);
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

  protected async retry(platform: ChessPlatform): Promise<void> {
    await this.coach.retry(platform);
  }
}
