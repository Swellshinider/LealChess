import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HOME_SEO, SEO_ROUTE_DATA, type SeoRouteData } from './seo.types';

const SITE_URL = 'https://lealchess.com';
const SOCIAL_IMAGE_URL = `${SITE_URL}/social-preview.png`;
const STRUCTURED_DATA_ID = 'lealchess-structured-data';
const APP_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'LealChess',
  url: `${SITE_URL}/`,
  description: HOME_SEO.description,
  applicationCategory: 'GameApplication',
  operatingSystem: 'Any',
  isAccessibleForFree: true,
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.applyMetadata(this.deepestRoute(this.router.routerState.snapshot.root));
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() =>
        this.applyMetadata(this.deepestRoute(this.router.routerState.snapshot.root)),
      );
  }

  private applyMetadata(route: ActivatedRouteSnapshot): void {
    const seo = route.data[SEO_ROUTE_DATA] as SeoRouteData | undefined;

    if (!seo) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
      this.removeCanonical();
      this.removeSocialMetadata();
      this.removeStructuredData();
      return;
    }

    const canonicalUrl = `${SITE_URL}${seo.canonicalPath}`;
    this.title.setTitle(seo.title);
    this.meta.updateTag({ name: 'description', content: seo.description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.updateProperty('og:type', 'website');
    this.updateProperty('og:site_name', 'LealChess');
    this.updateProperty('og:locale', 'en_US');
    this.updateProperty('og:title', seo.title);
    this.updateProperty('og:description', seo.description);
    this.updateProperty('og:url', canonicalUrl);
    this.updateProperty('og:image', SOCIAL_IMAGE_URL);
    this.updateProperty('og:image:width', '1729');
    this.updateProperty('og:image:height', '910');
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: seo.title });
    this.meta.updateTag({ name: 'twitter:description', content: seo.description });
    this.meta.updateTag({ name: 'twitter:image', content: SOCIAL_IMAGE_URL });
    this.updateCanonical(canonicalUrl);

    if (seo.canonicalPath === '/') this.updateStructuredData();
    else this.removeStructuredData();
  }

  private deepestRoute(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let current = route;
    while (current.firstChild) current = current.firstChild;
    return current;
  }

  private updateProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property='${property}'`);
  }

  private updateCanonical(href: string): void {
    const canonical =
      this.document.head.querySelector<HTMLLinkElement>("link[rel='canonical']") ??
      this.document.head.appendChild(this.document.createElement('link'));
    canonical.rel = 'canonical';
    canonical.href = href;
  }

  private removeCanonical(): void {
    this.document.head.querySelector("link[rel='canonical']")?.remove();
  }

  private removeSocialMetadata(): void {
    for (const property of [
      'og:type',
      'og:site_name',
      'og:locale',
      'og:title',
      'og:description',
      'og:url',
      'og:image',
      'og:image:width',
      'og:image:height',
    ]) {
      this.meta.removeTag(`property='${property}'`);
    }
    for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
      this.meta.removeTag(`name='${name}'`);
    }
  }

  private updateStructuredData(): void {
    const script =
      this.document.getElementById(STRUCTURED_DATA_ID) ??
      this.document.head.appendChild(this.document.createElement('script'));
    script.id = STRUCTURED_DATA_ID;
    script.setAttribute('type', 'application/ld+json');
    script.textContent = JSON.stringify(APP_STRUCTURED_DATA);
  }

  private removeStructuredData(): void {
    this.document.getElementById(STRUCTURED_DATA_ID)?.remove();
  }
}
