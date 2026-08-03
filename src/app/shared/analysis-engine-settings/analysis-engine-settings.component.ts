import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ANALYSIS_DEPTH_RANGE,
  ANALYSIS_ENGINE_CATALOG,
  ANALYSIS_LINES_RANGE,
  ANALYSIS_WORKFLOW_LABELS,
  engineCatalogEntry,
  type AnalysisEngineId,
  type AnalysisWorkflow,
} from '../../core/engine/analysis-profiles';
import { AnalysisSettingsService } from '../../core/engine/analysis-settings.service';
import { EngineAssetManagerService } from '../../core/engine/engine-asset-manager.service';
import { ModalFocusDirective } from '../a11y/modal-focus.directive';

@Component({
  selector: 'app-analysis-engine-settings',
  imports: [ModalFocusDirective],
  templateUrl: './analysis-engine-settings.component.html',
  styleUrl: './analysis-engine-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisEngineSettingsComponent {
  private readonly settings = inject(AnalysisSettingsService);
  protected readonly assets = inject(EngineAssetManagerService);

  readonly workflow = input.required<AnalysisWorkflow>();
  readonly compact = input(true);
  readonly active = input(false);
  protected readonly open = signal(false);
  protected readonly engines = ANALYSIS_ENGINE_CATALOG;
  protected readonly depthRange = ANALYSIS_DEPTH_RANGE;
  protected readonly linesRange = ANALYSIS_LINES_RANGE;
  protected readonly label = computed(() => ANALYSIS_WORKFLOW_LABELS[this.workflow()]);
  protected readonly profile = computed(() => this.settings.settings().profiles[this.workflow()]);
  protected readonly engine = computed(() => engineCatalogEntry(this.profile().engineId));

  constructor() {
    void this.settings.load();
    void this.assets.load().catch(() => undefined);
  }

  @HostListener('document:keydown.escape')
  protected close(): void {
    this.open.set(false);
  }

  protected show(): void {
    this.open.set(true);
  }

  protected selectEngine(engineId: AnalysisEngineId): void {
    void this.settings.updateProfile(this.workflow(), { engineId }).catch(() => undefined);
  }

  protected updateDepth(event: Event): void {
    void this.settings
      .updateProfile(this.workflow(), {
        depth: Number((event.target as HTMLInputElement).value),
      })
      .catch(() => undefined);
  }

  protected updateLines(event: Event): void {
    void this.settings
      .updateProfile(this.workflow(), {
        lines: Number((event.target as HTMLInputElement).value),
      })
      .catch(() => undefined);
  }

  protected install(engineId: AnalysisEngineId): void {
    void this.assets.install(engineId).catch(() => undefined);
  }

  protected remove(engineId: AnalysisEngineId): void {
    void this.assets.remove(engineId).catch(() => undefined);
  }

  protected progress(engineId: AnalysisEngineId): number {
    const state = this.assets.state(engineId);
    return state.totalBytes
      ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100))
      : 0;
  }

  protected size(bytes: number): string {
    return `~${Math.round(bytes / 1024 / 1024)} MiB`;
  }
}
