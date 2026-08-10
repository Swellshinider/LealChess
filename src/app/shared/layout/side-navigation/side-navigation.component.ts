import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import packageMetadata from '../../../../../package.json';
import { ModalFocusDirective } from '../../a11y/modal-focus.directive';
import { NavigationPanelService } from '../navigation-panel.service';

@Component({
  selector: 'app-side-navigation',
  imports: [ModalFocusDirective, RouterLink, RouterLinkActive],
  templateUrl: './side-navigation.component.html',
  styleUrl: './side-navigation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-expanded]': 'navigation.expanded()',
  },
})
export class SideNavigationComponent {
  protected readonly navigation = inject(NavigationPanelService);
  protected readonly version = `v${packageMetadata.version}`;
  private readonly router = inject(Router);

  protected isAboutRoute(): boolean {
    return this.router.url.split(/[?#]/, 1)[0]?.replace(/\/$/, '') === '/about';
  }
}
