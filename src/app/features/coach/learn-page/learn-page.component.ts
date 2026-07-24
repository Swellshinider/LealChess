import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { CoachImportService } from '../data/coach-import.service';
import type { ImportedGame, SpeedFilter } from '../domain/coach.types';

@Component({
  selector: 'app-learn-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './learn-page.component.html',
  styleUrl: './learn-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnPageComponent implements OnInit {
  protected readonly coach = inject(CoachImportService);
  protected readonly form = new FormGroup({
    chessComUsername: new FormControl('', { nonNullable: true }),
    lichessUsername: new FormControl('', { nonNullable: true }),
    maxGames: new FormControl(20, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(100)],
    }),
    speed: new FormControl<SpeedFilter>('any', { nonNullable: true }),
  });

  async ngOnInit(): Promise<void> {
    await this.coach.initialize();
    for (const profile of this.coach.profiles()) {
      this.form.controls[
        profile.platform === 'chess-com' ? 'chessComUsername' : 'lichessUsername'
      ].setValue(profile.username);
    }
  }

  protected async importGames(): Promise<void> {
    if (this.form.invalid || this.coach.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    await this.coach.import(this.form.getRawValue());
  }

  protected learnerColor(game: ImportedGame): ChessColor | undefined {
    const profile = this.coach.profiles().find((item) => item.platform === game.platform);
    if (!profile) return undefined;
    return game.white.username.toLowerCase() === profile.username.toLowerCase()
      ? 'white'
      : game.black.username.toLowerCase() === profile.username.toLowerCase()
        ? 'black'
        : undefined;
  }

  protected resultLabel(game: ImportedGame): string {
    const color = this.learnerColor(game);
    if (!color) return game.result;
    if (game.result === '1/2-1/2' || game.result === '½-½' || game.result === '*') return 'Draw';
    return (game.result === '1-0') === (color === 'white') ? 'Win' : 'Loss';
  }

  protected reviewLink(game: ImportedGame): string[] {
    return ['/learn/review', game.platform, game.platformGameId];
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? 'Unknown date'
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  }
}
