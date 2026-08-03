import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AboutPageComponent } from './about-page.component';

describe('AboutPageComponent', () => {
  it('presents the mission, open-source project, and contribution paths', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await TestBed.configureTestingModule({
      imports: [AboutPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(AboutPageComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const headings = [...host.querySelectorAll('h2')].map((heading) => heading.textContent?.trim());
    const links = [...host.querySelectorAll<HTMLAnchorElement>('a')].map((link) => link.href);

    expect(host.querySelector('h1')?.textContent).toContain('About LealChess');
    expect(headings).toEqual([
      'Why LealChess',
      'Our Mission',
      'We Are Open Source',
      'Issues and Contributions',
    ]);
    expect(links).toContain('https://github.com/Swellshinider/LealChess');
    expect(links).toContain('https://github.com/Swellshinider/LealChess/issues');
    expect(links).toContain('https://github.com/Swellshinider/LealChess/security/advisories/new');
    expect(host.querySelector('a[href*="LICENSE"]')).toBeNull();
  });
});
