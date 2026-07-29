import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing-page.component').then(
        (module) => module.LandingPageComponent,
      ),
    title: 'LealChess | Play. Study. Improve.',
  },
  {
    path: 'play',
    loadComponent: () =>
      import('./features/game/play-page/play-page.component').then(
        (module) => module.PlayPageComponent,
      ),
    title: 'Play | LealChess',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings-page.component').then(
        (module) => module.SettingsPageComponent,
      ),
    title: 'Settings | LealChess',
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
    path: 'explorer',
    loadComponent: () =>
      import('./features/explorer/explorer-page.component').then(
        (module) => module.ExplorerPageComponent,
      ),
    title: 'Explorer | LealChess',
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/about/about-page.component').then((module) => module.AboutPageComponent),
    title: 'About | LealChess',
  },
  {
    path: 'help',
    redirectTo: 'about',
    pathMatch: 'full',
  },
  {
    path: 'learn/review/:platform/:gameId',
    loadComponent: () =>
      import('./features/coach/review-page/review-page.component').then(
        (module) => module.ReviewPageComponent,
      ),
    title: 'Review game | LealChess',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found-page.component').then(
        (module) => module.NotFoundPageComponent,
      ),
    title: 'Page not found | LealChess',
  },
];
