import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ModalFocusDirective } from '../modal-focus.directive';

let nextConfirmationDialogId = 0;

@Component({
  selector: 'app-confirmation-dialog',
  imports: [ModalFocusDirective],
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialogComponent {
  readonly eyebrow = input('Confirm action');
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly cancelLabel = input('Cancel');
  readonly confirmLabel = input.required<string>();
  readonly checkboxLabel = input<string | null>(null);
  readonly checkboxChecked = input(false);
  readonly cancelled = output<void>();
  readonly confirmed = output<void>();
  readonly checkboxChanged = output<boolean>();

  protected readonly titleId = `confirmation-dialog-title-${nextConfirmationDialogId}`;
  protected readonly descriptionId = `confirmation-dialog-description-${nextConfirmationDialogId++}`;

  protected updateCheckbox(event: Event): void {
    this.checkboxChanged.emit((event.target as HTMLInputElement).checked);
  }
}
