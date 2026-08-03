import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ANALYSIS_ENGINE_CATALOG,
  engineCatalogEntry,
  type AnalysisEngineId,
} from './analysis-profiles';
import { LealChessDatabaseService } from '../persistence/leal-chess-database.service';

export interface EngineInstallState {
  readonly installed: boolean;
  readonly downloading: boolean;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly activeLeases: number;
  readonly error: string | null;
}

export interface EngineWorkerLease {
  readonly worker: Worker;
  release(): void;
}

const EMPTY_STATE: EngineInstallState = {
  installed: false,
  downloading: false,
  downloadedBytes: 0,
  totalBytes: 0,
  activeLeases: 0,
  error: null,
};

@Injectable({ providedIn: 'root' })
export class EngineAssetManagerService {
  private readonly database = inject(LealChessDatabaseService);
  private readonly mutableStates = signal<Record<AnalysisEngineId, EngineInstallState>>({
    'stockfish-18-full': { ...EMPTY_STATE },
    'stockfish-18-lite': { ...EMPTY_STATE },
  });
  private readonly downloads = new Map<AnalysisEngineId, Promise<void>>();
  private loaded: Promise<void> | null = null;

  readonly states = this.mutableStates.asReadonly();
  readonly installedBytes = computed(() =>
    ANALYSIS_ENGINE_CATALOG.reduce(
      (total, engine) =>
        total +
        (this.mutableStates()[engine.id].installed
          ? this.mutableStates()[engine.id].totalBytes
          : 0),
      0,
    ),
  );

  load(): Promise<void> {
    this.loaded ??= this.loadInventory();
    return this.loaded;
  }

  state(id: AnalysisEngineId): EngineInstallState {
    return this.mutableStates()[id];
  }

  async install(id: AnalysisEngineId): Promise<void> {
    await this.load();
    if (this.state(id).installed) return;
    const existing = this.downloads.get(id);
    if (existing) return existing;
    const download = this.downloadAndStore(id).finally(() => this.downloads.delete(id));
    this.downloads.set(id, download);
    return download;
  }

  async remove(id: AnalysisEngineId): Promise<void> {
    await this.load();
    if (this.state(id).activeLeases > 0) {
      throw new Error('This engine is in use. Stop the current analysis before removing it.');
    }
    const database = await this.database.open();
    await database.delete('engineAssets', id);
    this.patch(id, { ...EMPTY_STATE });
  }

  async acquireWorker(id: AnalysisEngineId): Promise<EngineWorkerLease> {
    await this.install(id);
    const database = await this.database.open();
    const storedAsset = await database.get('engineAssets', id);
    if (!storedAsset) throw new Error('The engine download is missing. Download it again.');
    const asset = normalizeAssetBlobTypes(storedAsset);
    if (asset !== storedAsset) {
      await database.put('engineAssets', asset).catch(() => undefined);
    }

    const scriptUrl = URL.createObjectURL(asset.script);
    const wasmUrl = URL.createObjectURL(asset.wasm);
    let released = false;
    let worker: Worker;
    try {
      worker = new Worker(`${scriptUrl}#${wasmUrl}`);
    } catch (error) {
      URL.revokeObjectURL(scriptUrl);
      URL.revokeObjectURL(wasmUrl);
      throw error;
    }
    this.patch(id, { activeLeases: this.state(id).activeLeases + 1 });
    return {
      worker,
      release: () => {
        if (released) return;
        released = true;
        worker.terminate();
        URL.revokeObjectURL(scriptUrl);
        URL.revokeObjectURL(wasmUrl);
        this.patch(id, { activeLeases: Math.max(0, this.state(id).activeLeases - 1) });
      },
    };
  }

  private async loadInventory(): Promise<void> {
    const database = await this.database.open();
    const assets = await database.getAll('engineAssets');
    const installed = new Map(assets.map((asset) => [asset.id, asset]));
    for (const engine of ANALYSIS_ENGINE_CATALOG) {
      const asset = installed.get(engine.id);
      this.patch(engine.id, {
        installed: Boolean(asset),
        totalBytes: asset?.bytes ?? 0,
        downloadedBytes: asset?.bytes ?? 0,
        error: null,
      });
    }
  }

  private async downloadAndStore(id: AnalysisEngineId): Promise<void> {
    const engine = engineCatalogEntry(id);
    this.patch(id, {
      downloading: true,
      downloadedBytes: 0,
      totalBytes: engine.approximateBytes,
      error: null,
    });
    try {
      let completed = 0;
      const progress = (received: number, total: number) => {
        this.patch(id, {
          downloadedBytes: completed + received,
          totalBytes: Math.max(engine.approximateBytes, completed + total),
        });
      };
      const script = await downloadBlob(engine.scriptPath, progress);
      completed = script.size;
      const wasm = await downloadBlob(engine.wasmPath, progress);
      const bytes = script.size + wasm.size;
      const database = await this.database.open();
      const record = {
        id,
        script,
        wasm,
        bytes,
        installedAt: new Date().toISOString(),
      };
      try {
        await database.put('engineAssets', record);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') throw error;
        await database.put('engineAssets', {
          ...record,
          script: await script.arrayBuffer(),
          wasm: await wasm.arrayBuffer(),
        });
      }
      this.patch(id, {
        installed: true,
        downloading: false,
        downloadedBytes: bytes,
        totalBytes: bytes,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'There is not enough local storage for this engine. Free space and retry.'
          : error instanceof Error
            ? error.message
            : 'The engine download failed. Check the connection and retry.';
      this.patch(id, { downloading: false, error: message });
      throw new Error(message, { cause: error });
    }
  }

  private patch(id: AnalysisEngineId, changes: Partial<EngineInstallState>): void {
    this.mutableStates.update((states) => ({
      ...states,
      [id]: { ...states[id], ...changes },
    }));
  }
}

async function downloadBlob(
  path: string,
  onProgress: (received: number, total: number) => void,
): Promise<Blob> {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok)
    throw new Error(`Engine download failed (${response.status}). Retry the download.`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const blob = await response.blob();
    return blob.type ? blob : new Blob([blob], { type: assetMimeType(path) });
  }
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.slice().buffer as ArrayBuffer);
    received += value.byteLength;
    onProgress(received, total || received);
  }
  return new Blob(chunks, {
    type: response.headers.get('content-type')?.split(';')[0] || assetMimeType(path),
  });
}

function assetMimeType(path: string): string {
  return path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
}

function normalizeAssetBlobTypes<
  T extends { script: Blob | ArrayBuffer; wasm: Blob | ArrayBuffer },
>(asset: T): T & { script: Blob; wasm: Blob } {
  if (
    asset.script instanceof Blob &&
    asset.script.type === 'text/javascript' &&
    asset.wasm instanceof Blob &&
    asset.wasm.type === 'application/wasm'
  ) {
    return asset as T & { script: Blob; wasm: Blob };
  }
  return {
    ...asset,
    script:
      asset.script instanceof Blob && asset.script.type === 'text/javascript'
        ? asset.script
        : new Blob([asset.script], { type: 'text/javascript' }),
    wasm:
      asset.wasm instanceof Blob && asset.wasm.type === 'application/wasm'
        ? asset.wasm
        : new Blob([asset.wasm], { type: 'application/wasm' }),
  };
}
