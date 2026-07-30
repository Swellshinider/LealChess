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
  readonly cancelled = output<void>();
  readonly confirmed = output<void>();

  protected readonly titleId = `confirmation-dialog-title-${nextConfirmationDialogId}`;
  protected readonly descriptionId = `confirmation-dialog-description-${nextConfirmationDialogId++}`;
}
