import { Injectable, signal } from '@angular/core';
import type { OnDestroy } from '@angular/core';

const NAVIGATION_PREFERENCE_KEY = 'lealchess.navigation.expanded';

@Injectable({ providedIn: 'root' })
export class NavigationPanelService implements OnDestroy {
  private readonly desktopQuery = matchMedia('(min-width: 1200px)');
  private readonly mobileQuery = matchMedia('(max-width: 767px)');
  private readonly handleMobileChange = (event: MediaQueryListEvent): void => {
    if (!event.matches) this.mobileOpen.set(false);
  };

  readonly expanded = signal(this.readPreference() ?? this.desktopQuery.matches);
  readonly mobileOpen = signal(false);

  constructor() {
    this.mobileQuery.addEventListener('change', this.handleMobileChange);
  }

  ngOnDestroy(): void {
    this.mobileQuery.removeEventListener('change', this.handleMobileChange);
  }

  toggleExpanded(): void {
    const expanded = !this.expanded();
    this.expanded.set(expanded);
    try {
      localStorage.setItem(NAVIGATION_PREFERENCE_KEY, String(expanded));
    } catch {
      // The in-memory preference still works when browser storage is unavailable.
    }
  }

  openMobile(): void {
    if (this.mobileQuery.matches) this.mobileOpen.set(true);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }

  private readPreference(): boolean | undefined {
    try {
      const value = localStorage.getItem(NAVIGATION_PREFERENCE_KEY);
      if (value === 'true') return true;
      if (value === 'false') return false;
    } catch {
      // Use the viewport default when browser storage is unavailable.
    }
    return undefined;
  }
}
