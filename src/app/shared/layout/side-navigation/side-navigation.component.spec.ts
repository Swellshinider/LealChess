import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../../../../package.json';
import { NavigationPanelService } from '../navigation-panel.service';
import { SideNavigationComponent } from './side-navigation.component';

describe('SideNavigationComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('exposes every working route in the desktop navigation', async () => {
    stubMedia({ desktop: true, mobile: false });
    await TestBed.configureTestingModule({
      imports: [SideNavigationComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SideNavigationComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('a[href]').length).toBe(8);
    expect(host.querySelector<HTMLImageElement>('.brand-logo')?.getAttribute('src')).toBe(
      '/favicon.svg',
    );
    expect(host.querySelector('.brand-copy')?.textContent?.trim()).toBe('LealChess');
    expect(host.querySelector('[data-tooltip="Play"]')).not.toBeNull();
    expect(host.querySelector('[data-tooltip="Learn"]')).not.toBeNull();
    expect(host.querySelector('[data-tooltip="Explorer"]')).not.toBeNull();
    expect(host.querySelector('[data-tooltip="Puzzles"]')).not.toBeNull();
    expect(host.querySelector('[data-tooltip="Settings"]')).not.toBeNull();
    expect(
      host.querySelector<HTMLAnchorElement>('[data-tooltip="About"]')?.getAttribute('href'),
    ).toBe('/about/');
    expect(host.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(host.querySelector('.version-label')?.getAttribute('aria-label')).toBe(
      `LealChess version v${packageMetadata.version}`,
    );

    const toggle = host.querySelector<HTMLButtonElement>('.rail-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders a modal mobile drawer that Escape dismisses', async () => {
    stubMedia({ desktop: false, mobile: true });
    await TestBed.configureTestingModule({
      imports: [SideNavigationComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SideNavigationComponent);
    const navigation = TestBed.inject(NavigationPanelService);
    navigation.openMobile();
    fixture.detectChanges();
    const drawer = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[role="dialog"]',
    )!;

    expect(drawer).not.toBeNull();
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.querySelector<HTMLAnchorElement>('a[href="/about/"]')).not.toBeNull();
    expect(drawer.querySelector('.drawer-heading strong')?.textContent?.trim()).toBe('LealChess');
    expect(drawer.querySelector('.drawer-version')?.textContent).toContain(
      `Version v${packageMetadata.version}`,
    );

    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(navigation.mobileOpen()).toBe(false);
  });
});

function stubMedia(options: { desktop: boolean; mobile: boolean }): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const matches = query === '(min-width: 1200px)' ? options.desktop : options.mobile;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as MediaQueryList;
    }),
  );
}
