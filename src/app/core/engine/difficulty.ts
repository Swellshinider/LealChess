import type { DifficultyId } from '../game/game.types';

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  description: string;
  skillLevel: number;
  moveTimeMs: number;
}

export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Learning the board',
    skillLevel: 0,
    moveTimeMs: 100,
  },
  {
    id: 'casual',
    label: 'Casual',
    description: 'A relaxed opponent',
    skillLevel: 5,
    moveTimeMs: 200,
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    description: 'Sees short tactics',
    skillLevel: 10,
    moveTimeMs: 400,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Punishes inaccuracies',
    skillLevel: 15,
    moveTimeMs: 800,
  },
  {
    id: 'expert',
    label: 'Expert',
    description: 'Full playing strength',
    skillLevel: 20,
    moveTimeMs: 1500,
  },
];

export function getDifficulty(id: DifficultyId): DifficultyPreset {
  const preset = DIFFICULTY_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`Unknown difficulty: ${id}`);
  }
  return preset;
}
