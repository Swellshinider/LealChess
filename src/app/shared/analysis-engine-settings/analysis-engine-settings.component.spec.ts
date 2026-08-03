import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANALYSIS_PROFILES } from '../../core/engine/analysis-profiles';
import { AnalysisSettingsService } from '../../core/engine/analysis-settings.service';
import { EngineAssetManagerService } from '../../core/engine/engine-asset-manager.service';
import { AnalysisEngineSettingsComponent } from './analysis-engine-settings.component';

describe('AnalysisEngineSettingsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens an accessible profile dialog and persists a selected engine immediately', async () => {
    const updateProfile = vi.fn(() => Promise.resolve());
    await TestBed.configureTestingModule({
      imports: [AnalysisEngineSettingsComponent],
      providers: [
        {
          provide: AnalysisSettingsService,
          useValue: {
            settings: signal({ profiles: DEFAULT_ANALYSIS_PROFILES }),
            load: () => Promise.resolve(),
            updateProfile,
          },
        },
        {
          provide: EngineAssetManagerService,
          useValue: {
            load: () => Promise.resolve(),
            state: () => ({
              installed: false,
              downloading: false,
              downloadedBytes: 0,
              totalBytes: 0,
              activeLeases: 0,
              error: null,
            }),
            install: vi.fn(),
            remove: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AnalysisEngineSettingsComponent);
    fixture.componentRef.setInput('workflow', 'game-review');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>('.machine-plate')!;

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();

    host.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]!.click();
    expect(updateProfile).toHaveBeenCalledWith('game-review', {
      engineId: 'stockfish-18-lite',
    });
  });
});
