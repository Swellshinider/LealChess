import type { BoardTheme } from './game.types';

export interface BoardThemeDefinition {
  id: BoardTheme;
  label: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: readonly BoardThemeDefinition[] = [
  { id: 'tournament', label: 'Tournament', light: '#d7ddc0', dark: '#637a52' },
  { id: 'classic', label: 'Classic', light: '#d8c3a1', dark: '#8b6547' },
  { id: 'high-contrast', label: 'High contrast', light: '#f4f5f5', dark: '#416773' },
  { id: 'rosewood', label: 'Rosewood', light: '#e8d8bc', dark: '#8a4752' },
  { id: 'green-felt', label: 'Green felt', light: '#d9e1c3', dark: '#55745b' },
  { id: 'blue-steel', label: 'Blue steel', light: '#c9d8e2', dark: '#4c657a' },
] as const;

export function boardTheme(theme: BoardTheme): BoardThemeDefinition {
  return BOARD_THEMES.find((candidate) => candidate.id === theme) ?? BOARD_THEMES[0];
}
