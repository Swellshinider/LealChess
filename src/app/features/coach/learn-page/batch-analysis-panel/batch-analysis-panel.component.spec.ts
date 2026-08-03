import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatchAnalysisState } from '../../analysis/batch-analysis.service';
import { BatchAnalysisService } from '../../analysis/batch-analysis.service';
import { CoachImportService } from '../../data/coach-import.service';
import type { ImportedGame } from '../../domain/coach.types';
import { BatchAnalysisPanelComponent } from './batch-analysis-panel.component';

const IDLE_STATE: BatchAnalysisState = {
  phase: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
  currentIndex: 0,
  currentGameKey: null,
  currentMoves: { completed: 0, total: 0 },
  error: null,
};

function game(key: string): ImportedGame {
  return {
    key,
    platform: 'lichess',
    platformGameId: key,
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner' },
    black: { username: 'Opponent' },
    result: '1-0',
    speed: 'rapid',
    timeControl: '600',
    rated: true,
    endTime: '2026-07-24T12:00:00.000Z',
    moves: [
      {
        ply: 1,
        color: 'white',
        san: 'e4',
        from: 'e2',
        to: 'e4',
        uci: 'e2e4',
        fenBefore: 'start',
        fenAfter: 'after',
      },
    ],
    parseStatus: 'ready',
    profileKeys: ['lichess:learner'],
    firstImportedAt: '',
    lastImportedAt: '',
  };
}

function configureTestBed(options: {
  games?: ImportedGame[];
  state?: BatchAnalysisState;
  progress?: number;
  active?: boolean;
  startSpy?: ReturnType<typeof vi.fn>;
  cancelSpy?: ReturnType<typeof vi.fn>;
  resetSpy?: ReturnType<typeof vi.fn>;
}) {
  const startSpy = options.startSpy ?? vi.fn();
  const cancelSpy = options.cancelSpy ?? vi.fn();
  const resetSpy = options.resetSpy ?? vi.fn();
  TestBed.configureTestingModule({
    imports: [BatchAnalysisPanelComponent],
    providers: [
      {
        provide: CoachImportService,
        useValue: {
          games: signal(options.games ?? [game('lichess:one')]),
          profiles: signal([
            {
              platform: 'lichess',
              username: 'Learner',
              displayName: 'Learner',
              profileUrl: '',
              updatedAt: '',
            },
          ]),
          analyses: signal([]),
          refreshAnalyses: vi.fn(() => Promise.resolve()),
        },
      },
      {
        provide: BatchAnalysisService,
        useValue: {
          state: signal(options.state ?? IDLE_STATE),
          progress: signal(options.progress ?? 0),
          active: signal(options.active ?? false),
          start: startSpy,
          cancel: cancelSpy,
          reset: resetSpy,
        },
      },
    ],
  });
  return { startSpy, cancelSpy, resetSpy };
}

describe('BatchAnalysisPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('submits the entered count to BatchAnalysisService.start', async () => {
    const { startSpy } = configureTestBed({});
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(BatchAnalysisPanelComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component['batchForm'].controls.count.setValue(5);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(startSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
      5,
    );
  });

  it('disables the submit button when no games are eligible', async () => {
    configureTestBed({
      games: [
        {
          ...game('lichess:invalid'),
          parseStatus: 'invalid-pgn',
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(BatchAnalysisPanelComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(button?.disabled).toBe(true);
  });

  it('shows progress with the correct accessible attributes and cancels an active run', async () => {
    const { cancelSpy } = configureTestBed({
      state: {
        ...IDLE_STATE,
        phase: 'running',
        total: 3,
        currentIndex: 2,
        currentMoves: { completed: 4, total: 10 },
      },
      progress: 42,
      active: true,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(BatchAnalysisPanelComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const progressBar = host.querySelector('[role="progressbar"]');
    expect(progressBar?.getAttribute('aria-valuenow')).toBe('42');
    expect(progressBar?.getAttribute('aria-valuemax')).toBe('100');
    expect(host.querySelector('form')).toBeNull();

    const cancelButton = host.querySelector<HTMLButtonElement>('button');
    cancelButton!.click();
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it('shows a dismissible summary once the run completes', async () => {
    const { resetSpy } = configureTestBed({
      state: { ...IDLE_STATE, phase: 'complete', total: 2, completed: 1, failed: 1 },
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(BatchAnalysisPanelComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    const dismissButton = host.querySelector<HTMLButtonElement>('button');
    dismissButton!.click();
    expect(resetSpy).toHaveBeenCalledOnce();
  });

  it('surfaces a fatal engine error as an alert', async () => {
    configureTestBed({
      state: { ...IDLE_STATE, phase: 'error', error: 'Stockfish analysis could not be started.' },
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(BatchAnalysisPanelComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Stockfish analysis could not be started.');
  });
});
