export type StockfishEngineAsset = 'analysis' | 'play';

const STOCKFISH_DOWNLOADS_KEY = 'lealchess.stockfish.downloads';

const STOCKFISH_ASSETS: Record<
  StockfishEngineAsset,
  { readonly id: string; readonly bytes: number }
> = {
  play: {
    id: 'stockfish-18-lite-single@18.0.8',
    bytes: 21_429 + 7_295_411,
  },
  analysis: {
    id: 'stockfish-18-single@18.0.8',
    bytes: 21_330 + 112_992_459,
  },
};

export function markStockfishEngineDownloaded(asset: StockfishEngineAsset): void {
  try {
    const downloads = readDownloads();
    downloads.add(STOCKFISH_ASSETS[asset].id);
    localStorage.setItem(STOCKFISH_DOWNLOADS_KEY, JSON.stringify([...downloads]));
  } catch {
    // Engine use continues when browser storage is unavailable.
  }
}

export function downloadedStockfishEngineBytes(): number {
  try {
    const downloads = readDownloads();
    return Object.values(STOCKFISH_ASSETS).reduce(
      (total, asset) => total + (downloads.has(asset.id) ? asset.bytes : 0),
      0,
    );
  } catch {
    return 0;
  }
}

export function clearStockfishEngineDownloads(): void {
  try {
    localStorage.removeItem(STOCKFISH_DOWNLOADS_KEY);
  } catch {
    // Clearing the rest of the user's data continues when browser storage is unavailable.
  }
}

function readDownloads(): Set<string> {
  const value = JSON.parse(localStorage.getItem(STOCKFISH_DOWNLOADS_KEY) ?? '[]');
  return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []);
}
