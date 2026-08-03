import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService } from '../../../core/onboarding/onboarding.service';
import { SettingsPersistenceService } from '../../../core/persistence/settings-persistence.service';
import { CoachImportService } from '../data/coach-import.service';
import { ImportPanelComponent } from './import-panel.component';

// ngOnInit awaits plain promises that zoneless change detection does not track,
// so fixture.whenStable() cannot be relied on to wait for it. A macrotask hop
// guarantees the whole pending microtask queue (including chained `await`s) has
// drained first.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const IDLE_STATUSES = {
  'chess-com': {
    platform: 'chess-com' as const,
    state: 'idle' as const,
    message: 'Add a username to import Chess.com games.',
    counts: { added: 0, duplicates: 0, unavailable: 0, skipped: 0 },
    canRetry: false,
  },
  lichess: {
    platform: 'lichess' as const,
    state: 'idle' as const,
    message: 'Add a username to import Lichess games.',
    counts: { added: 0, duplicates: 0, unavailable: 0, skipped: 0 },
    canRetry: false,
  },
};

function configureImportPanelTestBed(options: {
  readonly importSpy?: ReturnType<typeof vi.fn>;
  readonly importPreferences?: {
    chessComUsername: string;
    lichessUsername: string;
    maxGames: number;
    speed: 'any';
  };
}) {
  const importSpy = options.importSpy ?? vi.fn(() => Promise.resolve());
  const importPreferences =
    options.importPreferences ??
    ({ chessComUsername: '', lichessUsername: '', maxGames: 20, speed: 'any' } as const);
  return {
    importSpy,
    testBed: TestBed.configureTestingModule({
      imports: [ImportPanelComponent],
      providers: [
        {
          provide: CoachImportService,
          useValue: {
            initialize: () => Promise.resolve(),
            profiles: signal([]),
            games: signal([]),
            hasFailures: signal(false),
            loading: signal(false),
            statuses: signal(IDLE_STATUSES),
            import: importSpy,
            retry: vi.fn(() => Promise.resolve()),
          },
        },
        {
          provide: SettingsPersistenceService,
          useValue: {
            importPreferences: () => Promise.resolve(importPreferences),
            saveImportPreferences: vi.fn(() => Promise.resolve()),
          },
        },
        {
          provide: OnboardingService,
          useValue: { active: signal(false), step: signal(undefined) },
        },
      ],
    }),
  };
}

describe('ImportPanelComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => TestBed.resetTestingModule());

  it('rejects a submit with both usernames blank and does not start an import', async () => {
    const { importSpy, testBed } = configureImportPanelTestBed({});
    await testBed.compileComponents();
    const fixture = TestBed.createComponent(ImportPanelComponent);
    fixture.detectChanges();
    await flushMicrotasks();

    const component = fixture.componentInstance;
    await component['importGames']();

    expect(component['usernameError']()).toBe(true);
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('forwards the raw form value to CoachImportService.import on a valid submit', async () => {
    const { importSpy, testBed } = configureImportPanelTestBed({});
    await testBed.compileComponents();
    const fixture = TestBed.createComponent(ImportPanelComponent);
    fixture.detectChanges();
    await flushMicrotasks();

    const component = fixture.componentInstance;
    component['importForm'].controls.chessComUsername.setValue('Learner');
    await component['importGames']();

    expect(component['usernameError']()).toBe(false);
    expect(importSpy).toHaveBeenCalledWith({
      chessComUsername: 'Learner',
      lichessUsername: '',
      maxGames: 20,
      speed: 'any',
    });
  });

  it('repopulates the form from saved import preferences on init', async () => {
    const { testBed } = configureImportPanelTestBed({
      importPreferences: {
        chessComUsername: 'Saved',
        lichessUsername: 'AlsoSaved',
        maxGames: 42,
        speed: 'any',
      },
    });
    await testBed.compileComponents();
    const fixture = TestBed.createComponent(ImportPanelComponent);
    fixture.detectChanges();
    await flushMicrotasks();

    const component = fixture.componentInstance;
    expect(component['importForm'].getRawValue()).toEqual({
      chessComUsername: 'Saved',
      lichessUsername: 'AlsoSaved',
      maxGames: 42,
      speed: 'any',
    });
  });
});
