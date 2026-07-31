import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router, type Routes } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LandingPageComponent } from '../../features/landing/landing-page.component';
import { ABOUT_SEO, HOME_SEO, SEO_ROUTE_DATA } from './seo.types';
import { SeoService } from './seo.service';

const routes: Routes = [
  { path: '', component: LandingPageComponent, data: { [SEO_ROUTE_DATA]: HOME_SEO } },
  {
    path: 'about',
    component: LandingPageComponent,
    data: { [SEO_ROUTE_DATA]: ABOUT_SEO },
  },
  { path: 'workspace', component: LandingPageComponent },
];

describe('SeoService', () => {
  let document: Document;
  let meta: Meta;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    document = TestBed.inject(DOCUMENT);
    meta = TestBed.inject(Meta);
    router = TestBed.inject(Router);
    TestBed.inject(SeoService).initialize();
  });

  afterEach(() => {
    document.head.querySelector("link[rel='canonical']")?.remove();
    document.getElementById('lealchess-structured-data')?.remove();
    for (const selector of [
      "meta[name='robots']",
      "meta[property^='og:']",
      "meta[name^='twitter:']",
    ]) {
      document.head.querySelectorAll(selector).forEach((element) => element.remove());
    }
    TestBed.resetTestingModule();
  });

  it('publishes complete metadata and structured data for home', async () => {
    await router.navigateByUrl('/');

    expect(document.title).toBe(HOME_SEO.title);
    expect(meta.getTag("name='description'")?.content).toBe(HOME_SEO.description);
    expect(meta.getTag("name='robots'")?.content).toBe('index, follow');
    expect(document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href).toBe(
      'https://lealchess.com/',
    );
    expect(meta.getTag("property='og:image'")?.content).toBe(
      'https://lealchess.com/social-preview.png',
    );
    expect(document.getElementById('lealchess-structured-data')?.textContent).toContain(
      'WebApplication',
    );
  });

  it('replaces route-specific metadata without duplicating the canonical', async () => {
    await router.navigateByUrl('/');
    await router.navigateByUrl('/about');

    expect(document.title).toBe(ABOUT_SEO.title);
    expect(meta.getTag("name='description'")?.content).toBe(ABOUT_SEO.description);
    expect(document.querySelectorAll("link[rel='canonical']")).toHaveLength(1);
    expect(document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href).toBe(
      'https://lealchess.com/about',
    );
    expect(document.getElementById('lealchess-structured-data')).toBeNull();
  });

  it('removes indexable metadata from private workspaces', async () => {
    await router.navigateByUrl('/');
    await router.navigateByUrl('/workspace');

    expect(meta.getTag("name='robots'")?.content).toBe('noindex, nofollow');
    expect(document.querySelector("link[rel='canonical']")).toBeNull();
    expect(meta.getTag("property='og:title'")).toBeNull();
    expect(document.getElementById('lealchess-structured-data')).toBeNull();
  });
});
