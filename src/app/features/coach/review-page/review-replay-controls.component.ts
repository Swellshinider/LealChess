import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-review-replay-controls',
  templateUrl: './review-replay-controls.component.html',
  styleUrl: './review-replay-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewReplayControlsComponent {
  readonly currentPly = input.required<number>();
  readonly totalPlies = input.required<number>();
  readonly plyRequested = output<number>();

  protected requestPly(ply: number): void {
    this.plyRequested.emit(Math.max(0, Math.min(ply, this.totalPlies())));
  }
}
