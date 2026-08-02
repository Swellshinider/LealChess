import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeybindingAction } from '../../core/keyboard/keybindings';
import { PERSISTENCE_PORT } from '../../core/persistence/persistence.types';
import { SettingsPersistenceService } from '../../core/persistence/settings-persistence.service';
import { CoachImportService } from '../coach/data/coach-import.service';
import { SettingsPageComponent, formatStorageUsage } from './settings-page.component';

class TestableSettingsPageComponent extends SettingsPageComponent {
  updateConfirmationPreference(checked: boolean): void {
    const input = document.createElement('input');
    input.checked = checked;
    this.updateBoolean('confirmVariationRemoval', { target: input } as unknown as Event);
  }

  beginCapture(action: KeybindingAction): void {
    this.beginKeybindingCapture(action);
  }

  capture(action: KeybindingAction, event: KeyboardEvent): void {
    this.captureKeybinding(action, event);
  }

  reset(action: KeybindingAction): void {
    this.resetKeybinding(action);
  }

  shortcut(action: KeybindingAction): string {
    return this.keybindingLabel(action);
  }

  error(): string | null {
    return this.keybindingError();
  }
}

describe('formatStorageUsage', () => {
  it('describes loading and unavailable estimates', () => {
    expect(formatStorageUsage(undefined)).toBe('Calculating…');
    expect(formatStorageUsage(null)).toBe('Unavailable');
  });

  it('formats bytes and binary unit boundaries', () => {
    expect(formatStorageUsage(0)).toBe('0 B');
    expect(formatStorageUsage(1023)).toBe('1023 B');
    expect(formatStorageUsage(1024)).toBe('1 KB');
    expect(formatStorageUsage(12.5 * 1024 * 1024)).toBe('12.5 MB');
    expect(formatStorageUsage(2 * 1024 * 1024 * 1024)).toBe('2 GB');
  });
});

describe('SettingsPageComponent keybindings', () => {
  const savePreferences = vi.fn();

  beforeEach(() => {
    savePreferences.mockReset();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PERSISTENCE_PORT,
          useValue: { savePreferences },
        },
        { provide: SettingsPersistenceService, useValue: {} },
        { provide: CoachImportService, useValue: {} },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('captures and immediately saves a custom shortcut', () => {
    const component = TestBed.runInInjectionContext(() => new TestableSettingsPageComponent());
    component.beginCapture('previousMove');
    component.capture('previousMove', new KeyboardEvent('keydown', { key: 'p' }));

    expect(component.shortcut('previousMove')).toBe('P');
    expect(savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        keybindings: expect.objectContaining({
          previousMove: { key: 'p', ctrl: false, alt: false, shift: false, meta: false },
        }),
      }),
    );
  });

  it('rejects duplicate shortcuts and resets custom values', () => {
    const component = TestBed.runInInjectionContext(() => new TestableSettingsPageComponent());
    component.beginCapture('previousMove');
    component.capture('previousMove', new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.error()).toBe('Already assigned to Next move.');

    component.capture('previousMove', new KeyboardEvent('keydown', { key: 'p' }));
    component.reset('previousMove');
    expect(component.shortcut('previousMove')).toBe('←');
  });

  it('immediately saves the variation removal confirmation preference', () => {
    const component = TestBed.runInInjectionContext(() => new TestableSettingsPageComponent());

    component.updateConfirmationPreference(false);

    expect(savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ confirmVariationRemoval: false }),
    );
  });
});
