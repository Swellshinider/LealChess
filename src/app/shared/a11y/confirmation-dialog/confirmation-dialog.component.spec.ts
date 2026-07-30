import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationDialogComponent } from './confirmation-dialog.component';

describe('ConfirmationDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an accessible destructive confirmation and emits both actions', async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmationDialogComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConfirmationDialogComponent);
    const cancelled = vi.fn();
    const confirmed = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentRef.setInput('title', 'Remove this variation?');
    fixture.componentRef.setInput('description', 'This branch will be removed.');
    fixture.componentRef.setInput('cancelLabel', 'Keep variation');
    fixture.componentRef.setInput('confirmLabel', 'Remove variation');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector<HTMLElement>('[role="alertdialog"]')!;

    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    host.querySelector<HTMLButtonElement>('button[data-modal-initial]')!.click();
    host.querySelector<HTMLButtonElement>('.danger-action')!.click();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(confirmed).toHaveBeenCalledOnce();
  });
});
