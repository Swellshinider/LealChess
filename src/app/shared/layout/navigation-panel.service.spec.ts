import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigationPanelService } from './navigation-panel.service';

describe('NavigationPanelService', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to an expanded panel on desktop', () => {
    stubMedia({ desktop: true, mobile: false });

    const navigation = new NavigationPanelService();

    expect(navigation.expanded()).toBe(true);
  });

  it('defaults to a collapsed panel on tablet', () => {
    stubMedia({ desktop: false, mobile: false });

    const navigation = new NavigationPanelService();

    expect(navigation.expanded()).toBe(false);
  });

  it('restores and persists the panel preference', () => {
    localStorage.setItem('lealchess.navigation.expanded', 'false');
    stubMedia({ desktop: true, mobile: false });
    const navigation = new NavigationPanelService();

    expect(navigation.expanded()).toBe(false);

    navigation.toggleExpanded();

    expect(navigation.expanded()).toBe(true);
    expect(localStorage.getItem('lealchess.navigation.expanded')).toBe('true');
  });

  it('ignores malformed preferences', () => {
    localStorage.setItem('lealchess.navigation.expanded', 'sometimes');
    stubMedia({ desktop: true, mobile: false });

    const navigation = new NavigationPanelService();

    expect(navigation.expanded()).toBe(true);
  });

  it('continues in memory when storage is unavailable', () => {
    stubMedia({ desktop: true, mobile: false });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    const navigation = new NavigationPanelService();

    navigation.toggleExpanded();

    expect(navigation.expanded()).toBe(false);
  });

  it('keeps mobile drawer state transient and closes it after leaving mobile', () => {
    const media = stubMedia({ desktop: false, mobile: true });
    const navigation = new NavigationPanelService();

    navigation.openMobile();
    expect(navigation.mobileOpen()).toBe(true);
    expect(localStorage.getItem('lealchess.navigation.expanded')).toBeNull();

    media.mobile.setMatches(false);

    expect(navigation.mobileOpen()).toBe(false);
  });
});

interface MediaOptions {
  desktop: boolean;
  mobile: boolean;
}

function stubMedia(options: MediaOptions): { mobile: MediaQueryStub } {
  const desktop = new MediaQueryStub('(min-width: 1200px)', options.desktop);
  const mobile = new MediaQueryStub('(max-width: 767px)', options.mobile);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) => (query === desktop.media ? desktop : mobile) as unknown as MediaQueryList,
    ),
  );
  return { mobile };
}

class MediaQueryStub {
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;
  readonly addListener = vi.fn();
  readonly removeListener = vi.fn();
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  constructor(
    readonly media: string,
    public matches: boolean,
  ) {}

  readonly addEventListener = vi.fn(
    (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
      this.listeners.add(listener);
    },
  );

  readonly removeEventListener = vi.fn(
    (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
      this.listeners.delete(listener);
    },
  );

  dispatchEvent(): boolean {
    return true;
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    const event = { matches, media: this.media } as MediaQueryListEvent;
    for (const listener of this.listeners) listener(event);
    this.onchange?.call(this as unknown as MediaQueryList, event);
  }
}
