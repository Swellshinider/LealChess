// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

const FEATURES = [
  'about',
  'coach',
  'explorer',
  'game',
  'landing',
  'language',
  'not-found',
  'onboarding',
  'settings',
];

/**
 * Features allowed to import a named sibling, with the reason.
 *
 * Play converts a finished local game into Coach's `ImportedGame` and saves it so the player can
 * review it. Removing this edge means moving the persisted game record types into core, which owns
 * the store schema already. Until then the exception is listed here so it stays visible and cannot
 * grow silently.
 */
const ALLOWED_SIBLING_IMPORTS = { game: ['coach'] };

const LAYERING = 'Dependencies flow features -> core -> shared. See docs/ARCHITECTURE.md.';

/**
 * Cross-layer imports are always relative, so anchoring on `../` keeps bare package specifiers
 * out: `../**\/core` cannot match `@angular/core`.
 */
const upwardTo = (segment) => [`../**/${segment}`, `../**/${segment}/**`];

/**
 * A sibling feature is reached without a `features/` segment (`../coach/...`,
 * `../../explorer/...`), so the depth is enumerated. A middle `**` is deliberately not used:
 * `../**\/game/**` would also match `../../core/game/game.types`.
 */
const siblingFeature = (name) => [
  `**/features/${name}`,
  `**/features/${name}/**`,
  ...[1, 2, 3, 4].flatMap((depth) => {
    const up = '../'.repeat(depth);
    return [`${up}${name}`, `${up}${name}/**`];
  }),
];

const forbid = (group, message) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns: [{ group, message }] }],
});

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...angular.configs.tsRecommended,
  {
    files: ['src/**/*.ts'],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Component'] }],
      '@angular-eslint/directive-class-suffix': ['error', { suffixes: ['Directive'] }],
      '@angular-eslint/prefer-standalone': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Layering. Specs are deliberately included: they are where boundary cheats start.
  {
    files: ['src/app/core/**/*.ts'],
    rules: forbid(upwardTo('features'), `core must not import features. ${LAYERING}`),
  },
  {
    files: ['src/app/shared/**/*.ts'],
    rules: forbid(
      [...upwardTo('features'), ...upwardTo('core')],
      `shared must not import core or features. ${LAYERING}`,
    ),
  },
  ...FEATURES.map((feature) => {
    const allowed = ALLOWED_SIBLING_IMPORTS[feature] ?? [];
    return {
      files: [`src/app/features/${feature}/**/*.ts`],
      rules: forbid(
        FEATURES.filter((other) => other !== feature && !allowed.includes(other)).flatMap(
          siblingFeature,
        ),
        `Features must not import one another; promote the shared concept to core or shared. ${LAYERING}`,
      ),
    };
  }),
  {
    files: ['src/**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'error',
    },
  },
);
