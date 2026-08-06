# Frequently asked questions

## Do I need an account?

No. LealChess has no account system and no sign-in. Open the site and start playing.

## Where is my data stored?

In your browser, on your device, using IndexedDB. Nothing is uploaded. See
[PRIVACY.md](PRIVACY.md) for the exact list of what is stored.

## Does it work offline?

Mostly, but LealChess is not an installable offline app. Once the page and the Stockfish engine
have loaded, playing and analyzing work with no network connection at all — the engine runs on your
own CPU. However, there is no service worker, so reloading the page while offline depends on your
browser's ordinary HTTP cache and may fail.

Importing games always requires a connection, since it reads from Chess.com or Lichess.

## Which browsers are supported?

LealChess is tested against Chromium, Firefox, and WebKit on desktop, plus mobile Chromium. Recent
versions of Chrome, Edge, Firefox, and Safari all work.

## How do I import my games?

Go to **Learn**, choose Chess.com or Lichess, and enter the username you play under. LealChess reads
the games you have already published on that platform. You can then analyze them and practice the
positions where the game turned.

## Why is analysis slow sometimes?

Stockfish runs locally in a Web Worker, so analysis speed depends on your device's CPU rather than
on a server. Deeper searches take longer. You can adjust the analysis depth and engine profile in
**Settings** — a lighter profile returns results faster with less precision.

The first analysis after loading the site is also slower, because the engine binary has to download
and cache before it can start.

## Can I sync between my laptop and my phone?

Not currently. Data is scoped to a single browser profile on a single device. There is no cloud
storage to synchronize through.

## Will clearing my browser data delete my games?

Yes. Clearing site data for lealchess.com removes everything permanently, and there is no server-side
backup to restore from. The same applies to private or incognito windows, which discard their data
when closed.

## Is LealChess really free?

Yes, and it is open source under [GPL-3.0-only](../LICENSE). There is no paid tier, no advertising,
and no telemetry.

## How strong is the engine?

It is Stockfish — one of the strongest chess engines in existence. When you play a game you choose
an opponent strength, and LealChess limits the engine to match. Analysis always runs at full
strength for the configured depth.

## Can I analyze a position that is not from one of my games?

Yes. Use **Explorer** to set up any position, either by playing moves out or by entering a FEN
string directly, then analyze and branch through variations from there.

## I found a bug, or I want a feature

Open an issue at
[github.com/Swellshinider/LealChess/issues](https://github.com/Swellshinider/LealChess/issues).
For security problems, please use
[private vulnerability reporting](https://github.com/Swellshinider/LealChess/security/advisories/new)
instead of a public issue — see [SECURITY.md](../SECURITY.md).
