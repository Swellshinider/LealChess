import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplorerAnalysisPanelComponent } from './explorer-analysis-panel.component';
import { createExplorerSession, updateExplorerNode } from './explorer-session';
import type { ExplorerCandidateLine, ExplorerSession } from './explorer.types';

describe('ExplorerAnalysisPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('previews candidates on hover and focus, then selects their first move', async () => {
    const line = candidate();
    const fixture = await render(sessionWith({ candidates: [line], candidateDepth: 14 }));
    const previewed = vi.fn();
    const requested = vi.fn();
    fixture.componentInstance.candidatePreviewed.subscribe(previewed);
    fixture.componentInstance.candidateRequested.subscribe(requested);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Play engine candidate 1: e4"]',
    )!;

    button.dispatchEvent(new Event('pointerenter'));
    button.dispatchEvent(new Event('pointerleave'));
    button.focus();
    button.blur();
    button.click();

    expect(previewed.mock.calls).toEqual([[line], [null], [line], [null], [null]]);
    expect(requested).toHaveBeenCalledWith(line.firstMove);
  });

  it('emits node selection and exposes analysis recovery', async () => {
    const fixture = await render(sessionWith({ analysisError: 'Worker unavailable' }));
    const selected = vi.fn();
    const retried = vi.fn();
    fixture.componentInstance.nodeRequested.subscribe(selected);
    fixture.componentInstance.retryRequested.subscribe(retried);
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('.start-position button')!.click();
    host.querySelector<HTMLButtonElement>('.analysis-error button')!.click();

    expect(selected).toHaveBeenCalledWith('root');
    expect(retried).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Worker unavailable');
  });

  it('emits batch pause and resume requests', async () => {
    const paused = vi.fn();
    const resumed = vi.fn();
    const running = await render({
      ...createExplorerSession(),
      batch: { status: 'running', completed: 1, total: 3 },
    });
    running.componentInstance.pauseRequested.subscribe(paused);
    [...(running.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Pause PGN'))!
      .click();
    expect(paused).toHaveBeenCalledOnce();

    running.componentRef.setInput('session', {
      ...running.componentInstance.session(),
      batch: { status: 'paused', completed: 1, total: 3 },
    });
    running.detectChanges();
    running.componentInstance.resumeRequested.subscribe(resumed);
    [...(running.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Resume PGN'))!
      .click();
    expect(resumed).toHaveBeenCalledOnce();
  });
});

async function render(session: ExplorerSession) {
  await TestBed.configureTestingModule({
    imports: [ExplorerAnalysisPanelComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(ExplorerAnalysisPanelComponent);
  fixture.componentRef.setInput('session', session);
  fixture.componentRef.setInput('turn', 'white');
  fixture.componentRef.setInput('boardTheme', 'tournament');
  fixture.componentRef.setInput('analysisActive', false);
  fixture.componentRef.setInput('analysisMessage', 'Analysis ready');
  fixture.detectChanges();
  return fixture;
}

function sessionWith(changes: Partial<ExplorerSession['nodes']['root']>): ExplorerSession {
  const session = createExplorerSession();
  return updateExplorerNode(session, session.rootId, changes);
}

function candidate(): ExplorerCandidateLine {
  return {
    rank: 1,
    evaluation: { depth: 14, score: { kind: 'centipawn', value: 28 } },
    firstMove: { from: 'e2', to: 'e4' },
    san: ['e4', 'e5'],
  };
}
