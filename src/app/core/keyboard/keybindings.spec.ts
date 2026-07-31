import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDINGS,
  cloneDefaultKeybindings,
  formatKeyChord,
  keyChordFromEvent,
  keyChordMatches,
  normalizeKeybindingPreferences,
} from './keybindings';

describe('keybindings', () => {
  it('captures, formats, and exactly matches key chords', () => {
    const event = new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true });
    const chord = keyChordFromEvent(event);

    expect(chord).toEqual({ key: 'k', ctrl: true, alt: false, shift: true, meta: false });
    expect(formatKeyChord(chord!)).toBe('Ctrl + Shift + K');
    expect(keyChordMatches(event, chord!)).toBe(true);
    expect(keyChordMatches(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }), chord!)).toBe(
      false,
    );
  });

  it('normalizes Space and ignores modifier-only key presses', () => {
    expect(keyChordFromEvent(new KeyboardEvent('keydown', { key: ' ' }))).toEqual(
      DEFAULT_KEYBINDINGS.showIdea,
    );
    expect(keyChordFromEvent(new KeyboardEvent('keydown', { key: 'Control' }))).toBeNull();
  });

  it('restores defaults for missing, invalid, or duplicate persisted sets', () => {
    expect(normalizeKeybindingPreferences(undefined)).toEqual(DEFAULT_KEYBINDINGS);
    expect(
      normalizeKeybindingPreferences({
        ...cloneDefaultKeybindings(),
        showIdea: DEFAULT_KEYBINDINGS.previousMove,
      }),
    ).toEqual(DEFAULT_KEYBINDINGS);
    expect(
      normalizeKeybindingPreferences({
        ...cloneDefaultKeybindings(),
        showIdea: { key: 'Tab', ctrl: false, alt: false, shift: false, meta: false },
      }),
    ).toEqual(DEFAULT_KEYBINDINGS);
  });

  it('preserves a complete valid custom set', () => {
    const custom = cloneDefaultKeybindings();
    custom.showIdea = { key: 'i', ctrl: true, alt: false, shift: false, meta: false };

    expect(normalizeKeybindingPreferences(custom)).toEqual(custom);
  });
});
