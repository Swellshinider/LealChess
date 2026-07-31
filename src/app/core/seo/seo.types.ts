export const SEO_ROUTE_DATA = 'seo';

export interface SeoRouteData {
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: '/' | '/about';
  readonly index: true;
}

export const HOME_SEO: SeoRouteData = {
  title: 'LealChess | Local Chess Analysis & Training',
  description:
    'Play Stockfish, import Chess.com and Lichess games, analyze locally, and turn mistakes into focused chess practice—all privately in your browser.',
  canonicalPath: '/',
  index: true,
};

export const ABOUT_SEO: SeoRouteData = {
  title: 'About LealChess | Local-First Chess Training',
  description:
    'Learn how LealChess provides local-first chess play, game analysis, and focused practice without accounts, cloud storage, or tracking.',
  canonicalPath: '/about',
  index: true,
};
