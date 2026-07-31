import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browserOutput = resolve('dist/leal-chess/browser');
const home = read('index.html');
const about = read('about/index.html');

verifyPage(home, {
  title: 'LealChess | Local Chess Analysis & Training',
  description:
    'Play Stockfish, import Chess.com and Lichess games, analyze locally, and turn mistakes into focused chess practice—all privately in your browser.',
  canonical: 'https://lealchess.com/',
});
verifyPage(about, {
  title: 'About LealChess | Local-First Chess Training',
  description:
    'Learn how LealChess provides local-first chess play, game analysis, and focused practice without accounts, cloud storage, or tracking.',
  canonical: 'https://lealchess.com/about',
});

assertIncludes(home, 'Play Stockfish, study games from Chess.com and Lichess');
assertIncludes(home, '"@type":"WebApplication"');
assertIncludes(about, '>About</h1>');

for (const asset of ['robots.txt', 'sitemap.xml', '_redirects', '_headers', 'social-preview.png']) {
  assert(existsSync(resolve(browserOutput, asset)), `Missing deployment asset: ${asset}`);
}

const sitemap = read('sitemap.xml');
assertIncludes(sitemap, '<loc>https://lealchess.com/</loc>');
assertIncludes(sitemap, '<loc>https://lealchess.com/about</loc>');
for (const privateRoute of ['/play', '/learn', '/explorer', '/settings', '/learn/review']) {
  assert(
    !sitemap.includes(`lealchess.com${privateRoute}`),
    `Private route leaked into sitemap: ${privateRoute}`,
  );
}

const redirects = read('_redirects');
assertIncludes(redirects, '/help');
assertIncludes(redirects, '/learn/review/*');
assert(
  !redirects.split(/\r?\n/u).some((line) => line.trimStart().startsWith('/* ')),
  'Catch-all rewrite would turn unknown URLs into soft 404s',
);

const headers = read('_headers');
assertIncludes(headers, 'X-Robots-Tag: noindex, nofollow');

console.log('SEO build artifacts verified.');

function verifyPage(html, expected) {
  assertIncludes(html, `<title>${escapeHtml(expected.title)}</title>`);
  assertAttribute(html, 'meta', 'name', 'description', 'content', expected.description);
  assertAttribute(html, 'meta', 'name', 'robots', 'content', 'index, follow');
  assertAttribute(html, 'link', 'rel', 'canonical', 'href', expected.canonical);
  assertAttribute(html, 'meta', 'property', 'og:url', 'content', expected.canonical);
  assertAttribute(
    html,
    'meta',
    'property',
    'og:image',
    'content',
    'https://lealchess.com/social-preview.png',
  );
  assertAttribute(html, 'meta', 'name', 'twitter:card', 'content', 'summary_large_image');
}

function assertAttribute(html, tagName, key, keyValue, attribute, expectedValue) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
  const tag = tags.find((candidate) => attributeValue(candidate, key) === keyValue);
  assert(tag, `Missing <${tagName}> with ${key}="${keyValue}"`);
  assert(
    attributeValue(tag, attribute) === expectedValue,
    `Expected ${attribute}="${expectedValue}" on ${key}="${keyValue}"`,
  );
}

function attributeValue(tag, name) {
  const value = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1];
  return value?.replaceAll('&amp;', '&');
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;');
}

function read(relativePath) {
  return readFileSync(resolve(browserOutput, relativePath), 'utf8');
}

function assertIncludes(value, expected) {
  assert(value.includes(expected), `Expected build output to include: ${expected}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
