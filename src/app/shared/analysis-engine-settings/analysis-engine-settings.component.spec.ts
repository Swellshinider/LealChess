import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANALYSIS_PROFILES } from '../../core/engine/analysis-profiles';
import { AnalysisSettingsService } from '../../core/engine/analysis-settings.service';
import { EngineAssetManagerService } from '../../core/engine/engine-asset-manager.service';
import { AnalysisEngineSettingsComponent } from './analysis-engine-settings.component';

function configureEngineSettingsTestBed(updateProfile = vi.fn(() => Promise.resolve())) {
  return TestBed.configureTestingModule({
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
  });
}

describe('AnalysisEngineSettingsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens an accessible profile dialog and persists a selected engine immediately', async () => {
    const updateProfile = vi.fn(() => Promise.resolve());
    await configureEngineSettingsTestBed(updateProfile).compileComponents();
    const fixture = TestBed.createComponent(AnalysisEngineSettingsComponent);
    fixture.componentRef.setInput('workflow', 'game-review');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Configure Game review engine"]',
    )!;

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

  it('renders a compact icon-only trigger with no visible text by default', async () => {
    await configureEngineSettingsTestBed().compileComponents();
    const fixture = TestBed.createComponent(AnalysisEngineSettingsComponent);
    fixture.componentRef.setInput('workflow', 'explorer');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>('.engine-config')!;

    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-label')).toBe('Configure Explorer engine');
    expect(trigger.textContent?.trim()).toBe('');
    expect(host.querySelector('.engine-row')).toBeNull();
  });

  it('renders a list row with the profile summary when not compact', async () => {
    await configureEngineSettingsTestBed().compileComponents();
    const fixture = TestBed.createComponent(AnalysisEngineSettingsComponent);
    fixture.componentRef.setInput('workflow', 'practice');
    fixture.componentRef.setInput('compact', false);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector<HTMLElement>('.engine-row')!;
    const configureButton = row.querySelector<HTMLButtonElement>(
      '[aria-label="Configure Practice engine"]',
    )!;

    expect(row).toBeTruthy();
    expect(row.querySelector('strong')?.textContent).toBe('Practice');
    expect(row.querySelector('small')?.textContent).toContain('lines');
    expect(configureButton.textContent?.trim()).toBe('Configure');
    expect(host.querySelector('.engine-config')).toBeNull();
  });
});
