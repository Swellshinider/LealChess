export const KEYBINDING_ACTIONS = [
  'previousMove',
  'nextMove',
  'branchStart',
  'branchEnd',
  'showIdea',
] as const;

export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number];

export interface KeyChord {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export type KeybindingPreferences = Record<KeybindingAction, KeyChord>;

export const DEFAULT_KEYBINDINGS: KeybindingPreferences = {
  previousMove: chord('ArrowLeft'),
  nextMove: chord('ArrowRight'),
  branchStart: chord('ArrowLeft', { ctrl: true }),
  branchEnd: chord('ArrowRight', { ctrl: true }),
  showIdea: chord('Space'),
};

export const KEYBINDING_LABELS: Record<KeybindingAction, string> = {
  previousMove: 'Previous move',
  nextMove: 'Next move',
  branchStart: 'Branch or game start',
  branchEnd: 'Branch or game end',
  showIdea: 'Show idea',
};

export function keyChordFromEvent(event: KeyboardEvent): KeyChord | null {
  const key = normalizeKey(event.key);
  if (!key || isModifierKey(key)) return null;
  return {
    key,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export function isAssignableKeyChord(chord: KeyChord): boolean {
  return chord.key !== 'Escape' && chord.key !== 'Tab' && !isModifierKey(chord.key);
}

export function keyChordMatches(event: KeyboardEvent, chord: KeyChord): boolean {
  return (
    normalizeKey(event.key) === chord.key &&
    event.ctrlKey === chord.ctrl &&
    event.altKey === chord.alt &&
    event.shiftKey === chord.shift &&
    event.metaKey === chord.meta
  );
}

export function keyChordId(chord: KeyChord): string {
  return `${Number(chord.ctrl)}:${Number(chord.alt)}:${Number(chord.shift)}:${Number(
    chord.meta,
  )}:${chord.key}`;
}

export function formatKeyChord(chord: KeyChord): string {
  const parts = [
    chord.ctrl ? 'Ctrl' : '',
    chord.alt ? 'Alt' : '',
    chord.shift ? 'Shift' : '',
    chord.meta ? 'Meta' : '',
    displayKey(chord.key),
  ];
  return parts.filter(Boolean).join(' + ');
}

export function normalizeKeybindingPreferences(value: unknown): KeybindingPreferences {
  if (!isRecord(value)) return cloneDefaultKeybindings();
  const normalized = {} as KeybindingPreferences;
  const used = new Set<string>();
  for (const action of KEYBINDING_ACTIONS) {
    const candidate = normalizeChord(value[action]);
    if (!candidate || !isAssignableKeyChord(candidate) || used.has(keyChordId(candidate))) {
      return cloneDefaultKeybindings();
    }
    normalized[action] = candidate;
    used.add(keyChordId(candidate));
  }
  return normalized;
}

export function cloneDefaultKeybindings(): KeybindingPreferences {
  return Object.fromEntries(
    KEYBINDING_ACTIONS.map((action) => [action, { ...DEFAULT_KEYBINDINGS[action] }]),
  ) as unknown as KeybindingPreferences;
}

function chord(key: string, modifiers: Partial<Omit<KeyChord, 'key'>> = {}): KeyChord {
  return {
    key,
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
    meta: modifiers.meta ?? false,
  };
}

function normalizeChord(value: unknown): KeyChord | null {
  if (!isRecord(value) || typeof value['key'] !== 'string') return null;
  const key = normalizeKey(value['key']);
  if (!key) return null;
  for (const modifier of ['ctrl', 'alt', 'shift', 'meta'] as const) {
    if (typeof value[modifier] !== 'boolean') return null;
  }
  return {
    key,
    ctrl: value['ctrl'] as boolean,
    alt: value['alt'] as boolean,
    shift: value['shift'] as boolean,
    meta: value['meta'] as boolean,
  };
}

function normalizeKey(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key.length === 1) return key.toLocaleLowerCase();
  return key;
}

function displayKey(key: string): string {
  const labels: Record<string, string> = {
    Space: 'Space',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  return labels[key] ?? (key.length === 1 ? key.toLocaleUpperCase() : key);
}

function isModifierKey(key: string): boolean {
  return ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
