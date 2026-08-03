import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineAssetManagerService } from './engine-asset-manager.service';

class FakeWorker {
  terminated = false;
  terminate(): void {
    this.terminated = true;
  }
}

describe('EngineAssetManagerService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
    );
    vi.stubGlobal('Worker', FakeWorker);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:engine-${Math.random()}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('deduplicates concurrent streamed downloads', async () => {
    const service = TestBed.inject(EngineAssetManagerService);

    await Promise.all([service.install('stockfish-18-lite'), service.install('stockfish-18-lite')]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(service.state('stockfish-18-lite')).toMatchObject({
      installed: true,
      downloading: false,
      downloadedBytes: 6,
    });
    const lease = await service.acquireWorker('stockfish-18-lite');
    expect(vi.mocked(URL.createObjectURL).mock.calls.map(([blob]) => (blob as Blob).type)).toEqual([
      'text/javascript',
      'application/wasm',
    ]);
    lease.release();
  });

  it('keeps an active worker asset installed and revokes both object URLs on release', async () => {
    const service = TestBed.inject(EngineAssetManagerService);
    const lease = await service.acquireWorker('stockfish-18-lite');

    await expect(service.remove('stockfish-18-lite')).rejects.toThrow('engine is in use');
    lease.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    await expect(service.remove('stockfish-18-lite')).resolves.toBeUndefined();
  });

  it('surfaces a retryable network failure without marking the engine installed', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Network unavailable'));
    const service = TestBed.inject(EngineAssetManagerService);

    await expect(service.install('stockfish-18-full')).rejects.toThrow('Network unavailable');
    expect(service.state('stockfish-18-full')).toMatchObject({
      installed: false,
      downloading: false,
      error: 'Network unavailable',
    });
  });
});
