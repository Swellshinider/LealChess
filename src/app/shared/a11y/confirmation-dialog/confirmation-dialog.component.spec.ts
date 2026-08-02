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
    const checkboxChanged = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.checkboxChanged.subscribe(checkboxChanged);
    fixture.componentRef.setInput('title', 'Remove this variation?');
    fixture.componentRef.setInput('description', 'This branch will be removed.');
    fixture.componentRef.setInput('cancelLabel', 'Keep variation');
    fixture.componentRef.setInput('confirmLabel', 'Remove variation');
    fixture.componentRef.setInput('checkboxLabel', "Don't ask me again");
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector<HTMLElement>('[role="alertdialog"]')!;

    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    host.querySelector<HTMLButtonElement>('button[data-modal-initial]')!.click();
    host.querySelector<HTMLButtonElement>('.danger-action')!.click();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(confirmed).toHaveBeenCalledOnce();
    expect(checkboxChanged).toHaveBeenCalledWith(true);
  });

  it('does not render an option when no checkbox label is provided', async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmationDialogComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConfirmationDialogComponent);
    fixture.componentRef.setInput('title', 'Replace the current session?');
    fixture.componentRef.setInput('description', 'The current session will be discarded.');
    fixture.componentRef.setInput('confirmLabel', 'Replace session');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
