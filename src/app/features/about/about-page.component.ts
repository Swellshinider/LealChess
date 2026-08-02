import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SideNavigationComponent } from '../../shared/layout/side-navigation/side-navigation.component';

@Component({
  selector: 'app-about-page',
  imports: [SideNavigationComponent],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageComponent {}
