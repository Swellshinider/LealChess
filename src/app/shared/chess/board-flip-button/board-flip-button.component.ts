import { ChangeDetectionStrategy, Component, output } from '@angular/core';

@Component({
  selector: 'app-board-flip-button',
  templateUrl: './board-flip-button.component.html',
  styleUrl: './board-flip-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardFlipButtonComponent {
  readonly flipRequested = output<void>();
}
