import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/game/play-page/play-page.component').then(
        (module) => module.PlayPageComponent,
      ),
    title: 'Play | LealChess',
  },
  {
    path: 'learn',
    loadComponent: () =>
      import('./features/coach/learn-page/learn-page.component').then(
        (module) => module.LearnPageComponent,
      ),
    title: 'Learn | LealChess',
  },
  {
    path: 'learn/review/:platform/:gameId',
    loadComponent: () =>
      import('./features/coach/review-page/review-page.component').then(
        (module) => module.ReviewPageComponent,
      ),
    title: 'Review game | LealChess',
  },
  { path: '**', redirectTo: '' },
];
