import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ChessgroundBoardComponent } from '../../shared/chess/chessground-board/chessground-board.component';
import type { Config } from '@lichess-org/chessground/config';

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, ChessgroundBoardComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  protected readonly previewConfig: Config = {
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    viewOnly: true,
    lastMove: ['b8', 'c6'],
    drawable: { enabled: false, visible: false },
    animation: { enabled: false },
  };
  protected readonly onboarding = inject(OnboardingService);
}
