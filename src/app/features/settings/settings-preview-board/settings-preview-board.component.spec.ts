import { TestBed } from '@angular/core/testing';
import type { Config } from '@lichess-org/chessground/config';
import type { Api } from '@lichess-org/chessground/api';
import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundService } from '../../../core/sound/sound.service';
import { SettingsPreviewBoardComponent } from './settings-preview-board.component';

const chessgroundMock = vi.hoisted(() => ({
  config: null as Config | null,
  api: {
    set: vi.fn(),
    redrawAll: vi.fn(),
    destroy: vi.fn(),
    state: { dom: { bounds: { clear: vi.fn() } } },
  },
}));

vi.mock('@lichess-org/chessground', () => ({
  Chessground: vi.fn((_element: HTMLElement, config: Config) => {
    chessgroundMock.config = config;
    return chessgroundMock.api as unknown as Api;
  }),
}));

describe('SettingsPreviewBoardComponent', () => {
  const sound = {
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
    unlock: vi.fn(),
    play: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    chessgroundMock.config = null;
    Object.values(chessgroundMock.api).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        value.mockClear();
      }
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('plays legal moves for both colors, previews feedback, and resets', async () => {
    const fixture = await createFixture(sound);
    const afterMove = chessgroundMock.config?.movable?.events?.after;
    expect(afterMove).toBeTypeOf('function');

    afterMove?.('e2', 'e4', { premove: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Black to move');
    expect(sound.play).toHaveBeenCalledWith('move');

    afterMove?.('e7', 'e5', { premove: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('White to move');

    const host = fixture.nativeElement as HTMLElement;
    const reset = host.querySelector<HTMLButtonElement>('button')!;
    reset.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('White to move');
    expect(lastBoardConfig().lastMove).toBeUndefined();
  });

  it('rejects illegal input and reacts to orientation, destinations, and sound settings', async () => {
    const fixture = await createFixture(sound);
    const startingFen = lastBoardConfig().fen;
    chessgroundMock.config?.movable?.events?.after?.('e2', 'e5', { premove: false });
    expect(lastBoardConfig().fen).toBe(startingFen);

    fixture.componentRef.setInput('orientation', 'black');
    fixture.componentRef.setInput('showLegalMoves', false);
    fixture.componentRef.setInput('soundEnabled', false);
    fixture.componentRef.setInput('soundVolume', 35);
    fixture.detectChanges();

    expect(lastBoardConfig().orientation).toBe('black');
    expect(lastBoardConfig().movable?.showDests).toBe(false);
    expect(sound.setEnabled).toHaveBeenLastCalledWith(false);
    expect(sound.setVolume).toHaveBeenLastCalledWith(35);
  });

  it('auto-promotes preview pawns to queens', async () => {
    const fixture = await createFixture(sound);
    const component = fixture.componentInstance as unknown as { chess: Chess };
    component.chess = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

    chessgroundMock.config?.movable?.events?.after?.('a7', 'a8', { premove: false });
    fixture.detectChanges();

    expect(lastBoardConfig().fen).toMatch(/^Q3k3\//);
    expect(sound.play).toHaveBeenCalledWith('promotion');
  });
});

async function createFixture(sound: {
  setEnabled: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  unlock: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
}) {
  await TestBed.configureTestingModule({
    imports: [SettingsPreviewBoardComponent],
    providers: [{ provide: SoundService, useValue: sound }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SettingsPreviewBoardComponent);
  fixture.componentRef.setInput('boardTheme', 'tournament');
  fixture.componentRef.setInput('orientation', 'white');
  fixture.componentRef.setInput('showLegalMoves', true);
  fixture.componentRef.setInput('soundEnabled', true);
  fixture.componentRef.setInput('soundVolume', 100);
  fixture.detectChanges();
  return fixture;
}

function lastBoardConfig(): Config {
  const calls = chessgroundMock.api.set.mock.calls;
  return calls[calls.length - 1]?.[0] as Config;
}
