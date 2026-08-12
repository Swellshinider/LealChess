import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createZstdDecompress } from 'node:zlib';
import { Chess } from 'chess.js';

const options = argumentsFrom(process.argv.slice(2));
if (!options.source)
  throw new Error('Usage: pnpm generate:puzzles -- --source <path-or-url> [--sha256 <hex>]');
const temporary = resolve(tmpdir(), `lealchess-puzzles-${process.pid}.csv.zst`);
const sourcePath = /^https:\/\//.test(options.source)
  ? await download(options.source, temporary)
  : resolve(options.source);

try {
  const checksum = await sha256(sourcePath);
  if (options.sha256 && checksum.toLowerCase() !== options.sha256.toLowerCase())
    throw new Error(`SHA-256 mismatch: expected ${options.sha256}, received ${checksum}`);
  const rows = await readRows(sourcePath);
  const selected = selectPuzzles(rows, options.limit);
  const catalog = compact(selected, checksum, options.sourceDate);
  const output = resolve(options.output);
  const moduleText = `import type { CompactPuzzleCatalog } from './puzzle.types';\n\nexport const PUZZLE_CATALOG: CompactPuzzleCatalog = ${JSON.stringify(catalog)};\n`;
  await enforceSize(moduleText, options.maximumBytes);
  await writeFile(output, moduleText);
  console.log(
    `Wrote ${selected.length} puzzles to ${output} from ${rows.length} valid records (${checksum}).`,
  );
} finally {
  if (sourcePath === temporary) await unlink(temporary).catch(() => undefined);
}

function argumentsFrom(args) {
  const value = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : fallback;
  };
  return {
    source: value('source'),
    sha256: value('sha256'),
    sourceDate: value('source-date', new Date().toISOString().slice(0, 10)),
    output: value('output', 'src/app/features/puzzles/puzzle-catalog.generated.ts'),
    limit: Number(value('limit', '32000')),
    maximumBytes: Number(value('maximum-bytes', String(5 * 1024 * 1024))),
  };
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  return destination;
}

async function sha256(path) {
  const hash = createHash('sha256');
  await pipeline(
    createReadStream(path),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    new Transform({
      transform(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
  return hash.digest('hex');
}

async function readRows(path) {
  const compressed = path.endsWith('.zst') || basename(path).includes('.zst');
  const input = compressed
    ? tolerantZstd(createReadStream(path).pipe(stripZstdMetadata()))
    : createReadStream(path);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const coverage = new Map();
  const bucketPools = new Map();
  let first = true;
  for await (const line of lines) {
    if (first && line.startsWith('PuzzleId,')) {
      first = false;
      continue;
    }
    first = false;
    const row = normalizeRow(line);
    if (!row) continue;
    const tags = [...new Set([...row.themes, ...row.openings])];
    for (const tag of tags) keepBest(coverage, tag, row, 3);
    for (const tag of [...tags, 'untagged']) {
      keepBest(bucketPools, `${tag}|${Math.floor(row.rating / 200) * 200}`, row, 16);
    }
  }
  return [
    ...new Map(
      [...coverage.values(), ...bucketPools.values()].flat().map((row) => [row.id, row]),
    ).values(),
  ];
}

function tolerantZstd(input) {
  const decompressor = createZstdDecompress();
  const output = new PassThrough();
  let emittedBytes = 0;
  decompressor.on('data', (chunk) => {
    emittedBytes += chunk.length;
  });
  decompressor.on('error', (error) => {
    if (error.code === 'ZSTD_error_prefix_unknown' && emittedBytes > 0) output.end();
    else output.destroy(error);
  });
  input.on('error', (error) => output.destroy(error));
  input.pipe(decompressor).pipe(output);
  return output;
}

function stripZstdMetadata() {
  let buffer = Buffer.alloc(0);
  let started = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (started) {
        callback(null, chunk);
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) {
        const magic = buffer.readUInt32LE(0);
        if ((magic & 0xfffffff0) !== 0x184d2a50) {
          started = true;
          callback(null, buffer);
          return;
        }
        const frameLength = 8 + buffer.readUInt32LE(4);
        if (buffer.length < frameLength) break;
        buffer = buffer.subarray(frameLength);
      }
      callback();
    },
    flush(callback) {
      callback(
        started || buffer.length === 0 ? undefined : new Error('Incomplete Zstandard frame.'),
      );
    },
  });
}

function keepBest(groups, key, row, maximum) {
  const values = groups.get(key) ?? [];
  const existing = values.findIndex((candidate) => candidate.id === row.id);
  if (existing >= 0) values.splice(existing, 1);
  values.push(row);
  values.sort(rank);
  if (values.length > maximum) values.length = maximum;
  groups.set(key, values);
}

function normalizeRow(line) {
  const fields = line.split(',');
  if (fields.length < 9) return null;
  const [
    id,
    fen,
    movesText,
    ratingText,
    deviationText,
    popularityText,
    playsText,
    themesText,
    gameUrl,
    openingText = '',
  ] = fields;
  const rating = Number(ratingText),
    deviation = Number(deviationText),
    popularity = Number(popularityText),
    plays = Number(playsText);
  if (
    !id ||
    !fen ||
    !movesText ||
    !Number.isInteger(rating) ||
    !Number.isFinite(deviation) ||
    popularity < 0 ||
    !Number.isInteger(plays)
  )
    return null;
  const moves = movesText.split(' ');
  if (moves.length < 2) return null;
  try {
    const chess = new Chess(fen);
    playUci(chess, moves[0]);
    const startingFen = chess.fen();
    for (const move of moves.slice(1)) playUci(chess, move);
    const allTags = themesText.split(' ').filter(Boolean);
    const openings = openingText.split(' ').filter(Boolean);
    const themes = allTags.filter((tag) => !openings.includes(tag));
    return {
      id,
      fen: startingFen,
      solution: moves.slice(1).join(' '),
      rating,
      deviation,
      popularity,
      plays,
      themes,
      openings,
      gameUrl,
    };
  } catch {
    return null;
  }
}

function playUci(chess, uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('invalid UCI');
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

function selectPuzzles(rows, limit) {
  const ranked = [...rows].sort(rank);
  const unique = new Map();
  for (const row of ranked) {
    const fingerprint = `${row.fen}|${row.solution}`;
    if (!unique.has(fingerprint)) unique.set(fingerprint, row);
  }
  const deduplicated = [...unique.values()];
  const picked = new Map();
  const tags = [...new Set(deduplicated.flatMap((row) => [...row.themes, ...row.openings]))].sort();
  for (const tag of tags) {
    for (const row of deduplicated
      .filter((item) => [...item.themes, ...item.openings].includes(tag))
      .slice(0, 3))
      picked.set(row.id, row);
  }
  const buckets = new Map();
  for (const row of deduplicated) {
    for (const tag of [...new Set([...row.themes, ...row.openings, 'untagged'])]) {
      const key = `${tag}|${Math.floor(row.rating / 200) * 200}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(row);
    }
  }
  const keys = [...buckets.keys()].sort();
  let index = 0,
    changed = true;
  while (picked.size < limit && changed) {
    changed = false;
    for (const key of keys) {
      const row = buckets.get(key)[index];
      if (row) {
        picked.set(row.id, row);
        changed = true;
        if (picked.size >= limit) break;
      }
    }
    index += 1;
  }
  return [...picked.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
}

function rank(a, b) {
  return (
    b.popularity - a.popularity ||
    b.plays - a.plays ||
    a.deviation - b.deviation ||
    a.id.localeCompare(b.id)
  );
}

function compact(rows, checksum, sourceDate) {
  const strings = [],
    indexes = new Map();
  const intern = (value) => {
    if (!indexes.has(value)) {
      indexes.set(value, strings.length);
      strings.push(value);
    }
    return indexes.get(value);
  };
  const puzzles = rows.map((row) => [
    intern(row.id),
    intern(row.fen),
    intern(row.solution),
    row.rating,
    row.themes.map(intern),
    row.openings.map(intern),
  ]);
  const tagIndexes = {};
  rows.forEach((row, index) =>
    [...row.themes, ...row.openings].forEach((tag) => (tagIndexes[tag] ??= []).push(index)),
  );
  const ratings = rows.map((row) => row.rating);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDate,
    sourceSha256: checksum,
    strings,
    puzzles,
    ratingBounds: [Math.min(...ratings), Math.max(...ratings)],
    tagIndexes,
  };
}

async function enforceSize(text, maximum) {
  const temporary = resolve(tmpdir(), `lealchess-puzzle-size-${process.pid}.gz`);
  try {
    await pipeline(Readable.from([text]), createGzip({ level: 9 }), createWriteStream(temporary));
    const size = (await stat(temporary)).size;
    if (size > maximum)
      throw new Error(`Compressed catalog is ${size} bytes; maximum is ${maximum}.`);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export { compact, normalizeRow, selectPuzzles };
