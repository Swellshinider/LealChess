import { ChangeDetectionStrategy, Component } from '@angular/core';
import packageMetadata from '../../../../package.json';
import { SideNavigationComponent } from '../../shared/layout/side-navigation/side-navigation.component';

@Component({
  selector: 'app-help-page',
  imports: [SideNavigationComponent],
  templateUrl: './help-page.component.html',
  styleUrl: './help-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpPageComponent {
  protected readonly version = `v${packageMetadata.version}`;
}
