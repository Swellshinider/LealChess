import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import type { AfterViewInit, OnDestroy } from '@angular/core';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';

@Component({
  selector: 'app-chessground-board',
  templateUrl: './chessground-board.component.html',
  styleUrl: './chessground-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'boardClick.emit($event)',
  },
})
export class ChessgroundBoardComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private api: Api | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  readonly initialConfig = input.required<Config>();
  readonly boardClick = output<MouseEvent>();

  ngAfterViewInit(): void {
    this.api = Chessground(this.host.nativeElement, this.initialConfig());
    this.resizeObserver = new ResizeObserver(() => this.scheduleRedraw());
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeObserver?.disconnect();
    this.api?.destroy();
  }

  set(config: Config): void {
    this.api?.set(config);
    this.redraw();
  }

  cancelMove(): void {
    this.api?.cancelMove();
  }

  bounds(): DOMRect {
    return this.host.nativeElement.getBoundingClientRect();
  }

  private scheduleRedraw(): void {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.redraw();
      this.resizeFrame = null;
    });
  }

  private redraw(): void {
    this.api?.state.dom.bounds.clear();
    this.api?.redrawAll();
  }
}
