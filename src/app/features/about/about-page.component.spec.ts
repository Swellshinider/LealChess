import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AboutPageComponent } from './about-page.component';

describe('AboutPageComponent', () => {
  it('presents project, contribution, issue, and security metadata', async () => {
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
    const links = [...host.querySelectorAll<HTMLAnchorElement>('.project-record a')].map(
      (link) => link.href,
    );

    expect(host.querySelector('h1')?.textContent).toContain('About');
    expect(host.textContent).toContain('GPL-3.0-only');
    expect(links).toContain('https://github.com/Swellshinider/LealChess');
    expect(links).toContain('https://github.com/Swellshinider/LealChess/security/advisories/new');
  });
});
