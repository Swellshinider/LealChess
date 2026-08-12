import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-puzzle-tag-combobox',
  templateUrl: './puzzle-tag-combobox.component.html',
  styleUrl: './puzzle-tag-combobox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PuzzleTagComboboxComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly string[]>();
  readonly selected = input.required<readonly string[]>();
  readonly selectionChange = output<readonly string[]>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly filtered = computed(() => {
    const query = normalize(this.query());
    return this.options().filter(
      (option) =>
        !this.selected().includes(option) && normalize(displayTag(option)).includes(query),
    );
  });
  protected readonly listboxId = computed(() => `puzzle-${this.label().toLowerCase()}-options`);

  protected updateQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  protected select(option: string): void {
    if (!this.selected().includes(option)) this.selectionChange.emit([...this.selected(), option]);
    this.query.set('');
    this.activeIndex.set(0);
    this.open.set(false);
  }

  protected remove(option: string): void {
    this.selectionChange.emit(this.selected().filter((item) => item !== option));
  }

  protected handleKey(event: KeyboardEvent): void {
    const options = this.filtered();
    if (event.key === 'Escape') {
      this.open.set(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) this.open.set(true);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update((index) =>
        Math.max(0, Math.min(options.length - 1, index + direction)),
      );
      return;
    }
    if (event.key === 'Enter' && this.open() && options[this.activeIndex()]) {
      event.preventDefault();
      this.select(options[this.activeIndex()]!);
    }
  }

  protected displayTag(tag: string): string {
    return displayTag(tag);
  }
}

function displayTag(tag: string): string {
  return tag.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
