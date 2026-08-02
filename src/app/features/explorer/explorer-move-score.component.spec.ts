import { TestBed } from '@angular/core/testing';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_MOVE_TREE_NAVIGATION,
  jumpToEndNodeId,
  jumpToStartNodeId,
  rememberMoveTreeSelection,
} from '../../shared/chess/move-tree-navigation';
import {
  commitExplorerMove,
  createExplorerSession,
  createPgnExplorerSession,
  selectExplorerNode,
} from './explorer-session';
import {
  ExplorerMoveScoreComponent,
  explorerPrimaryChildId,
  explorerScoreEntries,
} from './explorer-move-score.component';

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

describe('Explorer move score', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('prefers imported children and otherwise uses the first child as the primary line', () => {
    let session = createExplorerSession();
    const manual = commitExplorerMove(session, { from: 'd2', to: 'd4' });
    session = selectExplorerNode(manual.session, session.rootId);
    const imported = commitExplorerMove(session, { from: 'e2', to: 'e4' }, 'imported');

    expect(explorerPrimaryChildId(imported.session, imported.session.nodes['root']!)).toBe(
      imported.node.id,
    );
    expect(explorerScoreEntries(manual.session)[0]).toMatchObject({
      kind: 'mainline',
      node: { san: 'd4' },
    });
  });

  it('formats sibling continuations as nested variations', () => {
    let session = importedSession();
    const e4 = Object.values(session.nodes).find((node) => node.san === 'e4')!;
    session = selectExplorerNode(session, e4.id);
    const c5 = commitExplorerMove(session, { from: 'c7', to: 'c5' });
    const nf3 = commitExplorerMove(c5.session, { from: 'g1', to: 'f3' });
    session = selectExplorerNode(nf3.session, c5.node.id);
    session = commitExplorerMove(session, { from: 'd2', to: 'd4' }).session;

    const variations = explorerScoreEntries(session).filter((entry) => entry.kind === 'variation');
    expect(variations).toMatchObject([
      { variationDepth: 1, nodes: [{ san: 'c5' }, { san: 'Nf3' }] },
      { variationDepth: 2, nodes: [{ san: 'd4' }] },
    ]);
  });

  it('marks the current node and its ancestry as the selected path', async () => {
    const session = importedSession();
    await TestBed.configureTestingModule({
      imports: [ExplorerMoveScoreComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExplorerMoveScoreComponent);
    const selected = vi.fn();
    fixture.componentInstance.nodeSelected.subscribe(selected);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('orientation', 'white');
    fixture.componentRef.setInput('boardTheme', 'tournament');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('.selected-path')).toHaveLength(3);
    const current = host.querySelector<HTMLButtonElement>('button.current')!;
    current.click();
    expect(selected).toHaveBeenCalledWith(session.selectedNodeId);
  });

  it('previews primary-line and variation positions on pointer and keyboard focus', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === '(hover: hover)' }) as MediaQueryList),
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    let session = importedSession();
    const e4 = Object.values(session.nodes).find((node) => node.san === 'e4')!;
    session = selectExplorerNode(session, e4.id);
    session = commitExplorerMove(session, { from: 'c7', to: 'c5' }).session;
    await TestBed.configureTestingModule({
      imports: [ExplorerMoveScoreComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExplorerMoveScoreComponent);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('orientation', 'black');
    fixture.componentRef.setInput('boardTheme', 'classic');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const mainline = host.querySelector<HTMLButtonElement>('.score > li .move')!;

    mainline.dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(host.querySelector('.move-preview')?.textContent).toContain('e4');
    expect(host.querySelector('.move-preview')?.getAttribute('data-board-theme')).toBe('classic');
    expect(chessgroundMock.config).toMatchObject({ orientation: 'black' });

    mainline.dispatchEvent(new Event('pointerleave'));
    fixture.detectChanges();
    expect(host.querySelector('.move-preview')).toBeNull();

    const variation = host.querySelector<HTMLButtonElement>('button[aria-label="c5, variation"]')!;
    variation.focus();
    fixture.detectChanges();
    expect(host.querySelector('.move-preview')?.textContent).toContain('c5');

    variation.blur();
    fixture.detectChanges();
    expect(host.querySelector('.move-preview')).toBeNull();
  });

  it('keeps First and Last branch-aware', () => {
    let session = importedSession();
    const e4 = Object.values(session.nodes).find((node) => node.san === 'e4')!;
    session = selectExplorerNode(session, e4.id);
    const c5 = commitExplorerMove(session, { from: 'c7', to: 'c5' });
    const nf3 = commitExplorerMove(c5.session, { from: 'g1', to: 'f3' });
    let navigation = rememberMoveTreeSelection(
      nf3.session,
      nf3.node.id,
      EMPTY_MOVE_TREE_NAVIGATION,
    );
    const first = jumpToStartNodeId(nf3.session, nf3.node.id, navigation);
    navigation = first.state;
    const last = jumpToEndNodeId(nf3.session, first.nodeId, navigation);

    expect(first.nodeId).toBe(e4.id);
    expect(last.nodeId).toBe(nf3.node.id);
  });
});

function importedSession() {
  const chess = new Chess();
  const moves = ['e4', 'e5'].map((san) => {
    const before = chess.fen();
    const move = chess.move(san);
    return {
      move: { from: move.from, to: move.to },
      san: move.san,
      color: move.color === 'w' ? ('white' as const) : ('black' as const),
      fenBefore: before,
      fenAfter: chess.fen(),
    };
  });
  return createPgnExplorerSession(new Chess().fen(), moves);
}
