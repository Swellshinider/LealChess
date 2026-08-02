import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OnboardingTourComponent } from './features/onboarding/onboarding-tour.component';

@Component({
  selector: 'app-root',
  imports: [OnboardingTourComponent, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
