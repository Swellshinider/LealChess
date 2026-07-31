import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStockfishEngineDownloads,
  downloadedStockfishEngineBytes,
  markStockfishEngineDownloaded,
} from './stockfish-assets';

describe('Stockfish asset storage', () => {
  beforeEach(() => localStorage.clear());

  it('counts only engines that have initialized on this device', () => {
    expect(downloadedStockfishEngineBytes()).toBe(0);

    markStockfishEngineDownloaded('play');
    expect(downloadedStockfishEngineBytes()).toBe(7_316_840);

    markStockfishEngineDownloaded('analysis');
    expect(downloadedStockfishEngineBytes()).toBe(120_330_629);
  });

  it('does not count an engine more than once', () => {
    markStockfishEngineDownloaded('analysis');
    markStockfishEngineDownloaded('analysis');

    expect(downloadedStockfishEngineBytes()).toBe(113_013_789);
  });

  it('forgets downloaded engines when LealChess data is cleared', () => {
    markStockfishEngineDownloaded('play');
    markStockfishEngineDownloaded('analysis');

    clearStockfishEngineDownloads();

    expect(downloadedStockfishEngineBytes()).toBe(0);
  });

  it('ignores invalid and obsolete download metadata', () => {
    localStorage.setItem('lealchess.stockfish.downloads', JSON.stringify(['older-engine']));
    expect(downloadedStockfishEngineBytes()).toBe(0);

    localStorage.setItem('lealchess.stockfish.downloads', 'invalid');
    expect(downloadedStockfishEngineBytes()).toBe(0);
  });
});
