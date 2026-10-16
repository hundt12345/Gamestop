/* ---------------------------------------------------------------------------
 * GameStop / Event Tape
 *
 * • prices: real GME daily OHLCV from market-data.js (refreshed by
 *   .github/workflows/refresh-market-data.yml), quoted as traded at the time.
 * • the terminal chart renders only the visible slice of the series, so it can
 *   zoom from "full seven years" down to a handful of trading days.
 * • every story event pops up inside the chart, anchored to its own candle.
 * ------------------------------------------------------------------------ */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARKET = typeof window !== 'undefined' ? window.GME_DAILY : null;

/* ------------------------------------------------------------ support --- */
/* SUPPORT-BUTTON EINRICHTEN (eine Zeile):
 * 1. Kostenlos Konto anlegen — Empfehlung: https://ko-fi.com (0 % Plattform-
 *    gebühr auf Tips) oder https://www.patreon.com (Memberships/Tiers).
 * 2. Dort deine Seite erstellen, z. B. ko-fi.com/DEINNAME, und PayPal/Stripe
 *    für Auszahlungen verbinden.
 * 3. Die fertige URL hier bei `url` eintragen — Header-, Support- und
 *    Footer-Button verlinken dann automatisch dorthin. Solange `url` leer
 *    ist, führt der Button nur zur Erklär-Sektion #support auf dieser Seite. */
const SUPPORT = {
  provider: 'Ko-fi',
  url: '' // <-- z. B. 'https://ko-fi.com/DEINNAME' oder 'https://www.patreon.com/DEINNAME'
};

/* ---------------------------------------------------------------- loading - */

// Only used when market-data.js did not load: a coarse tape through the real
// closes of the story events, so the page never renders an empty chart.
const FALLBACK_ANCHORS = [
  ['2019-12-02', 6.17], ['2020-09-01', 7.65], ['2020-11-16', 12.06], ['2021-01-15', 35.5],
  ['2021-01-27', 347.51], ['2021-01-28', 193.6], ['2021-02-18', 40.69], ['2021-06-09', 302.56],
  ['2022-07-22', 35.78], ['2023-03-22', 23.87], ['2024-05-13', 30.45], ['2026-10-13', 27.22]
];

function parseMarketRows(payload) {
  const bars = [];
  if (!payload?.rows) return bars;
  String(payload.rows).trim().split('\n').forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) return;
    const [date, open, high, low, close, volume] = parts;
    const time = Date.parse(`${date}T00:00:00Z`);
    const bar = {
      date,
      time,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume) || 0
    };
    if (!Number.isFinite(time)) return;
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return;
    bars.push(bar);
  });
  return bars.sort((a, b) => a.time - b.time);
}

function seededNoise(index, amount = 1) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return ((value - Math.floor(value)) - 0.5) * amount;
}

function buildFallbackBars() {
  const anchors = FALLBACK_ANCHORS.map(([date, price]) => ({ time: Date.parse(`${date}T00:00:00Z`), price }));
  const priceAt = (time) => {
    let left = anchors[0];
    let right = anchors[anchors.length - 1];
    for (let index = 0; index < anchors.length - 1; index += 1) {
      if (time >= anchors[index].time && time <= anchors[index + 1].time) {
        left = anchors[index];
        right = anchors[index + 1];
        break;
      }
    }
    const progress = Math.min(1, Math.max(0, (time - left.time) / Math.max(1, right.time - left.time)));
    return Math.exp(Math.log(left.price) + (Math.log(right.price) - Math.log(left.price)) * progress);
  };

  const bars = [];
  const cursor = new Date(anchors[0].time);
  const end = anchors[anchors.length - 1].time;
  while (cursor.getTime() <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const time = cursor.getTime();
      const index = bars.length;
      const close = Math.max(0.6, priceAt(time) * (1 + seededNoise(index, 0.035)));
      const open = Math.max(0.6, close * (1 + seededNoise(index + 17, 0.02)));
      bars.push({
        date: new Date(time).toISOString().slice(0, 10),
        time,
        open,
        high: Math.max(open, close) * (1 + Math.abs(seededNoise(index + 5, 0.022))),
        low: Math.min(open, close) * (1 - Math.abs(seededNoise(index + 11, 0.022))),
        close,
        volume: Math.round((6 + Math.abs(seededNoise(index + 3, 40))) * 1e6)
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars;
}

const parsedBars = parseMarketRows(MARKET);
const usingFallback = parsedBars.length < 120;
const dailyBars = usingFallback ? buildFallbackBars() : parsedBars;

const marketMeta = {
  symbol: MARKET?.symbol ?? 'GME',
  source: usingFallback ? 'built-in fallback tape' : (MARKET?.source ?? 'Yahoo Finance'),
  updated: usingFallback ? dailyBars[dailyBars.length - 1].date : (MARKET?.updated ?? dailyBars[dailyBars.length - 1].date),
  end: dailyBars[dailyBars.length - 1].date,
  asTraded: MARKET?.asTraded ?? true,
  splits: Array.isArray(MARKET?.splits) ? MARKET.splits.filter((split) => split?.date) : []
};

/* --------------------------------------------------------- price modes --- */

// Split-bereinigt: alle Kurse vor einem Split werden durch das Split-Verhältnis
// geteilt, damit die Kurve über den 4:1-Split (Juli 2022) hinweg vergleichbar
// bleibt. "as traded" zeigt die Kurse so, wie sie damals im Tape standen.
const priceMode = {
  mode: marketMeta.splits.length > 0 ? 'adjusted' : 'asTraded',
  available: marketMeta.splits.length > 0
};

function splitFactorBefore(date) {
  let factor = 1;
  marketMeta.splits.forEach((split) => {
    if (date < split.date) factor *= Number(split.ratio) || 4;
  });
  return factor;
}

const asTradedBars = dailyBars;
const adjustedBars = priceMode.available
  ? dailyBars.map((bar) => {
      const factor = splitFactorBefore(bar.date);
      if (factor === 1) return bar;
      return {
        ...bar,
        open: bar.open / factor,
        high: bar.high / factor,
        low: bar.low / factor,
        close: bar.close / factor,
        volume: bar.volume * factor
      };
    })
  : dailyBars;

function activeDailyBars() {
  return priceMode.mode === 'adjusted' ? adjustedBars : asTradedBars;
}

/* ----------------------------------------------------------------- events - */

const eventMedia = {
  'event-rc': [
    { kind: 'MEME', title: 'A thesis gets a face', source: 'X / Ryan Cohen', url: 'https://x.com/ryancohen', mark: 'RC' },
    { kind: 'DOC', title: 'Ownership trail', source: 'SEC / GameStop filings', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', mark: '13D' },
    { kind: 'VIDEO', title: 'The entry, in context', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=Ryan+Cohen+GameStop+2020', mark: '▶' }
  ],
  'event-letter': [
    { kind: 'DOC', title: 'Open letter / full text', source: 'GameStop investor relations', url: 'https://investor.gamestop.com/', mark: 'READ' },
    { kind: 'MEME', title: 'When the thesis goes public', source: 'Community archive', url: 'https://www.reddit.com/r/wallstreetbets/', mark: 'THESIS' },
    { kind: 'VIDEO', title: 'Strategy in the feed', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=Ryan+Cohen+GameStop+letter+2020', mark: '▶' }
  ],
  'event-dfv': [
    { kind: 'MEME', title: 'I like the stock', source: 'X / Roaring Kitty', url: 'https://x.com/TheRoaringKitty', mark: 'LIKE' },
    { kind: 'GIF', title: 'Screenshot culture', source: 'Giphy / GameStop search', url: 'https://giphy.com/search/gamestop', mark: 'GIF' },
    { kind: 'VIDEO', title: 'DFV / original videos', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=Roaring+Kitty+GameStop+DFV', mark: '▶' }
  ],
  'event-squeeze': [
    { kind: 'GIF', title: 'The line goes vertical', source: 'Giphy / squeeze search', url: 'https://giphy.com/search/gamestop-squeeze', mark: '↑' },
    { kind: 'VIDEO', title: 'The week in tape', source: 'YouTube / market archive', url: 'https://www.youtube.com/results?search_query=GameStop+January+2021+squeeze', mark: '▶' },
    { kind: 'DOC', title: 'Market structure notes', source: 'SEC / GameStop spotlight', url: 'https://www.sec.gov/spotlight/gamestop-short-squeeze.shtml', mark: 'SEC' }
  ],
  'event-robinhood': [
    { kind: 'MEME', title: 'Where is the buy button?', source: 'Robinhood / help center', url: 'https://robinhood.com/us/en/support/articles/why-cant-i-buy-a-stock/', mark: 'BUY?' },
    { kind: 'VIDEO', title: 'The moment becomes a hearing', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=Robinhood+GameStop+buy+button+January+2021', mark: '▶' },
    { kind: 'DOC', title: 'Access / testimony', source: 'SEC / testimony', url: 'https://www.sec.gov/news/testimony/gensler-testimony-financial-services-2021-02-18', mark: '8-K' }
  ],
  'event-hearing': [
    { kind: 'VIDEO', title: 'Congressional hearing', source: 'House Financial Services', url: 'https://financialservices.house.gov/calendar/eventsingle.aspx?EventID=4071076', mark: '▶' },
    { kind: 'MEME', title: 'I am not a cat', source: 'Hearing / public record', url: 'https://www.youtube.com/results?search_query=Keith+Gill+I+am+not+a+cat+hearing', mark: 'CAT' },
    { kind: 'DOC', title: 'The official record', source: 'House committee archive', url: 'https://financialservices.house.gov/', mark: 'PDF' }
  ],
  'event-superstonk': [
    { kind: 'DOC', title: 'Due diligence index', source: 'Superstonk / wiki', url: 'https://www.reddit.com/r/Superstonk/wiki/index/', mark: 'DD' },
    { kind: 'MEME', title: 'Community as archive', source: 'Superstonk / live feed', url: 'https://www.reddit.com/r/Superstonk/', mark: 'DD' },
    { kind: 'VIDEO', title: 'Explain the mechanics', source: 'YouTube / research search', url: 'https://www.youtube.com/results?search_query=Superstonk+due+diligence+GameStop', mark: '▶' }
  ],
  'event-split': [
    { kind: 'DOC', title: 'Split dividend release', source: 'GameStop investor relations', url: 'https://investor.gamestop.com/', mark: '4:1' },
    { kind: 'MEME', title: 'A new denominator', source: 'Giphy / stock split search', url: 'https://giphy.com/search/stock-split', mark: 'SPLIT' },
    { kind: 'DOC', title: 'Read the filing trail', source: 'SEC EDGAR', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', mark: 'EDGAR' }
  ],
  'event-profit': [
    { kind: 'DOC', title: 'Quarterly results', source: 'GameStop investor relations', url: 'https://investor.gamestop.com/financial-information/quarterly-results', mark: '10-Q' },
    { kind: 'VIDEO', title: 'Earnings, explained', source: 'YouTube / earnings search', url: 'https://www.youtube.com/results?search_query=GameStop+earnings+March+2023', mark: '▶' },
    { kind: 'MEME', title: 'Numbers over narrative', source: 'Community / research', url: 'https://www.gmedd.com/', mark: '$' }
  ],
  'event-return': [
    { kind: 'MEME', title: 'The avatar is back', source: 'X / Roaring Kitty', url: 'https://x.com/TheRoaringKitty', mark: '👀' },
    { kind: 'GIF', title: 'The feed wakes up', source: 'Giphy / Roaring Kitty search', url: 'https://giphy.com/search/roaring-kitty', mark: 'GIF' },
    { kind: 'VIDEO', title: 'Return / reaction loop', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=Roaring+Kitty+return+May+2024', mark: '▶' }
  ],
  'event-tail': [
    { kind: 'DOC', title: 'Warrants + filings', source: 'GameStop IR / SEC filings', url: 'https://investor.gamestop.com/financial-information/sec-filings', mark: '8-K' },
    { kind: 'DOC', title: 'Earnings / long tail', source: 'GameStop quarterly results', url: 'https://investor.gamestop.com/financial-information/quarterly-results', mark: '10-K' },
    { kind: 'DOC', title: 'Warrant terms (GME WS)', source: 'NYSE / NYSE listing', url: 'https://www.nyse.com/quote/XNYS:GME.WS', mark: 'WS' }
  ],
  'event-pivot': [
    { kind: 'DOC', title: 'Investment policy update', source: 'GameStop IR / news releases', url: 'https://investor.gamestop.com/news-releases', mark: '8-K' },
    { kind: 'DOC', title: 'Convertible notes trail', source: 'SEC EDGAR / CIK 1326380', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', mark: 'EDGAR' },
    { kind: 'VIDEO', title: 'Bitcoin treasury, explained', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=GameStop+bitcoin+treasury+2025', mark: '▶' }
  ],
  'event-bitcoin': [
    { kind: 'DOC', title: '“GameStop announces purchase of Bitcoin”', source: 'GameStop IR, 28.05.2025', url: 'https://investor.gamestop.com/news-releases/news-details/2025/GameStop-Announces-Purchase-of-Bitcoin/default.aspx', mark: '12.5' },
    { kind: 'DOC', title: 'The $2.25B follow-up raise', source: 'CoinDesk, 11.06.2025', url: 'https://www.coindesk.com/business/2025/06/11/gamestop-raising-another-175b-for-potential-bitcoin-purchases', mark: '₿' },
    { kind: 'VIDEO', title: '4,710 BTC in context', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=GameStop+4710+bitcoin', mark: '▶' }
  ],
  'event-warchest': [
    { kind: 'DOC', title: 'Q4 FY2025 results', source: 'GameStop IR / quarterly results', url: 'https://investor.gamestop.com/financial-information/quarterly-results', mark: '10-K' },
    { kind: 'DOC', title: '$9.01B in cash and securities', source: '24/7 Wall St., 25.03.2026', url: 'https://247wallst.com/investing/2026/03/25/gamestop-ceo-silent-on-mega-deal-as-it-crushes-earnings-stockpiles-cash/', mark: '$9B' },
    { kind: 'DOC', title: 'Bitcoin as a covered call', source: 'CoinDesk / 10-K, 26.03.2026', url: 'https://www.coindesk.com/business/2026/03/26/gamestop-turned-its-usd368-million-bitcoin-stash-into-an-options-income-play', mark: '₿' }
  ],
  'event-ebay': [
    { kind: 'DOC', title: 'eBay rejects the proposal', source: 'Variety / eBay press release', url: 'https://variety.com/2026/digital/news/ebay-rejects-gamestop-merger-proposal-1236745743/', mark: 'NO' },
    { kind: 'DOC', title: 'The retreat to a partnership', source: 'Bloomberg via LA Times, 11.08.2026', url: 'https://www.latimes.com/business/story/2026-08-11/why-gamestops-bold-56-billion-play-for-ebay-is-suddenly-in-doubt', mark: '56B' },
    { kind: 'DOC', title: 'Stake + filings', source: 'SEC EDGAR / CIK 1326380', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', mark: '13D' }
  ],
  'event-buyback': [
    { kind: 'DOC', title: 'Record net income of $389.6M', source: 'GameStop IR / Yahoo Finance', url: 'https://finance.yahoo.com/markets/stocks/articles/gamestop-q1-2026-earnings-record-115457004.html', mark: 'Q1' },
    { kind: 'DOC', title: 'The $2B repurchase authorisation', source: 'GameStop IR / quarterly results', url: 'https://investor.gamestop.com/financial-information/quarterly-results', mark: '$2B' },
    { kind: 'VIDEO', title: 'The buyback, explained', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=GameStop+2+billion+buyback+2026', mark: '▶' }
  ]
};

const storyEvents = [
  { id: 'event-rc', date: 'SEP 2020', iso: '2020-09-01', title: 'The activist entry', label: 'RC / ENTRY', tag: 'RC enters the frame' },
  { id: 'event-letter', date: 'NOV 2020', iso: '2020-11-16', title: 'A letter, not a whisper', label: 'RC / LETTER', tag: 'read the thesis' },
  { id: 'event-dfv', date: 'JAN 2021', iso: '2021-01-15', title: 'DFV keeps showing the receipts', label: 'DFV / WSB', tag: 'posts become evidence' },
  { id: 'event-squeeze', date: '27 JAN 2021', iso: '2021-01-27', title: 'The squeeze goes vertical', label: 'SQUEEZE / PEAK', tag: 'the peak enters the feed' },
  { id: 'event-robinhood', date: '28 JAN 2021', iso: '2021-01-28', title: 'The buy button goes dark', label: 'BROKER / FRICTION', tag: 'access is part of the story' },
  { id: 'event-hearing', date: 'FEB 2021', iso: '2021-02-18', title: 'The hearing enters the record', label: 'HEARING / RECORD', tag: 'watch the room' },
  { id: 'event-superstonk', date: 'JUN 2021', iso: '2021-06-09', title: 'Superstonk builds an archive', label: 'DD / ARCHIVE', tag: 'read before you react' },
  { id: 'event-split', date: 'JUL 2022', iso: '2022-07-22', title: 'A split dividend, a new denominator', label: 'SPLIT / STRUCTURE', tag: 'read the release' },
  { id: 'event-profit', date: 'MAR 2023', iso: '2023-03-22', title: 'Profit changes the texture', label: 'EARNINGS / BUSINESS', tag: 'numbers over narrative' },
  { id: 'event-return', date: 'MAY 2024', iso: '2024-05-13', title: 'The return of Roaring Kitty', label: 'RETURN / VOLATILITY', tag: 'the avatar is back' },
  { id: 'event-pivot', date: 'MAR 2025', iso: '2025-03-25', title: 'The treasury pivot', label: 'TREASURY / BITCOIN', tag: 'the balance sheet turns' },
  { id: 'event-bitcoin', date: 'MAY 2025', iso: '2025-05-28', title: 'Four thousand seven hundred ten', label: 'BITCOIN / 4,710', tag: 'cash finds a new home' },
  { id: 'event-warchest', date: 'MAR 2026', iso: '2026-03-24', title: 'Nine billion in the drawer', label: 'WAR CHEST / 10-K', tag: 'and a Bitcoin footnote' },
  { id: 'event-ebay', date: 'MAY 2026', iso: '2026-05-12', title: 'The $56 billion wildcard', label: 'M&A / EBAY', tag: 'a retailer bids for a marketplace' },
  { id: 'event-buyback', date: 'JUN 2026', iso: '2026-06-02', title: 'Record profit, record firepower', label: 'EARNINGS / BUYBACK', tag: 'raising turns into spending' },
  { id: 'event-tail', date: 'OCT 2026', iso: null, title: 'Warrants, insiders, an open record', label: 'LONG TAIL / OPEN', tag: 'archive still updating' }
].map((event) => ({ ...event, media: eventMedia[event.id] ?? [] }));

// the final anchor always points at the newest bar in the tape
storyEvents[storyEvents.length - 1].iso = marketMeta.end;

/* ----------------------------------------------------------- meme tape --- */

// Die Memes hängen direkt an echten Handelstagen: jede Karte wird im Chart an
// ihrem Bar verankert und lässt sich dort abspielen. Statt reiner Textkarten
// trägt inzwischen jeder Moment echtes Bildmaterial — GIFs laufen direkt von
// Giphy, Videos über den YouTube-nocookie-Player. Jedes Medium bleibt mit
// seinem Quellpost verlinkt: die Einbettung ersetzt den Beleg nicht.

const gif = (id, slug, credit, title) => ({
  kind: 'gif',
  src: `https://media.giphy.com/media/${id}/giphy.gif`,
  page: `https://giphy.com/gifs/${slug}`,
  credit,
  title
});

const video = (id, credit, title) => ({
  kind: 'video',
  embed: `https://www.youtube-nocookie.com/embed/${id}`,
  poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  page: `https://www.youtube.com/watch?v=${id}`,
  credit,
  title
});

const memeMoments = [
  {
    id: 'meme-thesis', iso: '2020-09-01', label: 'RC / ENTRY',
    frames: [
      { quote: 'CHWY 2.0?', caption: 'the thesis gets a mascot.' },
      { quote: 'RC ENTERS THE FRAME', caption: 'a stake becomes a story.' },
      { quote: 'A RETAILER, RE-PRICED', caption: 'the reading changes before the chart does.' }
    ],
    media: [
      gif('MFsqcBSoOKPbjtmvWz', 'money-make-it-rain-MFsqcBSoOKPbjtmvWz', 'GIPHY', 'make it rain / stonks'),
      gif('bz5mxPNeI2CCJGZUFk', 'HeroGalaxyNFT-herogalaxy-hero-galaxy-memestocks-bz5mxPNeI2CCJGZUFk', 'GIPHY', 'GME / meme stocks')
    ]
  },
  {
    id: 'meme-letter', iso: '2020-11-16', label: 'RC / LETTER',
    frames: [
      { quote: 'A LETTER, NOT A WHISPER', caption: 'a position becomes a thesis.' },
      { quote: 'CUSTOMER OBSESSION', caption: 'the letter reads like a product brief.' },
      { quote: 'NO EASY MODE', caption: 'the board is told to move faster.' }
    ],
    media: [
      gif('bzWW5589KIccDHEeM7', 'stonks-gamespot-gamestonks-bzWW5589KIccDHEeM7', 'GIPHY', 'stonks / stock market'),
      gif('S6NIfCsZz2ZnayHGOm', 'thecouponcause-faq-coupon-cause-gamestop-S6NIfCsZz2ZnayHGOm', 'GIPHY', 'FAQ GameStop')
    ]
  },
  {
    id: 'meme-board', iso: '2021-01-11', label: 'BOARD SEAT',
    frames: [
      { quote: 'HE JOINS THE BOARD', caption: 'the catalyst is a person.' },
      { quote: 'THE TAPE RE-OPENS', caption: 'gap up, and it does not close.' },
      { quote: 'THE NAME ARRIVES FIRST', caption: 'the chart follows the story.' }
    ],
    media: [
      gif('64PMiABYkj5BpcaUYC', 'sonypictures-sony-pictures-dumb-money-64PMiABYkj5BpcaUYC', 'GIPHY / Sony Pictures', 'fist pump'),
      gif('kO8QTqSMRsGMTyADqQ', 'stonks-popcat-onlymaxi-kO8QTqSMRsGMTyADqQ', 'GIPHY', 'stonks popcat')
    ]
  },
  {
    id: 'meme-like', iso: '2021-01-15', label: 'DFV / WSB',
    frames: [
      { quote: 'I LIKE THE STOCK.', caption: 'conviction, condensed.' },
      { quote: 'DIAMOND HANDS 💎🙌', caption: 'slang becomes a strategy.' },
      { quote: 'THE RECEIPTS ARE PUBLIC', caption: 'each post is a data point.' }
    ],
    media: [
      gif('O6sIGaWMoYXTphXfPE', 'satishgaire-wsb-gme-gamestonks-O6sIGaWMoYXTphXfPE', 'GIPHY', 'GME / wallstreetbets'),
      gif('l3giLj8coa2HVnzgeF', 'wallstreet-wallstreetbets-kid-bets-l3giLj8coa2HVnzgeF', 'GIPHY', 'the kid bets')
    ]
  },
  {
    id: 'meme-tendieman', iso: '2021-01-19', label: 'TENDIEMAN ♪',
    frames: [
      { quote: 'SOON MAY THE TENDIEMAN COME', caption: 'to send our rocket into the sun.' },
      { quote: 'SING US A SONG, TENDIEMAN', caption: 'a sea shanty becomes the squeeze anthem.' },
      { quote: 'WE’LL TAKE OUR GAINS AND GO', caption: 'one day, when the trading is done.' }
    ],
    media: [
      video('umrR3Nl_DEQ', 'Sw4y / Antarres', 'The Tendieman — r/wallstreetbets Sea Shanty'),
      video('bZDMkzV_sTA', 'YouTube', 'Sing Us a Song, You’re the Tendieman')
    ]
  },
  {
    id: 'meme-yolo', iso: '2021-01-22', label: 'SECOND LEG',
    frames: [
      { quote: 'YOLO, BUT DOCUMENTED.', caption: 'risk, logged in public.' },
      { quote: 'IT\'S NOT FINANCIAL ADVICE', caption: 'the disclaimer outlives the thread.' },
      { quote: '43 → 65 → 76', caption: 'the second leg leaves without pausing.' }
    ],
    media: [
      gif('i33719vyOjNYI', 'the-wolf-of-wall-street-i33719vyOjNYI', 'GIPHY', 'wolf of wall street'),
      gif('IgiVDEpoMTk0PEVbuW', 'meme-market-stonks-IgiVDEpoMTk0PEVbuW', 'GIPHY', 'market / stonks')
    ]
  },
  {
    id: 'meme-moon', iso: '2021-01-25', label: 'TO THE MOON',
    frames: [
      { quote: 'TO THE MOON 🚀', caption: 'the line stops behaving.' },
      { quote: 'THIS IS THE WAY.', caption: 'the feed becomes a rally.' },
      { quote: 'HOLD THE LINE', caption: 'and the line holds anyway.' }
    ],
    media: [
      gif('DnMMGxEvniha7CvASq', 'GetPartiful-to-the-moon-gme-stock-DnMMGxEvniha7CvASq', 'GIPHY / Partiful', 'to the moon / GME'),
      gif('IXWqceoF995QxrBnL0', 'bitcoin-cryptocurrency-diamond-hands-IXWqceoF995QxrBnL0', 'GIPHY', 'hold the line / diamond hands')
    ]
  },
  {
    id: 'meme-cats', iso: '2021-01-25', label: 'CAT MEMES 🐱',
    frames: [
      { quote: 'POPCAT KEEPS THE BEAT', caption: 'every green candle gets a pop.' },
      { quote: 'THE CAT TYPES THE DD', caption: 'research, but make it feline.' },
      { quote: 'WAKE UP — IT’S SQUEEZE DAY', caption: 'the cat saw the premarket first.' }
    ],
    media: [
      gif('kO8QTqSMRsGMTyADqQ', 'stonks-popcat-onlymaxi-kO8QTqSMRsGMTyADqQ', 'GIPHY', 'stonks popcat'),
      gif('5RNNQvq3fhYlOYDIQ2', 'cat-crypto-typing-5RNNQvq3fhYlOYDIQ2', 'GIPHY', 'the cat types'),
      gif('E4QIM9nyWe8ced5ciy', 'cat-elgatitolover-elgatitoloves-E4QIM9nyWe8ced5ciy', 'GIPHY', 'wake up cat')
    ]
  },
  {
    id: 'meme-diamond', iso: '2021-01-26', label: 'DIAMOND HANDS',
    frames: [
      { quote: 'DIAMOND HANDS', caption: 'no paper, no panic.' },
      { quote: 'I AM NOT SELLING', caption: 'the position is the personality.' },
      { quote: 'HANDS > PAPER', caption: 'the only exit is no exit.' }
    ],
    media: [
      gif('1569RvwRjejO2IcueA', 'hold-gme-diamond-hands-1569RvwRjejO2IcueA', 'GIPHY', 'GME diamond hands'),
      gif('fRloIBhOoPoUouMHt9', 'gme-hold-the-line-fRloIBhOoPoUouMHt9', 'GIPHY', 'hold the line')
    ]
  },
  {
    id: 'meme-squeeze', iso: '2021-01-27', label: 'SQUEEZE',
    frames: [
      { quote: 'MELVIN COVERS.', caption: 'the short goes back in at any price.' },
      { quote: 'GAMMA > GAMMA > GAMMA', caption: 'options supercharge the move.' },
      { quote: 'THE LINE GOES VERTICAL', caption: 'and halts on the way.' }
    ],
    media: [
      gif('5z25mOQ0J9FQfz4Fza', 'iTrendz-jim-cramer-itrendz-family-5z25mOQ0J9FQfz4Fza', 'GIPHY / iTrendz', 'Jim Cramer reaction'),
      gif('E4QIM9nyWe8ced5ciy', 'cat-elgatitolover-elgatitoloves-E4QIM9nyWe8ced5ciy', 'GIPHY', 'wake up cat')
    ]
  },
  {
    id: 'meme-button', iso: '2021-01-28', label: 'BUY BUTTON',
    frames: [
      { quote: 'WHERE IS THE BUY BUTTON?', caption: 'access becomes the question.' },
      { quote: 'TO THE MOON? TO THE EXIT.', caption: 'friction, live on tape.' },
      { quote: 'RECURING FUNDS ONLY 💵', caption: 'app stores enter the chart.' }
    ],
    media: [
      gif('ifxoZGl43nZUSp001k', 'hoojafun-buy-button-hooja-smash-ifxoZGl43nZUSp001k', 'GIPHY / Hooja', 'buy button smash'),
      gif('upmnPRawQ2m7tFtayy', 'sonypictures-sony-pictures-dumb-money-upmnPRawQ2m7tFtayy', 'GIPHY / Sony Pictures', 'cheers / Dumb Money')
    ]
  },
  {
    id: 'meme-bagholder', iso: '2021-01-29', label: 'TOP OF TAPE',
    frames: [
      { quote: 'FROM $17 TO $483', caption: 'roughly +2,700% in a month.' },
      { quote: 'TRADING HALTS ×9', caption: 'the market pauses; the feed does not.' },
      { quote: 'MEME, THEN MERGER', caption: 'the company becomes a plot point.' }
    ],
    media: [
      gif('U36ddMtv8IuyXr4NZd', 'regalmovies-gamestop-dumbmoney-dumb-money-U36ddMtv8IuyXr4NZd', 'GIPHY / Regal', 'GameStop stock'),
      gif('mCPjDTLBr5B2zrnNEB', 'barstoolsports-ddtg-davey-day-trader-daveydaytrader-mCPjDTLBr5B2zrnNEB', 'GIPHY / Barstool', 'davey day trader')
    ]
  },
  {
    id: 'meme-cat', iso: '2021-02-18', label: 'I AM NOT A CAT 🐱',
    frames: [
      { quote: 'I AM NOT A CAT.', caption: 'a meme becomes testimony.' },
      { quote: 'ARE YOU A CAT, MR. GILL?', caption: 'congress reads the feed.' },
      { quote: '5½ HOURS ON THE RECORD', caption: 'and the answers stay short.' }
    ],
    media: [
      gif('uwvSr7KNCJG0BPPJR0', 'news-i-am-not-a-cat-keith-gill-uwvSr7KNCJG0BPPJR0', 'GIPHY News', 'I am not a cat'),
      video('RfEuNHVPc_k', 'House Financial Services', 'Game Stopped? Who Wins and Loses — Full Hearing'),
      video('D7N4S_FKMq4', 'CNBC', 'GameStop hearing live — 18.02.2021')
    ]
  },
  {
    id: 'meme-dumbmoney', iso: '2021-02-22', label: 'DUMB MONEY',
    frames: [
      { quote: 'PAUL DANO AS RC', caption: 'the story gets a face on film.' },
      { quote: 'CHEERS EVERYONE!', caption: 'the streamer arrives in the film — and in life.' },
      { quote: 'ARCHIVE THE THREAD', caption: 'history is reassembled in real time.' }
    ],
    media: [
      gif('nZJK1KMwvq8rgNLOYx', 'sonypictures-sony-pictures-dumb-money-nZJK1KMwvq8rgNLOYx', 'GIPHY / Sony Pictures', 'Paul Dano at the stock board'),
      video('qqOZ5mo7vOw', 'The Roaring Kitty', 'Cheers Everyone! — 16.04.2021')
    ]
  },
  {
    id: 'meme-hodl', iso: '2021-03-15', label: 'HOLD',
    frames: [
      { quote: 'HOLD THE LINE.', caption: 'an internet learns to archive.' },
      { quote: 'SCREENSHOT EVERYTHING', caption: 'the thread becomes the source.' },
      { quote: 'DYOR.', caption: 'hype becomes due diligence.' }
    ],
    media: [
      gif('5W95WjMxcA7GutDkfp', 'sonypictures-sony-pictures-dumb-money-5W95WjMxcA7GutDkfp', 'GIPHY / Sony Pictures', 'hold the line'),
      gif('5RNNQvq3fhYlOYDIQ2', 'cat-crypto-typing-5RNNQvq3fhYlOYDIQ2', 'GIPHY', 'the cat types')
    ]
  },
  {
    id: 'meme-amc', iso: '2021-07-20', label: 'AMC / GME',
    frames: [
      { quote: 'WE LIKE THE STOCK, TOO.', caption: 'the phrase travels.' },
      { quote: 'THE SQUEEZE TRAVELS', caption: 'one name becomes a genre.' },
      { quote: 'MEME, LLC.', caption: 'the category outlives the trade.' }
    ],
    media: [
      gif('DMhDOItd4UPUO0RXpm', 'hodl-diamond-hands-we-like-the-stock-DMhDOItd4UPUO0RXpm', 'GIPHY', 'hold the line / AMC'),
      gif('YnkMcHgNIMW4Yfmjxr', 'stonks-stonk-YnkMcHgNIMW4Yfmjxr', 'GIPHY', 'stonks')
    ]
  },
  {
    id: 'meme-dd', iso: '2021-06-09', label: 'SUPERSTONK',
    frames: [
      { quote: 'SUPERSTONK.', caption: 'due diligence becomes a movement.' },
      { quote: 'READ BEFORE YOU REACT', caption: 'the archive is the strategy.' },
      { quote: 'THE STICKER IS A CTA', caption: 'flair carries the ticker.' }
    ],
    media: [
      gif('ntNdFG8QkRTZxFaHME', 'news-keith-gill-house-gamestop-hearing-ntNdFG8QkRTZxFaHME', 'GIPHY News', 'Roaring Kitty at the hearing'),
      gif('pHsMjEh1aDvJSrihob', 'news-stonk-keith-gill-investing-in-stonks-and-options-is-incredibly-reisky-pHsMjEh1aDvJSrihob', 'GIPHY News', 'stonks / options are risky')
    ]
  },
  {
    id: 'meme-amcmeme', iso: '2022-03-17', label: 'AMC STAKE',
    frames: [
      { quote: 'A 10-Q MENTIONS AMC', caption: 'a footnote becomes a headline.' },
      { quote: 'READ THE FOOTNOTE', caption: 'the tape punishes skimming.' },
      { quote: 'OPEN THE FILING', caption: 'primary sources still win.' }
    ],
    media: [
      gif('xOXkvayFj8rpjoHPI9', 'sonypictures-sony-pictures-dumb-money-xOXkvayFj8rpjoHPI9', 'GIPHY / Sony Pictures', 'cheers / read the room'),
      gif('1guRIREY9aVoblYv5gA', 'sbnation-buffett-1guRIREY9aVoblYv5gA', 'GIPHY / SB Nation', 'buffett reaction')
    ]
  },
  {
    id: 'meme-split', iso: '2022-07-22', label: 'SPLIT / 4:1',
    frames: [
      { quote: '1 ➜ 4', caption: 'the denominator changes.' },
      { quote: 'STILL LIKE THE STOCK.', caption: 'same thesis, new share count.' },
      { quote: 'AS TRADED ↔ ADJUSTED', caption: 'the chart finally offers both views.' }
    ],
    media: [
      gif('O6sIGaWMoYXTphXfPE', 'satishgaire-wsb-gme-gamestonks-O6sIGaWMoYXTphXfPE', 'GIPHY', 'GME / wallstreetbets'),
      gif('MFsqcBSoOKPbjtmvWz', 'money-make-it-rain-MFsqcBSoOKPbjtmvWz', 'GIPHY', 'make it rain')
    ]
  },
  {
    id: 'meme-profit', iso: '2023-03-22', label: 'FIRST PROFIT',
    frames: [
      { quote: 'FIRST PROFIT IN A DECADE', caption: 'numbers over narrative.' },
      { quote: 'THE SHOP FLOOR SAVED IT', caption: 'cost cuts, not memes.' },
      { quote: 'THE CHART FINALLY READS', caption: 'an operating story, not a joke.' }
    ],
    media: [
      gif('MFsqcBSoOKPbjtmvWz', 'money-make-it-rain-MFsqcBSoOKPbjtmvWz', 'GIPHY', 'make it rain'),
      gif('A8anAF2RR2GhvbNteo', 'hotheadcandles-elf-hot-head-candles-dilution-A8anAF2RR2GhvbNteo', 'GIPHY / Hot Head Candles', 'dilution elf')
    ]
  },
  {
    id: 'meme-return', iso: '2024-05-13', label: 'THE CAT RETURNS',
    frames: [
      { quote: '👀', caption: 'one post ends the silence.' },
      { quote: 'THE CAT IS BACK.', caption: 'the tape reacts in minutes.' },
      { quote: 'THREE YEARS LATER', caption: 'the account was never deleted.' }
    ],
    media: [
      gif('E4QIM9nyWe8ced5ciy', 'cat-elgatitolover-elgatitoloves-E4QIM9nyWe8ced5ciy', 'GIPHY', 'wake up cat'),
      gif('5RNNQvq3fhYlOYDIQ2', 'cat-crypto-typing-5RNNQvq3fhYlOYDIQ2', 'GIPHY', 'the cat types')
    ]
  },
  {
    id: 'meme-livestream', iso: '2024-06-07', label: 'LIVESTREAM',
    frames: [
      { quote: '400,000 WATCHING.', caption: 'the first stream in three years.' },
      { quote: '$320M, CONFIRMED', caption: 'the screenshot is the receipt.' },
      { quote: 'THE TAPE HALTS AGAIN', caption: 'volatility as a stream format.' }
    ],
    media: [
      video('U1prSyyIco0', 'The Roaring Kitty', 'Roaring Kitty Live Stream — 07.06.2024'),
      gif('ntNdFG8QkRTZxFaHME', 'news-keith-gill-house-gamestop-hearing-ntNdFG8QkRTZxFaHME', 'GIPHY News', 'Roaring Kitty')
    ]
  }
  ,{
    id: 'meme-welike', iso: '2021-01-28', label: 'WE LIKE THE STOCK / REMIX',
    frames: [{ quote: 'WE LIKE THE STOCK', caption: 'placeboing turns a television sound bite into a squeeze-era remix.' }],
    media: [{ ...video('71JOIJKbse0', 'placeboing', 'WE LIKE THE STOCK — Celebration Remix'), archive: 'https://knowyourmeme.com/videos/260546-wallstreetbets-gamestop-short-squeeze' }]
  },
  {
    id: 'meme-peoplebuy', iso: '2021-01-29', label: 'GAMESTONKS ANTHEM',
    frames: [{ quote: 'DO YOU HEAR THE PEOPLE BUY', caption: 'Chris Voiceman’s musical parody from the January 2021 squeeze.' }],
    media: [{ ...video('dYHa6bpa3V4', 'Chris Voiceman', 'DO YOU HEAR THE PEOPLE BUY — GAMESTONKS ANTHEM'), archive: 'https://knowyourmeme.com/videos/262750-wallstreetbets-gamestop-short-squeeze' }]
  },
  {
    id: 'meme-spartans', iso: '2021-01-31', label: '300 / GAMESTONKS',
    frames: [{ quote: '300 GAMESTOP GAMESTONKS', caption: 'Flashgitz’s animated 300 parody. Published January 31; anchored to the nearest trading session. Mature humor.' }],
    media: [{ ...video('cJd3LO6u1vY', 'Flashgitz', '300 GameStop GameStonks (mature humor)'), archive: 'https://knowyourmeme.com/videos/261203-wallstreetbets-gamestop-short-squeeze' }]
  },
  {
    id: 'meme-btc', iso: '2025-05-28', label: '4,710 ₿',
    frames: [
      { quote: 'FOUR THOUSAND SEVEN HUNDRED TEN.', caption: 'the balance sheet buys internet money with internet money.' },
      { quote: 'CASH → ₿ → …?', caption: 'the question runs for the next twelve months.' },
      { quote: 'TREASURY RESERVE ASSET', caption: 'a video game shop becomes a crypto story.' }
    ],
    media: []
  },
  {
    id: 'meme-ebay', iso: '2026-05-12', label: 'THE $56B BID',
    frames: [
      { quote: 'WE’LL TAKE THE MARKETPLACE.', caption: 'a ~$10B retailer bids $56B for eBay.' },
      { quote: '“NEITHER CREDIBLE NOR ATTRACTIVE.”', caption: 'eBay’s board, 12 May 2026.' },
      { quote: 'ONE WAY OR ANOTHER.', caption: 'the bidder keeps buying the stock instead.' }
    ],
    media: []
  },
  {
    id: 'meme-warrants', iso: '2026-09-09', label: 'FREE LOTTERY TICKETS',
    frames: [
      { quote: '1 WARRANT PER 10 SHARES.', caption: 'a dividend that only pays if the stock reaches $32.' },
      { quote: 'GME WS.', caption: 'listed, tradable, expiring 30 October 2026.' },
      { quote: 'INSIDERS KEEP BUYING.', caption: 'the tape ends on accumulation, not a climax.' }
    ],
    media: []
  }
];

/* ------------------------------------------- corporate events + RC tweets - */

// Einklappbarer Chart-Layer: Unternehmens-Ereignisse (Earnings, Aktien-
// Offerings/ATM, Split, Führung) als Rauten direkt auf der Kurslinie.
// Kuratierte Auswahl, keine vollständige Filing-Liste — jede Karte verlinkt
// auf die Primärquelle (GameStop IR / SEC EDGAR).
const corporateEvents = [
  { iso: '2020-12-09', type: 'earnings', title: 'Q3 2020 Earnings', detail: 'Quarterly results during the turnaround: revenue, margins and e-commerce put the RC thesis to the test.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2021-03-23', type: 'earnings', title: 'Q4 2020 Earnings', detail: 'The first results after the January squeeze. Attention shifts from memes back to business performance.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2021-04-26', type: 'offering', title: 'ATM offering completed', detail: 'GameStop completes its at-the-market offering, raising equity capital through share sales.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / CIK 1326380' },
  { iso: '2021-06-09', type: 'earnings', title: 'Q1 2021 earnings + annual meeting', detail: 'Quarterly results and the annual meeting: Ryan Cohen becomes chairman and another share offering is announced.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2021-06-22', type: 'offering', title: 'ATM completed: 5M shares', detail: 'The second major ATM offering is complete: five million shares sold to strengthen the balance sheet.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / CIK 1326380' },
  { iso: '2022-03-17', type: 'earnings', title: 'Q4 2021 Earnings', detail: 'A larger-than-expected loss puts pressure on the price. See the linked results for the company’s holdings and disclosures.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2022-03-31', type: 'other', title: 'Stock split dividend announced', detail: 'The board proposes a stock split in the form of a stock dividend, subject to shareholder approval.', url: 'https://investor.gamestop.com/', source: 'GameStop IR' },
  { iso: '2022-07-22', type: 'other', title: '4:1 split takes effect', detail: 'One share becomes four. Use SPLIT-ADJ or AS TRADED to switch between adjusted and historical quoted prices.', url: 'https://investor.gamestop.com/', source: 'GameStop IR' },
  { iso: '2023-03-21', type: 'earnings', title: 'Q4 2022: first profit in two years', detail: 'GameStop reports $48.2M in quarterly net income, compared with a $147.5M loss a year earlier. Shares jump the following day.', url: 'https://investor.gamestop.com/news-releases/news-details/2023/GameStop-Reports-Fourth-Quarter-and-Fiscal-Year-2022-Results-03-21-2023/default.aspx', source: 'GameStop IR / News release 21.03.2023' },
  { iso: '2023-09-28', type: 'other', title: 'Ryan Cohen becomes CEO', detail: 'Chairman Ryan Cohen also becomes CEO, without salary or cash bonuses.', url: 'https://investor.gamestop.com/', source: 'GameStop IR' },
  { iso: '2024-03-26', type: 'earnings', title: 'Q4 2023 Earnings', detail: 'GameStop returns to full-year profitability, reporting $1.199B in cash and marketable securities at year end.', url: 'https://investor.gamestop.com/news-releases/news-details/2024/GameStop-Reports-Fourth-Quarter-and-Fiscal-Year-2023-Results-03-26-2024/default.aspx', source: 'GameStop IR / News release 26.03.2024' },
  { iso: '2024-05-24', type: 'offering', title: 'ATM completed: $933.4M', detail: '45 million shares sold during Roaring Kitty’s return, raising approximately $933.4M in gross proceeds.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / GameStop IR, 24.05.2024' },
  { iso: '2024-06-07', type: 'earnings', title: 'Q1 2024 earnings + new ATM', detail: 'Quarterly results arrive before the market opens, alongside an offering for up to 75 million shares. Roaring Kitty streams the same day.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2024-06-11', type: 'offering', title: 'ATM completed: $2.137B', detail: 'All 75 million shares sold, raising approximately $2.137B in gross proceeds.', url: 'https://gamestop.gcs-web.com/news-releases/news-release-details/gamestop-completes-market-equity-offering-program-2', source: 'GameStop IR / News release 11.06.2024' },
  { iso: '2024-09-10', type: 'earnings', title: 'Q2 2024 Earnings', detail: 'An unexpected quarterly profit arrives alongside a new ATM program for up to 20 million shares.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2024-12-10', type: 'earnings', title: 'Q3 2024 Earnings', detail: 'Another profitable quarter and a growing cash balance prompt questions about capital allocation.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2025-03-25', type: 'earnings', title: 'Q4 2024 Earnings', detail: 'Annual results beat earnings-per-share expectations, followed by debate about a cryptocurrency treasury strategy.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2025-03-26', type: 'bitcoin', title: 'Bitcoin becomes a treasury asset', detail: 'The board approves Bitcoin as a treasury reserve asset and the company announces a convertible note offering — the start of the balance-sheet story that runs through 2026.', url: 'https://investor.gamestop.com/news-releases', source: 'GameStop IR / News releases' },
  { iso: '2025-05-28', type: 'bitcoin', title: '4,710 BTC acquired', detail: 'GameStop confirms the purchase of 4,710 Bitcoin for roughly $500 million, funded by the $1.5B convertible notes completed in April 2025.', url: 'https://investor.gamestop.com/news-releases/news-details/2025/GameStop-Announces-Purchase-of-Bitcoin/default.aspx', source: 'GameStop IR / News release 28.05.2025' },
  { iso: '2025-06-10', type: 'earnings', title: 'Q1 2025 Earnings', detail: 'Revenue of $732.4M and net income of $45M: the cost-cutting era shows up as profit, not growth.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2025-06-11', type: 'offering', title: 'Convertible notes: $2.25B', detail: 'A $1.75B zero-coupon convertible offering is upsized to $2.25B (plus a $450M option), conversion price around $28.91, due 2032.', url: 'https://www.coindesk.com/business/2025/06/11/gamestop-raising-another-175b-for-potential-bitcoin-purchases', source: 'CoinDesk / Company disclosure 11.06.2025' },
  { iso: '2025-09-09', type: 'earnings', title: 'Q2 2025 Earnings', detail: 'Revenue rises to $972.2M and EPS beats at $0.25 — the collectibles shift starts to carry the top line.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2025-12-09', type: 'earnings', title: 'Q3 2025 Earnings', detail: 'Revenue of $821.0M with EPS around $0.24. Roughly $4.2B of zero-coupon converts have now been issued during the fiscal year.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2026-01-23', type: 'bitcoin', title: '4,709 BTC moved to Coinbase Prime', detail: 'On-chain analysts flag the transfer of nearly the entire position (about $420M). The market reads it as an exit; the 10-K later explains it differently.', url: 'https://finance.yahoo.com/news/gamestop-transfers-420m-bitcoin-coinbase-095700064.html', source: 'Yahoo Finance / CryptoQuant, 25.01.2026' },
  { iso: '2026-03-24', type: 'earnings', title: 'Q4 2025: the war chest', detail: 'EPS of $0.49 against a $0.37 consensus. Full-year net income of $418.4M, $597.3M free cash flow and $9.01B in cash and marketable securities (a year earlier: $4.77B).', url: 'https://247wallst.com/investing/2026/03/25/gamestop-ceo-silent-on-mega-deal-as-it-crushes-earnings-stockpiles-cash/', source: '24/7 Wall St. / GameStop Q4 FY2025, 25.03.2026' },
  { iso: '2026-03-26', type: 'bitcoin', title: '10-K: Bitcoin as covered calls', detail: 'The 10-K discloses that 4,709 BTC were pledged to Coinbase Credit for an over-the-counter covered-call strategy with strikes near $105K–110K. The coins are derecognised and booked as a $368.3M receivable.', url: 'https://www.coindesk.com/business/2026/03/26/gamestop-turned-its-usd368-million-bitcoin-stash-into-an-options-income-play', source: 'CoinDesk / GameStop 10-K, 26.03.2026' },
  { iso: '2026-05-03', type: 'deal', title: 'A $56B bid for eBay', detail: 'A non-binding proposal for all eBay shares at $125, half cash and half GME stock — around $55.5B in equity value, with a TD Securities commitment for up to $20B of debt financing.', url: 'https://variety.com/2026/digital/news/ebay-rejects-gamestop-merger-proposal-1236745743/', source: 'Variety / eBay filing, 12.05.2026' },
  { iso: '2026-05-12', type: 'deal', title: 'eBay says no', detail: 'eBay’s board rejects the proposal as “neither credible nor attractive”, citing financing uncertainty, leverage and GameStop’s governance. GameStop keeps buying the stock.', url: 'https://variety.com/2026/digital/news/ebay-rejects-gamestop-merger-proposal-1236745743/', source: 'Variety / eBay press release, 12.05.2026' },
  { iso: '2026-06-02', type: 'earnings', title: 'Record quarter + $2B buyback', detail: 'Net income of $389.6M — the largest quarterly profit in company history — on $835.3M of revenue. Collectibles are 41.8% of sales. The board authorises a $2B repurchase programme through June 2029.', url: 'https://finance.yahoo.com/markets/stocks/articles/gamestop-q1-2026-earnings-record-115457004.html', source: 'GameStop IR / Yahoo Finance, 03.06.2026' },
  { iso: '2026-06-24', type: 'other', title: 'Cohen drops the $35B award', detail: 'The CEO withdraws a performance package that could have paid as much as $35B, saying leadership should focus on operating performance and the eBay proposal.', url: 'https://finance.yahoo.com/markets/stocks/articles/gamestop-ceo-ryan-cohen-drops-125431586.html', source: 'Yahoo Finance / Bloomberg, 24.06.2026' },
  { iso: '2026-08-10', type: 'deal', title: 'The eBay retreat', detail: 'Bloomberg reports Cohen is weighing pulling the $56B bid in favour of a partnership or joint venture that would give eBay access to roughly 1,600 US stores. GameStop holds 9.75% of eBay.', url: 'https://www.latimes.com/business/story/2026-08-11/why-gamestops-bold-56-billion-play-for-ebay-is-suddenly-in-doubt', source: 'Bloomberg via LA Times, 11.08.2026' },
  { iso: '2026-09-08', type: 'earnings', title: 'Q2 2026 Earnings', detail: 'EPS of $0.27 beats, revenue falls to $790.2M as the prior-year Switch 2 launch, store closures and the France divestiture drop out. Collectibles: 45.1% of net sales, up 57%.', url: 'https://247wallst.com/investing/2026/09/22/the-clock-is-ticking-on-gamestops-ebay-acquisition-play-as-warrants-near-expiration/', source: 'GameStop IR / 24/7 Wall St., 22.09.2026' },
  { iso: '2026-09-09', type: 'warrant', title: 'A warrant dividend: 1 per 10 shares', detail: 'A special dividend of roughly 59 million warrants, one for every ten shares, each exercisable at $32.00 until 30 October 2026 — up to about $1.9B if fully exercised.', url: 'https://finance.yahoo.com/news/dear-gamestop-stock-fans-mark-142619036.html', source: 'GameStop IR / Yahoo Finance, 07.10.2026' },
  { iso: '2026-09-11', type: 'other', title: 'Closed stores reopen', detail: '“Your local GameStop is back.” Select previously closed stores reopen nationwide from 11 September — the shrinking story briefly runs in reverse.', url: 'https://x.com/gamestop/status/2098086425459868055', source: 'GameStop on X, 10.09.2026' },
  { iso: '2026-10-07', type: 'warrant', title: 'GME WS starts trading', detail: 'The warrants are distributed to holders of record (3 October) and listed on the NYSE under the ticker GME WS. The clock on 30 October starts ticking.', url: 'https://finance.yahoo.com/news/dear-gamestop-stock-fans-mark-142619036.html', source: 'GameStop IR / Yahoo Finance, 07.10.2026' },
  { iso: '2026-10-13', type: 'other', title: 'Insider buying keeps running', detail: 'Another 844,130 shares bought by Ryan Cohen are disclosed, after 700,000 on 2 October at $24.41 and 1,150,680 on 21 September at $22.94. Three directors bought as well.', url: 'https://www.investing.com/news/insider-trading-news/gamestop-ceo-ryan-cohen-buys-171m-in-company-stock-93CH-4945934', source: 'SEC Form 4 via Investing.com, 13.10.2026' }
];

const CORP_TYPE = {
  earnings: { label: 'EARNINGS', glyph: 'E', word: 'Quarterly results' },
  offering: { label: 'OFFERING', glyph: '$', word: 'Share offering / convertible notes' },
  bitcoin: { label: 'BITCOIN', glyph: '₿', word: 'Treasury / digital assets' },
  deal: { label: 'M&A', glyph: '⇄', word: 'Acquisition / eBay' },
  warrant: { label: 'WARRANT', glyph: 'W', word: 'Warrant dividend' },
  other: { label: 'CORPORATE', glyph: '!', word: 'Corporate event' }
};

// RC-Tweets als native Karten im Chart: X-Einbettungen sind ohne Login oft
// blockiert, deshalb steht der Wortlaut hier als Text — mit Link aufs
// Original (@ryancohen) und auf eine dokumentierte Timeline als Beleg.
const rcTweets = [
  { iso: '2021-01-06', text: '💩', note: 'A Blockbuster store photo accompanies the post, responding to comparisons between GameStop and Blockbuster.', url: 'https://www.reddit.com/r/Superstonk/comments/p7mvxf/a_timeline_of_ryan_cohens_tweets_and_gme/', source: 'Superstonk / RC-Tweet-Timeline' },
  { iso: '2021-02-24', text: '🐸', note: 'A McDonald’s ice cream photo accompanies the frog emoji. GME closes at $91.71 that day, more than double its previous close.', url: 'https://kotaku.com/gamestop-stock-explodes-again-following-board-members-m-1846348996', source: 'Kotaku, 24.02.2021' },
  { iso: '2021-03-05', text: '📸 Pets.com puppet (screenshot)', note: 'A screenshot of the Pets.com mascot. Reuters links the afternoon price rise to this post.', url: 'https://www.reuters.com/business/retail-consumer/gamestop-spikes-investors-eye-cryptic-tweet-by-shareholder-2021-03-05/', source: 'Reuters, 05.03.2021' },
  { iso: '2021-04-16', text: '🤜🤛', note: 'A fist bump posted as Roaring Kitty increases his position; the community reads it as a sign of solidarity.', url: 'https://www.gmedd.com/tw/', source: 'GMEDD / Twitter Chatter' },
  { iso: '2021-07-04', text: 'Power to the Players 🇺🇸', note: 'The GameStop slogan as an Independence Day greeting — part company motto, part community rallying cry.', url: 'https://www.gmedd.com/tw/', source: 'GMEDD / Twitter Chatter' },
  { iso: '2021-07-19', text: 'PG-13', note: 'A photo with chopsticks in his nose. Some community members interpret PG-13 as page 13 of the prospectus; this is speculation, not confirmation.', url: 'https://www.reddit.com/r/Superstonk/comments/p7mvxf/a_timeline_of_ryan_cohens_tweets_and_gme/', source: 'Superstonk / RC-Tweet-Timeline' },
  { iso: '2021-09-26', text: 'Talk is cheap, it takes money to buy whiskey.', note: 'A quotation used as a leadership motto: less talk, more delivery. GMEDD provides additional context.', url: 'https://www.gmedd.com/tw/', source: 'GMEDD / Twitter Chatter' },
  { iso: '2021-10-31', text: 'MGGA', note: 'Make GameStop Great Again — four letters posted for Halloween.', url: 'https://markets.businessinsider.com/news/stocks/gamestop-stock-ryan-cohen-twitter-tesla-elon-musk-retail-traders-2021-11', source: 'Business Insider, Nov. 2021' },
  { iso: '2021-11-08', text: 'Deciding between two options for my GME shares: HOLD or HODL…', note: 'The chairman parodies Elon Musk’s share-sale poll and publicly signals that he is holding.', url: 'https://markets.businessinsider.com/news/stocks/gamestop-stock-ryan-cohen-twitter-tesla-elon-musk-retail-traders-2021-11', source: 'Business Insider, Nov. 2021' }
];

const RC_X_URL = 'https://x.com/ryancohen';

/* ------------------------------------------- TA desk / community reads --- */

// Der TA-Desk rechnet nur mit dem eigenen Tape (market-data.js) und verlinkt
// dorthin, wo die Community selbst analysiert. Jede Karte nennt, was sie
// liefert — die Auswahl ist redaktionell, keine Empfehlung.
const COMMUNITY_READS = [
  {
    kind: 'FORUM / TA',
    name: 'Superstonk — technical analysis feed',
    who: 'r/Superstonk',
    note: 'The running TA threads: wedges, pennants, “liquidity triggers”, support zones. Written by holders, updated daily — read the counterarguments in the comments.',
    url: 'https://www.reddit.com/r/Superstonk/search/?q=technical+analysis&restrict_sr=1&sort=new&t=year'
  },
  {
    kind: 'X / MELT-UP',
    name: 'James Roland — “The $GME Meltup Guy”',
    who: '@JRoland_',
    note: 'Posts melt-up formations, liquidity triggers and market-structure reads for GME. Charts and paid tools live at memestockwatch.com.',
    url: 'https://x.com/JRoland_',
    extra: { label: 'memestockwatch.com ↗', url: 'https://memestockwatch.com/' }
  },
  {
    kind: 'RESEARCH',
    name: 'GMEDD — research + chatter archive',
    who: 'gmedd.com',
    note: 'Long-form research, a data room and an archive of the tweets and posts that moved the tape. Useful for dating a rumour.',
    url: 'https://www.gmedd.com/'
  },
  {
    kind: 'ARCHIVE / DD',
    name: 'Superstonk DD index',
    who: 'r/Superstonk wiki',
    note: 'The wiki that explains the vocabulary — DRS, the swap basket debate, what “book” vs “plan” means — and collects the long-form theses.',
    url: 'https://www.reddit.com/r/Superstonk/wiki/index/'
  },
  {
    kind: 'ORIGINAL',
    name: 'Roaring Kitty',
    who: '@TheRoaringKitty',
    note: 'The original channel. When this account posts, the tape usually answers within minutes — that is the whole reason it is in this list.',
    url: 'https://x.com/TheRoaringKitty'
  },
  {
    kind: 'PRIMARY',
    name: 'SEC EDGAR — GameStop filings',
    who: 'CIK 1326380',
    note: '10-Ks, 10-Qs, 8-Ks, Form 4s and the 13D trail. Every claim in this archive is meant to be checkable here.',
    url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude'
  }
];

// Anker für die VWAPs: der Squeeze-Peak 2021, das Comeback 2024 und der
// Bilanz-Tag 2026 — „wo der durchschnittliche Käufer dieser Epoche sitzt“.
const TA_ANCHORS = [
  { iso: '2021-01-27', label: 'VWAP SINCE JAN 2021 PEAK', tone: 'red' },
  { iso: '2024-05-14', label: 'VWAP SINCE RK RETURN', tone: 'blue' },
  { iso: '2026-03-24', label: 'VWAP SINCE 2026 WAR-CHEST PRINT', tone: '' }
];

// Kult-Level, die in der Community zitiert werden — als LORE markiert,
// damit sie nicht mit gerechneten Marken verwechselt werden.
const TA_LORE_LEVELS = [
  { price: 483, label: 'LORE / $483 JAN-2021 PRINT', tone: 'red' },
  { price: 69, label: 'LORE / $69', tone: '' },
  { price: 20, label: 'LORE / $20 ZONE', tone: 'blue' }
];

// Das Zahlenschloss: jede Regel wird gegen das echte Tape geprüft, es gibt
// keine erfundenen Treffer. Gezählt wird im gerade angezeigten Kursmodus.
const RADAR_CODES = [
  {
    id: 'top',
    name: 'THE EXACT TOP',
    note: 'The highest price ever printed in this tape: $483.00 — the intraday high of 28 January 2021.',
    match: (bar) => Math.round(bar.high * 100) === 48300
  },
  {
    id: 'nice',
    name: 'NICE.',
    note: 'A close at x.69 — the community’s most reliable non-signal.',
    match: (bar) => centsOf(bar.close) === '69'
  },
  {
    id: 'deep',
    name: 'DEEP VALUE 042',
    note: 'A close at x.42 — the number from DFV’s screenshots.',
    match: (bar) => centsOf(bar.close) === '42'
  },
  {
    id: 'four20',
    name: 'FOUR-TWENTY, WITH INTEREST',
    note: 'A close at $4.20, $24.20 or $42.00. Yes, more than once.',
    match: (bar) => [420, 2420, 4200].includes(Math.round(bar.close * 100))
  },
  {
    id: 'whole',
    name: 'ROUND NUMBER',
    note: 'A flat dollar amount of $20 or more — the tape printing a round number.',
    match: (bar) => Math.round(bar.close * 100) % 100 === 0 && bar.close >= 20
  }
];

// Versteckte Codes: tippen, ohne in ein Feld zu schreiben. Die Liste steht im
// Codes-Panel (Knopf „⌨ CODES“ oder Taste ?).
const CODES = [
  { code: '741', label: '741', hint: 'Jump to the squeeze peak (27 Jan 2021)', action: 'jump', value: '2021-01-27' },
  { code: '483', label: '483', hint: 'Jump to the exact all-time-high print', action: 'jump', value: '2021-01-28' },
  { code: '0042', label: '0042', hint: 'Jump to the Roaring Kitty comeback', action: 'jump', value: '2024-05-14' },
  { code: 'btc', label: 'BTC', hint: 'Jump to the 4,710-Bitcoin day', action: 'jump', value: '2025-05-28' },
  { code: 'ebay', label: 'EBAY', hint: 'Jump to eBay’s rejection', action: 'jump', value: '2026-05-12' },
  { code: 'ws', label: 'WS', hint: 'Jump to the warrant-dividend day', action: 'jump', value: '2026-10-07' },
  { code: '420', label: '420', hint: 'Toggle the number radar', action: 'radar' },
  { code: '69', label: '69', hint: 'Toggle the lore levels ($483 / $69 / $20)', action: 'lore' },
  { code: 'ta', label: 'TA', hint: 'Open or close the TA desk', action: 'ta' },
  { code: 'rc', label: 'RC', hint: 'Toggle the RC tweet layer', action: 'tweets' },
  { code: 'tendieman', label: 'TENDIEMAN', hint: 'Open the fullscreen Tendieman mode', action: 'tendieman' },
  { code: 'shanty', label: 'SHANTY', hint: 'Play the sea shanty in the dock', action: 'meme', value: 'meme-tendieman' },
  { code: 'drs', label: 'DRS', hint: 'Jump to the latest DRS disclosure', action: 'drs' },
  { code: 'si', label: 'SI', hint: 'Toggle the short interest pane', action: 'pane', value: 'si' },
  { code: 'ftd', label: 'FTD', hint: 'Toggle the fails-to-deliver pane', action: 'pane', value: 'ftd' },
  { code: 'flows', label: 'FLOWS', hint: 'Toggle the market structure strip', action: 'flows' },
  { code: 'cat', label: 'CAT', hint: 'Play “I am not a cat”', action: 'meme', value: 'meme-cat' },
  { code: 'moon', label: 'MOON', hint: 'Rockets. Nothing else.', action: 'moon' }
];

/* --------------------------------------------------------- media helpers --- */

// Einbettungen sind optional: mit ausgeschaltetem MEDIA-Bereich bleibt der
// Player rein textlich und lädt nichts von fremden Servern.
let mediaEnabled = true;

function isGifMedia(media) {
  return media?.kind === 'gif' && typeof media.src === 'string';
}

function isVideoMedia(media) {
  return media?.kind === 'video' && typeof media.embed === 'string';
}

function primaryMedia(moment, kind) {
  if (!moment || !Array.isArray(moment.media)) return null;
  return moment.media.find((entry) => entry?.kind === kind) ?? null;
}

// Ladefehler dürfen keine leere Fläche hinterlassen — dann bleibt der Text
// stehen und der Quelllink ist direkt klickbar.
function mediaFallback(target) {
  if (!target) return;
  target.hidden = false;
  target.classList.add('is-broken');
}

/* ------------------------------------------------------------ aggregation - */

function weekKey(time) {
  const date = new Date(time);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

function aggregateBars(bars, resolution) {
  if (resolution === 'day') return bars;
  const groups = new Map();
  bars.forEach((bar) => {
    const key = resolution === 'month' ? bar.date.slice(0, 7) : weekKey(bar.time);
    const bucket = groups.get(key);
    if (!bucket) {
      groups.set(key, { ...bar, startDate: bar.date, endDate: bar.date });
      return;
    }
    bucket.high = Math.max(bucket.high, bar.high);
    bucket.low = Math.min(bucket.low, bar.low);
    bucket.close = bar.close;
    bucket.volume += bar.volume;
    bucket.endDate = bar.date;
  });
  return [...groups.values()];
}

const seriesCache = new Map();
function seriesCacheKey(resolution) {
  return `${resolution}|${priceMode.mode}`;
}
function seriesFor(resolution) {
  const key = seriesCacheKey(resolution);
  if (!seriesCache.has(key)) seriesCache.set(key, aggregateBars(activeDailyBars(), resolution));
  return seriesCache.get(key);
}

function barIndexForDate(series, iso) {
  if (!iso) return series.length - 1;
  let index = 0;
  for (let cursor = 0; cursor < series.length; cursor += 1) {
    if (series[cursor].date <= iso) index = cursor;
    else break;
  }
  return index;
}

const eventIndexCache = new Map();
function eventIndices(resolution) {
  const key = seriesCacheKey(resolution);
  if (!eventIndexCache.has(key)) {
    const series = seriesFor(resolution);
    eventIndexCache.set(key, storyEvents.map((event) => barIndexForDate(series, event.iso)));
  }
  return eventIndexCache.get(key);
}

const memeIndexCache = new Map();
function memeIndices(resolution) {
  const key = seriesCacheKey(resolution);
  if (!memeIndexCache.has(key)) {
    const series = seriesFor(resolution);
    memeIndexCache.set(key, memeMoments.map((meme) => barIndexForDate(series, meme.iso)));
  }
  return memeIndexCache.get(key);
}

const layerIndexCache = new Map();
function layerIndices(kind, resolution) {
  const key = `${kind}|${seriesCacheKey(resolution)}`;
  if (!layerIndexCache.has(key)) {
    const series = seriesFor(resolution);
    const items = layerItems(kind);
    layerIndexCache.set(key, items.map((item) => barIndexForDate(series, item.iso)));
  }
  return layerIndexCache.get(key);
}

// Regel-Wortlaut für die Detailkarte — nachvollziehbar statt Blackbox.
function radarRule(id) {
  const rules = {
    top: 'high === $483.00',
    nice: 'close cents === 69',
    deep: 'close cents === 42',
    four20: 'close ∈ {$4.20, $24.20, $42.00}',
    whole: 'close % $1 === 0 and close ≥ $20'
  };
  return rules[id] ?? '—';
}

function layerItems(kind) {
  if (kind === 'corp') return corporateEvents;
  if (kind === 'tweet') return rcTweets;
  if (kind === 'number') return radarList();
  return [];
}

// Zustand des einklappbaren Chart-Layers (Events + RC-Tweets)
const layerState = {
  corp: true,
  tweets: true,
  numbers: true,
  corpFilter: 'all', // all | earnings | offering | bitcoin | deal | warrant | other
  active: null // { kind: 'corp' | 'tweet' | 'number', index }
};

/* ------------------------------------------------- TA desk / analytics --- */

// Alles hier wird aus market-data.js gerechnet — kein fremder Feed, keine
// Meinung. Die Kennzahlen folgen dem angezeigten Kursmodus (split-bereinigt
// oder as traded), damit Chart und Tabelle nie auseinanderlaufen.

const taState = { lore: true };

function centsOf(value) {
  return String(Math.round(Math.abs(value) * 100) % 100).padStart(2, '0');
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function smaSeries(bars, period) {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let index = 0; index < bars.length; index += 1) {
    sum += bars[index].close;
    if (index >= period) sum -= bars[index - period].close;
    if (index >= period - 1) out[index] = sum / period;
  }
  return out;
}

// Wilder-RSI auf Tagesschluss — der Klassiker, den auch die Community nutzt.
function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = closes[index] - closes[index - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, delta)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -delta)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function realizedVol(closes, period = 20) {
  if (closes.length <= period) return null;
  const slice = closes.slice(-(period + 1));
  const returns = [];
  for (let index = 1; index < slice.length; index += 1) returns.push(Math.log(slice[index] / slice[index - 1]));
  const mean = average(returns);
  const variance = average(returns.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// Anchored VWAP: „wo der durchschnittliche Käufer dieser Epoche sitzt“.
function anchoredVwap(bars, iso) {
  let priceVolume = 0;
  let volume = 0;
  let sessions = 0;
  bars.forEach((bar) => {
    if (bar.date < iso) return;
    const typical = (bar.high + bar.low + bar.close) / 3;
    priceVolume += typical * (bar.volume || 1);
    volume += bar.volume || 1;
    sessions += 1;
  });
  if (!volume || sessions < 3) return null;
  return { price: priceVolume / volume, sessions };
}

// Volumen-Regale: die Kurszonen, in denen im letzten Jahr am meisten
// gehandelt wurde. Das ist Support/Resistance ohne Bauchgefühl.
function volumeShelves(bars, lookback = 260, bucketCount = 26, keep = 3) {
  const window = bars.slice(-lookback);
  if (window.length < 40) return [];
  const low = Math.min(...window.map((bar) => bar.low));
  const high = Math.max(...window.map((bar) => bar.high));
  if (!(high > low)) return [];
  const minLog = Math.log(Math.max(0.3, low));
  const maxLog = Math.log(high);
  const buckets = new Array(bucketCount).fill(0);
  window.forEach((bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const ratio = (Math.log(Math.max(0.3, typical)) - minLog) / (maxLog - minLog);
    const index = clamp(Math.floor(ratio * bucketCount), 0, bucketCount - 1);
    buckets[index] += bar.volume || 0;
  });
  const total = buckets.reduce((sum, value) => sum + value, 0) || 1;
  return buckets
    .map((volume, index) => {
      const ratio = (index + 0.5) / bucketCount;
      return { price: Math.exp(minLog + ratio * (maxLog - minLog)), share: volume / total };
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, keep)
    .sort((a, b) => b.price - a.price);
}

// Das Zahlenschloss: nur Regeln, die gegen das echte Tape laufen — geprüft
// wird immer das gedruckte („as traded“) Tape, denn Kult-Zahlen sind die
// Zahlen, die damals wirklich auf dem Ticker standen. Im split-bereinigten
// Modus sitzen die Sterne auf demselben Handelstag, nur der Kurs ist skaliert.
let radarListCache = null;
function radarList() {
  if (radarListCache) return radarListCache;
  const hits = [];
  asTradedBars.forEach((bar, index) => {
    const code = RADAR_CODES.find((entry) => entry.match(bar));
    if (code) hits.push({ iso: bar.date, close: bar.close, high: bar.high, volume: bar.volume, printedIndex: index, code });
  });
  radarListCache = hits;
  return hits;
}

const analyticsCache = new Map();
function tapeAnalytics() {
  const key = priceMode.mode;
  if (analyticsCache.has(key)) return analyticsCache.get(key);
  const bars = activeDailyBars();
  const closes = bars.map((bar) => bar.close);
  const sma50Raw = smaSeries(bars, 50);
  const sma200Raw = smaSeries(bars, 200);
  const sma50 = new Map();
  const sma200 = new Map();
  bars.forEach((bar, index) => {
    if (sma50Raw[index] !== null) sma50.set(bar.date, sma50Raw[index]);
    if (sma200Raw[index] !== null) sma200.set(bar.date, sma200Raw[index]);
  });
  const window52 = bars.slice(-252);
  const high52 = window52.length ? Math.max(...window52.map((bar) => bar.high)) : null;
  const low52 = window52.length ? Math.min(...window52.map((bar) => bar.low)) : null;
  const last = bars[bars.length - 1];
  const model = {
    bars,
    last,
    sma50,
    sma200,
    lastSma50: sma50Raw[sma50Raw.length - 1],
    lastSma200: sma200Raw[sma200Raw.length - 1],
    rsi14: rsi(closes, 14),
    rsi14Week: null,
    realizedVol20: realizedVol(closes, 20),
    high52,
    low52,
    volume5: average(bars.slice(-5).map((bar) => bar.volume)),
    volume60: average(bars.slice(-60).map((bar) => bar.volume)),
    highs: bars.reduce((best, bar) => (bar.high > best.high ? bar : best), bars[0]),
    shelves: volumeShelves(bars),
    anchors: TA_ANCHORS.map((anchor) => ({ ...anchor, vwap: anchoredVwap(bars, anchor.iso) }))
      .filter((anchor) => anchor.vwap)
  };
  if (model.volume60) model.volumeRatio = model.volume5 / model.volume60;
  analyticsCache.set(key, model);
  return model;
}

// Hype-Index: vier ehrliche Bestandteile, ein Witz-Ergebnis. Keine Prognose.
const hypeCache = new Map();
function hypeIndex() {
  const key = priceMode.mode;
  if (hypeCache.has(key)) return hypeCache.get(key);
  const bars = activeDailyBars();
  const recent = bars.slice(-20);
  const volScores = bars.map((bar, index) => (index < 20 ? 0 : Math.abs(bar.close / bars[index - 1].close - 1)));
  const current20 = average(volScores.slice(-20)) ?? 0;
  const percentile = volScores.filter((value) => value > 0 && value <= current20).length / Math.max(1, volScores.filter((value) => value > 0).length);
  const analytics = tapeAnalytics();
  const volumeRatio = analytics.volumeRatio ?? 1;
  const bigMoves = recent.length
    ? recent.filter((bar, index) => {
        const previous = bars[bars.length - recent.length + index - 1];
        if (!previous) return false;
        return Math.abs(bar.close / previous.close - 1) >= 0.04;
      }).length / recent.length
    : 0;
  const last = bars[bars.length - 1];
  const fromHigh = analytics.high52 ? Math.max(0, 1 - last.close / analytics.high52) : 0;
  const parts = [
    { name: 'VOLUME VS 60D', score: clamp((volumeRatio - 0.7) / 1.3 * 10, 0, 10), readout: `${volumeRatio.toFixed(2)}×` },
    { name: 'REALIZED VOL', score: clamp(percentile * 10, 0, 10), readout: `${(analytics.realizedVol20 ?? 0).toFixed(0)}% ann.` },
    { name: 'BIG MOVES / 20D', score: clamp(bigMoves * 20, 0, 10), readout: `${Math.round(bigMoves * 20)}% of sessions ≥4%` },
    { name: 'PROXIMITY TO 52W HIGH', score: clamp((1 - fromHigh) * 10, 0, 10), readout: `−${(fromHigh * 100).toFixed(1)}%` }
  ];
  const score = parts.reduce((sum, part) => sum + part.score, 0) / parts.length;
  const label = score >= 8.5 ? 'UNHINGED' : score >= 6.5 ? 'JACKED' : score >= 4.5 ? 'COILED' : score >= 2.5 ? 'STIRRING' : 'QUIET';
  const result = { score, label, parts };
  hypeCache.set(key, result);
  return result;
}

// Was auf dem Chart liegt, wenn der TA-Desk an ist.
const taModelCache = new Map();
function taModel() {
  const key = `${priceMode.mode}|${taState.lore ? 'lore' : 'nolore'}`;
  if (taModelCache.has(key)) return taModelCache.get(key);
  const analytics = tapeAnalytics();
  const levels = [];
  if (analytics.high52) {
    levels.push({ kind: 'ta-resistance', price: analytics.high52, label: `52W HIGH / ${formatAxisPrice(analytics.high52)}`, tone: 'red' });
  }
  if (analytics.low52) {
    levels.push({ kind: 'ta-support', price: analytics.low52, label: `52W LOW / ${formatAxisPrice(analytics.low52)}`, tone: 'blue' });
  }
  analytics.shelves.forEach((shelf, index) => {
    levels.push({
      kind: 'ta-shelf',
      price: shelf.price,
      label: index === 0 ? `VOLUME SHELF / ${formatAxisPrice(shelf.price)}` : '',
      tone: ''
    });
  });
  if (taState.lore) {
    TA_LORE_LEVELS.forEach((level) => levels.push({ kind: 'ta-lore', price: level.price, label: level.label, tone: level.tone }));
  }
  const model = { analytics, levels, anchors: analytics.anchors };
  taModelCache.set(key, model);
  return model;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function relativeChange(series, index) {
  const previousIndex = Math.max(0, index - 1);
  const previous = series[previousIndex]?.close;
  const current = series[index]?.close;
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previousIndex === index || previous === 0) return null;
  return (current / previous - 1) * 100;
}

/* ---------------------------------------------------------------- helpers - */

const priceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatPrice(value) {
  return `$${priceFormat.format(value)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '';
  const magnitude = Math.abs(value);
  const decimals = magnitude < 1 ? 2 : magnitude < 100 ? 1 : 0;
  return `${value >= 0 ? '+' : '−'}${magnitude.toFixed(decimals)}%`;
}

function formatDay(iso) {
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function formatShortDay(iso) {
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year.slice(-2)}`;
}

function formatMonth(iso) {
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

function formatCompact(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(Math.round(value));
}

function scrollCardIntoView(id) {
  const card = document.getElementById(id);
  if (card && typeof card.scrollIntoView === 'function') {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

// Vierstrahliger Stern für das Zahlenschloss („sparkle“).
function starPath(cx, cy, outer, inner) {
  const points = [];
  for (let step = 0; step < 8; step += 1) {
    const angle = (Math.PI / 4) * step - Math.PI / 2;
    const radius = step % 2 === 0 ? outer : inner;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text) element.textContent = text;
  return element;
}

function raf(callback) {
  if (typeof window.requestAnimationFrame === 'function') return window.requestAnimationFrame(callback);
  return window.setTimeout(callback, 16);
}

function nicePriceTicks(min, max, target = 6) {
  const span = Math.log(max / min);
  const ladder = [1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const factor = ladder.find((step) => Math.log(step) >= span / target) ?? 10;
  const magnitude = 10 ** Math.floor(Math.log10(min));
  const mantissas = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const startMantissa = mantissas.find((value) => value >= min / magnitude) ?? 10;
  const ticks = [];
  let value = startMantissa * magnitude;
  while (value <= max && ticks.length < 14) {
    ticks.push(Number(value.toPrecision(6)));
    value *= factor;
  }
  return ticks;
}

function formatAxisPrice(value) {
  if (value >= 100) return `$${Math.round(value)}`;
  if (value >= 10) return `$${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
  return `$${value.toFixed(2)}`;
}

/* ------------------------------------------------------------ chart state - */

// ppb = Pixel pro Balken. Das Startfenster ist bewusst eng: beim Laden sind
// höchstens ~ein Monat Tape sichtbar (ca. 21 Handelstage), erst FIT oder
// Herauszoomen öffnet die ganze Historie.
const CHART_LIMITS = {
  day: { min: 0.45, max: 260, window: 21 },
  week: { min: 1.6, max: 360, window: 5 },
  month: { min: 3.2, max: 520, window: 2 }
};

const PLOT = { top: 26, bottom: 46, volume: 54, gap: 12 };
const OVERSCAN = 60;
const PLAYHEAD_RATIO = 0.88;

function windowPpb(resolution) {
  const limits = CHART_LIMITS[resolution] ?? CHART_LIMITS.day;
  const { width } = terminalMetrics();
  return clamp(width / limits.window, limits.min, limits.max);
}

const chartState = {
  resolution: 'day',
  ppb: CHART_LIMITS.day.window > 0 ? 1200 / CHART_LIMITS.day.window : 3.4,
  mode: 'line',
  activeIndex: storyEvents.length - 1,
  calloutHidden: false
};

// click-to-inspect: der Bar + die exakte Kursposition, auf die geklickt wurde
const inspectState = { barIndex: null, price: null, pixelY: null };
// y↔price mapping des zuletzt gezeichneten Terminal-Charts (für Klicks)
let terminalScale = null;

const memePlayerState = { index: null, frame: 0, playing: false, startedAt: 0, rafId: null };
const MEME_FRAME_MS = 3000;

function memesEnabled() {
  return !document.body.classList.contains('memes-off');
}

function taActive() {
  return document.body.classList.contains('ta-active');
}

// the terminal canvas only has to be re-drawn when its window, zoom or the
// active event changes — panning alone just moves the existing canvas.
let terminalPaintKey = '';
let storyPaintKey = '';

let followPageScrollUntil = 0;

/* --------------------------------------------------------------- drawing - */

function drawSeries(svg, options) {
  const {
    bars, from, to, ppb, height, priceTop, priceBottom, volumeTop, volumeBottom,
    domainFrom, domainTo, events, activeIndex, splits, ta, axisInCanvas, interactive, gradientId,
    priceMode: mode = 'asTraded', inspect = null, memes = null, corp = null, tweets = null, numbers = null, activeLayer = null
  } = options;

  svg.replaceChildren();
  const width = Math.max(24, (to - from + 1) * ppb);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;

  const x = (index) => (index - from + 0.5) * ppb;
  const slice = bars.slice(Math.max(0, domainFrom), Math.min(bars.length - 1, domainTo) + 1);
  const lows = slice.map((bar) => bar.low);
  const highs = slice.map((bar) => bar.high);
  const min = Math.max(0.4, Math.min(...lows) * 0.92);
  const max = Math.max(...highs) * 1.07;
  const minLog = Math.log(Math.max(0.4, min));
  const maxLog = Math.log(Math.max(min * 1.05, max));
  const y = (price) => priceBottom - ((Math.log(Math.max(0.3, price)) - minLog) / (maxLog - minLog)) * (priceBottom - priceTop);
  const yToPrice = (pixel) => {
    const clamped = clamp(pixel, priceTop, priceBottom);
    return Math.exp(minLog + ((priceBottom - clamped) / (priceBottom - priceTop)) * (maxLog - minLog));
  };

  const defs = svgElement('defs');
  const gradient = svgElement('linearGradient', { id: gradientId, x1: '0', x2: '0', y1: '0', y2: '1' });
  gradient.append(
    svgElement('stop', { offset: '0%', 'stop-color': '#d8f13e', 'stop-opacity': '0.2' }),
    svgElement('stop', { offset: '100%', 'stop-color': '#d8f13e', 'stop-opacity': '0' })
  );
  defs.append(gradient);
  svg.append(defs);

  const grid = svgElement('g', { 'aria-hidden': 'true' });
  const ticks = nicePriceTicks(Math.exp(minLog), Math.exp(maxLog));
  ticks.forEach((value) => {
    const lineY = y(value);
    grid.append(svgElement('line', { class: 'chart-grid major', x1: 0, x2: width, y1: lineY, y2: lineY }));
    if (axisInCanvas) {
      grid.append(svgElement('text', { class: 'chart-axis-label', x: 8, y: lineY + 4 }, formatAxisPrice(value)));
    }
  });

  const labelStep = (() => {
    const target = Math.max(1, Math.round(118 / ppb));
    const steps = [1, 2, 3, 5, 8, 10, 15, 20, 25, 50, 100, 150, 250];
    return steps.find((step) => step >= target) ?? 250;
  })();

  const labelFor = (bar) => {
    const date = new Date(bar.time);
    if (ppb >= 15) return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    if (ppb >= 4.5) return `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
    return String(date.getUTCFullYear());
  };

  const labelStart = Math.ceil(from / labelStep) * labelStep;
  for (let index = labelStart; index <= to; index += labelStep) {
    const gridX = x(index);
    grid.append(
      svgElement('line', { class: 'chart-grid', x1: gridX, x2: gridX, y1: priceTop, y2: volumeBottom }),
      svgElement('text', { class: 'chart-date-label', x: gridX, y: height - 13, 'text-anchor': 'middle' }, labelFor(bars[index]))
    );
  }
  svg.append(grid);

  const visible = bars.slice(from, to + 1);
  const linePath = visible.map((bar, offset) => `${offset === 0 ? 'M' : 'L'}${x(from + offset).toFixed(2)},${y(bar.close).toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${x(to).toFixed(2)},${priceBottom} L${x(from).toFixed(2)},${priceBottom} Z`;
  const lineGroup = svgElement('g', { class: 'line-mode' });
  const area = svgElement('path', { class: 'chart-area', d: areaPath });
  area.style.fill = `url(#${gradientId})`;
  lineGroup.append(
    area,
    svgElement('path', { class: 'chart-line-underlay', d: linePath }),
    svgElement('path', { class: 'chart-line', d: linePath })
  );
  svg.append(lineGroup);

  const candleGroup = svgElement('g', { class: 'candle-mode' });
  candleGroup.classList.add(ppb >= 2.2 ? 'is-detailed' : 'is-dense');
  const bodyWidth = clamp(ppb * 0.66, 0.7, 26);
  if (ppb >= 2.2) {
    visible.forEach((bar, offset) => {
      const barX = x(from + offset);
      const candle = svgElement('g', { class: bar.close >= bar.open ? 'candle up' : 'candle down' });
      candle.append(
        svgElement('line', { class: 'candle-wick', x1: barX, x2: barX, y1: y(bar.high), y2: y(bar.low) }),
        svgElement('rect', {
          class: 'candle-body',
          x: barX - bodyWidth / 2,
          y: Math.min(y(bar.open), y(bar.close)),
          width: bodyWidth,
          height: Math.max(0.8, Math.abs(y(bar.close) - y(bar.open))),
          rx: 0.5
        })
      );
      candleGroup.append(candle);
    });
  }
  svg.append(candleGroup);

  if (volumeTop < volumeBottom) {
    const maxVolume = Math.max(1, ...slice.map((bar) => bar.volume));
    const volumeGroup = svgElement('g', { class: 'chart-volume', 'aria-hidden': 'true' });
    const volumeWidth = clamp(ppb * 0.6, 0.6, 24);
    visible.forEach((bar, offset) => {
      const barX = x(from + offset);
      const volumeHeight = (bar.volume / maxVolume) * (volumeBottom - volumeTop);
      volumeGroup.append(svgElement('rect', {
        class: bar.close >= bar.open ? 'volume-bar up' : 'volume-bar down',
        x: barX - volumeWidth / 2,
        y: volumeBottom - volumeHeight,
        width: volumeWidth,
        height: Math.max(0.5, volumeHeight)
      }));
    });
    svg.append(volumeGroup);
  }

  splits.forEach((split) => {
    const index = barIndexForDate(bars, split.date);
    if (index < from - 1 || index > to + 1) return;
    const splitX = x(index);
    const group = svgElement('g', { class: 'chart-split', 'aria-hidden': 'true' });
    const label = mode === 'adjusted'
      ? `${split.ratio}:1 SPLIT / ÷${split.ratio} APPLIED`
      : `${split.ratio}:1 SPLIT / AS TRADED`;
    group.append(
      svgElement('line', { class: 'chart-split-line', x1: splitX, x2: splitX, y1: priceTop, y2: volumeBottom }),
      svgElement('text', { class: 'chart-split-label', x: splitX + 5, y: Math.max(11, priceTop - 10) }, label)
    );
    svg.append(group);
  });

  const markerGroup = svgElement('g');
  const labelBoxes = [];
  let lastLabelX = -Infinity;
  events.forEach((event) => {
    if (event.barIndex < from - 1 || event.barIndex > to + 1) return;
    const bar = bars[event.barIndex];
    const pointX = x(event.barIndex);
    const pointY = y(bar.close);
    const group = svgElement('g', { 'data-event-index': event.index, class: event.index === activeIndex ? 'chart-event is-active' : 'chart-event' });
    group.append(
      svgElement('line', { class: 'chart-event-guide', x1: pointX, x2: pointX, y1: pointY, y2: volumeBottom }),
      svgElement('circle', { class: 'chart-point-halo', cx: pointX, cy: pointY, r: 13, 'data-index': event.index }),
      svgElement('circle', {
        class: event.index === activeIndex ? 'chart-point is-active' : 'chart-point',
        cx: pointX,
        cy: pointY,
        r: event.index === activeIndex ? 5.4 : 4.2,
        'data-index': event.index
      })
    );
    if (event.index === activeIndex) {
      group.append(svgElement('circle', { class: 'chart-point-pulse', cx: pointX, cy: pointY, r: 9 }));
    }
    if (event.label && pointX - lastLabelX > 118) {
      const above = event.barIndex % 2 === 0;
      const labelX = clamp(pointX, from * ppb + 46, width - 46);
      const labelY = above ? Math.max(priceTop + 10, pointY - 15) : Math.min(volumeBottom - 8, pointY + 24);
      group.append(svgElement('text', { class: 'chart-point-label', x: labelX, y: labelY, 'text-anchor': 'middle' }, event.label));
      labelBoxes.push({ x: labelX, y: labelY, width: event.label.length * 7.2 });
      lastLabelX = pointX;
    }
    if (interactive) {
      group.append(svgElement('circle', {
        class: 'chart-point-hit',
        cx: pointX,
        cy: pointY,
        r: Math.max(13, ppb * 0.9),
        'data-index': event.index,
        tabindex: 0,
        role: 'button',
        'aria-label': `${event.date}: ${event.title}, ${formatPrice(bar.close)}`
      }));
    }
    markerGroup.append(group);
  });
  svg.append(markerGroup);

  /* ------------------------------------------------- TA desk overlay --- */
  // Gezeichnet wird nur, was aus dem eigenen Tape gerechnet ist: SMA 50/200,
  // 52-Wochen-Grenzen, Volumen-Regale und Anchored VWAPs. Die Kult-Level
  // ($483 / $69 / $20) sind als LORE beschriftet und bleiben damit klar
  // unterscheidbar von gerechneten Marken.
  if (ta) {
    const overlay = svgElement('g', { class: 'technical-overlay', 'aria-hidden': 'true' });
    const labelPlacements = [];
    const minVisible = Math.exp(minLog);
    const maxVisible = Math.exp(maxLog);

    // Nur im tatsächlich sichtbaren Fenster beschriften — der Canvas reicht
    // links und rechts über den Viewport hinaus.
    const bandLeft = x(clamp(domainFrom, from, to)) + 6;
    const bandRight = x(clamp(domainTo, from, to)) - 6;

    const placeLabel = (text, labelX, labelY, tone = '') => {
      const labelWidth = text.length * 7.2;
      const clampedX = clamp(labelX, bandLeft, Math.max(bandLeft, bandRight - labelWidth));
      const boxes = labelBoxes.concat(labelPlacements);
      const collides = boxes.some((box) => {
        const boxWidth = box.width ?? 0;
        return Math.abs(box.y - labelY) < 14 && Math.abs(box.x - clampedX) < (boxWidth + labelWidth) / 2 + 12;
      });
      if (collides || labelY < priceTop + 14 || labelY > priceBottom - 4) return;
      labelPlacements.push({ x: clampedX, y: labelY, width: labelWidth });
      overlay.append(svgElement('text', { class: `ta-label${tone ? ` ${tone}` : ''}`, x: clampedX, y: labelY }, text));
    };

    // 1. gleitende Durchschnitte als echte Linien über den sichtbaren Bereich
    const drawMovingAverage = (map, className, name, tone) => {
      const points = [];
      for (let index = from; index <= to; index += 1) {
        const bar = bars[index];
        if (!bar) continue;
        const value = map.get(bar.date);
        if (value === undefined) continue;
        const pointY = y(value);
        if (pointY < priceTop - 60 || pointY > priceBottom + 60) continue;
        points.push(`${x(index).toFixed(2)},${pointY.toFixed(2)}`);
      }
      if (points.length < 4) return;
      overlay.append(svgElement('polyline', { class: className, points: points.join(' ') }));
      const [lastX, lastY] = points[points.length - 1].split(',').map(Number);
      placeLabel(name, clamp(lastX - name.length * 7.4, 6, width - name.length * 7.4 - 4), lastY - 8, tone);
    };
    drawMovingAverage(ta.analytics.sma200, 'ta-ma ta-ma-200', 'SMA 200', 'red');
    drawMovingAverage(ta.analytics.sma50, 'ta-ma ta-ma-50', 'SMA 50', 'blue');

    // 2. Horizontale Marken: 52-Wochen-Grenzen, Volumen-Regale, Lore-Level
    ta.levels.forEach((level) => {
      if (!Number.isFinite(level.price)) return;
      if (level.price < minVisible * 1.01 || level.price > maxVisible * 0.995) return;
      const lineY = y(level.price);
      overlay.append(svgElement('line', { class: level.kind, x1: 0, x2: width, y1: lineY, y2: lineY }));
      if (level.label) placeLabel(level.label, 8, lineY - 6, level.tone);
    });

    // 3. Anchored VWAPs — „wo der Käufer dieser Epoche im Schnitt sitzt“
    ta.anchors.forEach((anchor) => {
      if (!anchor.vwap) return;
      if (anchor.vwap.price < minVisible || anchor.vwap.price > maxVisible) return;
      const lineY = y(anchor.vwap.price);
      overlay.append(svgElement('line', {
        class: `ta-vwap${anchor.tone ? ` ${anchor.tone}` : ''}`,
        x1: 0, x2: width, y1: lineY, y2: lineY
      }));
      placeLabel(`${anchor.label} / ${formatAxisPrice(anchor.vwap.price)}`, width - 6 - anchor.label.length * 7.2, lineY + 15, anchor.tone);
    });

    svg.append(overlay);
  }

  /* ---------------------------------------------------- meme chips ---- */
  if (memes && memes.length) {
    const memeGroup = svgElement('g', { class: 'chart-memes' });
    const rowEnds = [];
    memes.forEach((meme) => {
      if (meme.barIndex < from - 2 || meme.barIndex > to + 2) return;
      const bar = bars[meme.barIndex];
      if (!bar) return;
      const mx = x(meme.barIndex);
      const chipWidth = 54;
      const chipHeight = 22;
      let row = 0;
      while (row < rowEnds.length && rowEnds[row] + 14 > mx - chipWidth / 2) row += 1;
      rowEnds[row] = mx + chipWidth / 2;
      const chipY = priceTop + 2 + row * (chipHeight + 5);
      const isActive = meme.index === memePlayerState.index;
      const chip = svgElement('g', {
        class: isActive ? 'chart-meme-chip is-active' : 'chart-meme-chip',
        'data-meme-index': meme.index
      });
      chip.append(
        svgElement('line', { class: 'chart-meme-guide', x1: mx, x2: mx, y1: chipY + chipHeight, y2: y(bar.close) }),
        svgElement('rect', {
          class: 'chart-meme-chip-box',
          x: mx - chipWidth / 2,
          y: chipY,
          width: chipWidth,
          height: chipHeight,
          rx: 3
        }),
        svgElement('text', {
          class: 'chart-meme-chip-text',
          x: mx,
          y: chipY + 15.5,
          'text-anchor': 'middle'
        }, `M${meme.index + 1} ▶`)
      );
      if (interactive) {
        chip.append(svgElement('rect', {
          class: 'chart-meme-hit',
          x: mx - chipWidth / 2 - 8,
          y: chipY - 5,
          width: chipWidth + 16,
          height: chipHeight + 10,
          'data-meme-index': meme.index,
          tabindex: 0,
          role: 'button',
          'aria-label': `Meme ${meme.index + 1} of ${memes.length}, play: ${meme.label}`
        }));
      }
      memeGroup.append(chip);
    });
    svg.append(memeGroup);
  }

  /* --------------------------------- corporate events + RC tweets ---- */
  // Rauten (Earnings/Offerings) und X-Chips (RC-Tweets) sitzen direkt auf
  // der Kurslinie; die Führungslinie verbindet Marker und Handelstag.
  if (corp && corp.length) {
    const corpGroup = svgElement('g', { class: 'chart-corp' });
    corp.forEach((item) => {
      if (item.barIndex < from - 1 || item.barIndex > to + 1) return;
      const bar = bars[item.barIndex];
      if (!bar) return;
      const cx = x(item.barIndex);
      const cy = y(bar.close);
      const off = item.index % 2 === 0 ? -19 : 21;
      const my = clamp(cy + off, priceTop + 11, priceBottom - 11);
      const meta = CORP_TYPE[item.type] ?? CORP_TYPE.other;
      const isActive = activeLayer?.kind === 'corp' && activeLayer.index === item.index;
      const group = svgElement('g', {
        class: `chart-corp-marker is-${item.type}${isActive ? ' is-active' : ''}`,
        'data-corp-index': item.index
      });
      group.append(
        svgElement('line', { class: 'chart-corp-guide', x1: cx, x2: cx, y1: cy, y2: my }),
        svgElement('polygon', {
          class: 'chart-corp-diamond',
          points: `${cx},${my - 10} ${cx + 10},${my} ${cx},${my + 10} ${cx - 10},${my}`
        }),
        svgElement('text', { class: 'chart-corp-glyph', x: cx, y: my + 4.5, 'text-anchor': 'middle' }, meta.glyph)
      );
      if (interactive) {
        group.append(svgElement('circle', {
          class: 'chart-corp-hit',
          cx, cy: my, r: 17,
          'data-corp-index': item.index,
          tabindex: 0,
          role: 'button',
          'aria-label': `${meta.label}, ${formatDay(item.iso)}: ${item.title}`
        }));
      }
      corpGroup.append(group);
    });
    svg.append(corpGroup);
  }

  if (tweets && tweets.length) {
    const tweetGroup = svgElement('g', { class: 'chart-tweets' });
    tweets.forEach((tweet) => {
      if (tweet.barIndex < from - 1 || tweet.barIndex > to + 1) return;
      const bar = bars[tweet.barIndex];
      if (!bar) return;
      const cx = x(tweet.barIndex);
      const cy = y(bar.close);
      const chipW = 25;
      const chipH = 20;
      const my = clamp(cy - 30, priceTop + chipH + 2, priceBottom - 4);
      const isActive = activeLayer?.kind === 'tweet' && activeLayer.index === tweet.index;
      const group = svgElement('g', {
        class: isActive ? 'chart-tweet-marker is-active' : 'chart-tweet-marker',
        'data-tweet-index': tweet.index
      });
      group.append(
        svgElement('line', { class: 'chart-tweet-guide', x1: cx, x2: cx, y1: my + chipH, y2: cy }),
        svgElement('rect', {
          class: 'chart-tweet-box',
          x: cx - chipW / 2, y: my, width: chipW, height: chipH, rx: 4
        }),
        svgElement('text', { class: 'chart-tweet-glyph', x: cx, y: my + 14.5, 'text-anchor': 'middle' }, '𝕏')
      );
      if (interactive) {
        group.append(svgElement('rect', {
          class: 'chart-tweet-hit',
          x: cx - chipW / 2 - 7, y: my - 6, width: chipW + 14, height: chipH + 12,
          'data-tweet-index': tweet.index,
          tabindex: 0,
          role: 'button',
          'aria-label': `RC-Tweet, ${formatDay(tweet.iso)}: ${tweet.text}`
        }));
      }
      tweetGroup.append(group);
    });
    svg.append(tweetGroup);
  }

  /* --------------------------------------------------- number radar ---- */
  // Sterne hängen am Schlusskurs des Tages, an dem eine Kult-Zahl gedruckt
  // wurde — keine Chips, damit das Tape nicht zugestellt wird.
  if (numbers && numbers.length) {
    const radarGroup = svgElement('g', { class: 'chart-radar' });
    numbers.forEach((hit) => {
      if (hit.barIndex < from - 2 || hit.barIndex > to + 2) return;
      const bar = bars[hit.barIndex];
      if (!bar) return;
      const cx = x(hit.barIndex);
      const cy = y(bar.close);
      const isActive = activeLayer?.kind === 'number' && activeLayer.index === hit.index;
      const group = svgElement('g', {
        class: isActive ? 'chart-radar-star-group is-active' : 'chart-radar-star-group',
        'data-number-index': hit.index
      });
      // Im FIT-Überblick bleiben die Sterne winzig, beim Hineinzoomen wachsen sie.
      const starSize = clamp(ppb * 1.5, 1.9, isActive ? 7 : 5.4);
      group.append(svgElement('path', { class: 'chart-radar-star', d: starPath(cx, cy, starSize, starSize * 0.42) }));
      if (interactive) {
        group.append(svgElement('circle', {
          class: 'chart-number-hit',
          cx,
          cy,
          r: 12,
          'data-number-index': hit.index,
          tabindex: 0,
          role: 'button',
          'aria-label': `${hit.code.name}, ${formatDay(hit.iso)}: ${formatPrice(hit.close)}`
        }));
      }
      radarGroup.append(group);
    });
    svg.append(radarGroup);
  }

  /* ----------------------------------------------- click crosshair ---- */
  if (inspect && Number.isFinite(inspect.barIndex) && inspect.barIndex >= from - 1 && inspect.barIndex <= to + 1) {
    const cross = svgElement('g', { class: 'chart-inspect-cross', 'aria-hidden': 'true' });
    const inspectX = x(inspect.barIndex);
    const inspectY = y(inspect.price);
    cross.append(
      svgElement('line', { class: 'inspect-vline', x1: inspectX, x2: inspectX, y1: priceTop, y2: volumeBottom }),
      svgElement('line', { class: 'inspect-hline', x1: 0, x2: width, y1: inspectY, y2: inspectY }),
      svgElement('circle', { class: 'inspect-dot', cx: inspectX, cy: inspectY, r: 4 })
    );
    svg.append(cross);
  }

  return { ticks, y, yToPrice, priceTop, priceBottom };
}

/* --------------------------------------------------- terminal (big chart) - */

function terminalElements() {
  return {
    terminal: document.querySelector('.chart-terminal'),
    area: document.querySelector('.terminal-chart-area'),
    viewport: document.querySelector('#terminal-viewport'),
    track: document.querySelector('#terminal-track'),
    canvas: document.querySelector('#chart-canvas'),
    yAxis: document.querySelector('#chart-yaxis'),
    playhead: document.querySelector('#terminal-playhead'),
    playheadTag: document.querySelector('#playhead-tag'),
    callout: document.querySelector('#event-callout'),
    range: document.querySelector('#terminal-range'),
    windowLabel: document.querySelector('#chart-window-label'),
    position: document.querySelector('#terminal-position')
  };
}

function terminalMetrics() {
  const { viewport, canvas } = terminalElements();
  const width = Math.max(320, viewport?.clientWidth || 1200);
  const height = Math.max(240, viewport?.clientHeight || 520);
  return { width, height, canvas };
}

function visibleRange(metrics) {
  const { viewport } = terminalElements();
  const bars = seriesFor(chartState.resolution);
  const ppb = chartState.ppb;
  const scrollLeft = viewport?.scrollLeft ?? 0;
  const firstVisible = clamp(Math.floor(scrollLeft / ppb), 0, bars.length - 1);
  const lastVisible = clamp(Math.ceil((scrollLeft + metrics.width) / ppb), 0, bars.length - 1);
  const from = clamp(firstVisible - OVERSCAN, 0, bars.length - 1);
  const to = clamp(lastVisible + OVERSCAN, 0, bars.length - 1);
  return { firstVisible, lastVisible, from, to };
}

// room on the right so the newest candle can still sit on the playhead
function trailingGutter(metrics) {
  return Math.round(metrics.width * (1 - PLAYHEAD_RATIO)) + 46;
}

function trackWidth(metrics) {
  const bars = seriesFor(chartState.resolution);
  const content = bars.length * chartState.ppb;
  if (content <= metrics.width) return Math.round(metrics.width);
  return Math.round(content + trailingGutter(metrics));
}

function paintTerminal({ force = false } = {}) {
  const { viewport, track, canvas, yAxis, windowLabel } = terminalElements();
  if (!viewport || !track || !canvas) return;

  const metrics = terminalMetrics();
  const bars = seriesFor(chartState.resolution);
  const { firstVisible, lastVisible, from, to } = visibleRange(metrics);
  const width = trackWidth(metrics);
  track.style.width = `${Math.round(width)}px`;
  track.style.minWidth = `${Math.round(width)}px`;

  const height = metrics.height;
  const priceTop = PLOT.top;
  const volumeBottom = height - PLOT.bottom;
  const volumeTop = volumeBottom - PLOT.volume;
  const priceBottom = volumeTop - PLOT.gap;

  canvas.style.left = `${Math.round(from * chartState.ppb)}px`;

  const events = storyEvents.map((event, index) => ({ ...event, index, barIndex: eventIndices(chartState.resolution)[index] }));
  const splits = marketMeta.splits.map((split) => ({ date: split.date, ratio: split.ratio ?? 4 }));
  const memes = memesEnabled()
    ? memeMoments.map((meme, index) => ({ ...meme, index, barIndex: memeIndices(chartState.resolution)[index] }))
    : [];
  const corp = layerState.corp
    ? corporateEvents
        .map((item, index) => ({ ...item, index, barIndex: layerIndices('corp', chartState.resolution)[index] }))
        .filter((item) => layerState.corpFilter === 'all' || item.type === layerState.corpFilter)
    : [];
  const tweets = layerState.tweets
    ? rcTweets.map((tweet, index) => ({ ...tweet, index, barIndex: layerIndices('tweet', chartState.resolution)[index] }))
    : [];
  const numbers = layerState.numbers
    ? radarList().map((hit, index) => ({ ...hit, index, barIndex: layerIndices('number', chartState.resolution)[index] }))
    : [];

  const paintKey = [
    chartState.resolution,
    chartState.ppb.toFixed(3),
    from,
    to,
    height.toFixed(1),
    chartState.activeIndex,
    taActive() ? `ta-${taState.lore ? 'lore' : 'plain'}` : '-',
    priceMode.mode,
    memesEnabled() ? `memes-${memePlayerState.index}` : 'memes-off',
    `corp-${layerState.corp}-${layerState.corpFilter}`,
    `tweets-${layerState.tweets}`,
    `numbers-${layerState.numbers}`,
    layerState.active ? `${layerState.active.kind}-${layerState.active.index}` : 'layer-',
    inspectState.barIndex ?? '-',
    inspectState.price ? inspectState.price.toFixed(3) : '-'
  ].join('|');

  if (!force && paintKey === terminalPaintKey) {
    paintPlayhead(bars, firstVisible, lastVisible);
    return;
  }
  terminalPaintKey = paintKey;

  const inspect = inspectState.barIndex === null ? null : { barIndex: inspectState.barIndex, price: inspectState.price };

  const { ticks, y, yToPrice } = drawSeries(canvas, {
    bars,
    from,
    to,
    ppb: chartState.ppb,
    height,
    priceTop,
    priceBottom,
    volumeTop,
    volumeBottom,
    domainFrom: firstVisible,
    domainTo: lastVisible,
    events,
    activeIndex: chartState.activeIndex,
    splits,
    ta: taActive() ? taModel() : null,
    axisInCanvas: false,
    interactive: true,
    gradientId: 'chart-area-gradient-terminal',
    priceMode: priceMode.mode,
    inspect,
    memes,
    corp,
    tweets,
    numbers,
    activeLayer: layerState.active
  });

  terminalScale = { yToPrice, priceTop, priceBottom };
  canvas.classList.toggle('is-dense', chartState.ppb < 2.2);
  // Unter dem Chart hängen die offiziellen Serien an derselben Ansicht.
  paintFlows();
  syncFlowsScroll();

  if (yAxis) {
    yAxis.setAttribute('viewBox', `0 0 76 ${height}`);
    yAxis.setAttribute('width', 76);
    yAxis.setAttribute('height', height);
    yAxis.style.height = `${height}px`;
    yAxis.replaceChildren();
    ticks.forEach((value) => {
      const lineY = y(value);
      yAxis.append(
        svgElement('line', { class: 'axis-tick-line', x1: 0, x2: 76, y1: lineY, y2: lineY }),
        svgElement('text', { class: 'axis-tick-label', x: 8, y: lineY - 5 }, formatAxisPrice(value))
      );
    });
    if (inspect) {
      const flagY = y(inspect.price);
      const flagLabel = formatAxisPrice(inspect.price);
      yAxis.append(
        svgElement('rect', { class: 'axis-flag', x: 2, y: flagY - 9, width: 72, height: 18, rx: 2 }),
        svgElement('text', { class: 'axis-flag-label', x: 38, y: flagY + 4, 'text-anchor': 'middle' }, flagLabel)
      );
    }
  }

  // Klicks laufen über Delegation im Viewport (verhindert Doppel-Auslösung,
  // siehe bindChartTerminal) — hier bleiben nur die Tastatur-Bindings.
  canvas.querySelectorAll('.chart-point-hit, .chart-point, .chart-point-halo').forEach((target) => {
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        const index = Number(target.dataset.index);
        if (!Number.isNaN(index)) focusEvent(index);
      }
    });
  });

  canvas.querySelectorAll('.chart-corp-hit').forEach((target) => {
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        const index = Number(target.dataset.corpIndex);
        if (!Number.isNaN(index)) openLayerItem('corp', index);
      }
    });
  });

  canvas.querySelectorAll('.chart-tweet-hit').forEach((target) => {
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        const index = Number(target.dataset.tweetIndex);
        if (!Number.isNaN(index)) openLayerItem('tweet', index);
      }
    });
  });

  canvas.querySelectorAll('.chart-meme-hit').forEach((target) => {
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        const index = Number(target.dataset.memeIndex);
        if (!Number.isNaN(index)) openChartMeme(index);
      }
    });
  });

  paintPlayhead(bars, firstVisible, lastVisible);

  if (windowLabel) {
    const fromBar = bars[firstVisible];
    const toBar = bars[lastVisible];
    const visibleCount = lastVisible - firstVisible + 1;
    const spanDays = (toBar.time - fromBar.time) / 86400000;
    const label = spanDays <= 92
      ? `${formatDay(fromBar.date)} → ${formatDay(toBar.date)}`
      : `${formatMonth(fromBar.date)} → ${formatMonth(toBar.date)}`;
    const unit = chartState.resolution === 'day' ? 'BARS' : chartState.resolution === 'week' ? 'WEEKS' : 'MONTHS';
    windowLabel.textContent = `${visibleCount} / ${bars.length} ${unit} · ${label}`;
  }
}

function paintPlayhead(bars, firstVisible, lastVisible) {
  const { viewport, playhead, playheadTag } = terminalElements();
  if (!viewport || !playhead) return;
  const offset = Math.round(viewport.clientWidth * PLAYHEAD_RATIO);
  playhead.style.left = `${viewport.offsetLeft + offset}px`;
  if (!playheadTag) return;
  const barIndex = clamp(Math.round((viewport.scrollLeft + offset) / chartState.ppb - 0.5), firstVisible, lastVisible);
  const bar = bars[barIndex];
  if (!bar) return;
  playheadTag.textContent = `${formatPrice(bar.close)} · ${formatDay(bar.date)}`;
}

function syncActiveFromScroll() {
  const { viewport } = terminalElements();
  if (!viewport) return false;
  if (Date.now() < followPageScrollUntil) return false;

  const indices = eventIndices(chartState.resolution);
  const ppb = chartState.ppb;
  const playheadX = viewport.clientWidth * PLAYHEAD_RATIO;
  let best = null;
  let bestDistance = Infinity;

  indices.forEach((barIndex, index) => {
    const markerX = (barIndex + 0.5) * ppb - viewport.scrollLeft;
    if (markerX < -80 || markerX > viewport.clientWidth + 80) return;
    const distance = Math.abs(markerX - playheadX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });

  if (best === null || best === chartState.activeIndex) return false;
  applyActive(best, { pop: true });
  return true;
}

function scrollToEvent(index, behavior = 'auto') {
  const { viewport } = terminalElements();
  if (!viewport) return;
  const barIndex = eventIndices(chartState.resolution)[index];
  const target = clamp(
    (barIndex + 0.5) * chartState.ppb - viewport.clientWidth * PLAYHEAD_RATIO,
    0,
    Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  );
  try {
    if (behavior === 'auto') viewport.scrollLeft = target;
    else viewport.scrollTo({ left: target, behavior });
  } catch {
    viewport.scrollLeft = target;
  }
  paintTerminal();
  paintCallout();
}

/* ------------------------------------------------------------- callout --- */

function calloutElements() {
  const callout = document.querySelector('#event-callout');
  return {
    callout,
    index: callout?.querySelector('#callout-index'),
    date: callout?.querySelector('#callout-date'),
    title: callout?.querySelector('#callout-title'),
    price: callout?.querySelector('#callout-price'),
    delta: callout?.querySelector('#callout-delta'),
    volume: callout?.querySelector('#callout-volume'),
    links: callout?.querySelector('#callout-links'),
    open: callout?.querySelector('[data-callout-open]')
  };
}

function renderCallout(index) {
  const { callout, index: indexLabel, date, title, price, delta, volume, links, open } = calloutElements();
  if (!callout) return;
  const event = storyEvents[index];
  const series = seriesFor(chartState.resolution);
  const barIndex = eventIndices(chartState.resolution)[index];
  const bar = series[barIndex];
  if (!event || !bar) return;

  if (indexLabel) indexLabel.textContent = `${String(index + 1).padStart(2, '0')} / ${String(storyEvents.length).padStart(2, '0')}`;
  if (date) date.textContent = formatDay(bar.date);
  if (title) title.textContent = event.title;
  if (price) price.textContent = formatPrice(bar.close);
  if (delta) {
    const change = relativeChange(series, barIndex);
    delta.textContent = formatPercent(change);
    delta.classList.toggle('is-up', Number.isFinite(change) && change >= 0);
    delta.classList.toggle('is-down', Number.isFinite(change) && change < 0);
  }
  if (volume) volume.textContent = `${formatCompact(bar.volume)} SHARES`;
  if (links) {
    links.innerHTML = event.media.map((asset) => `
      <a class="callout-link" href="${asset.url}" target="_blank" rel="noreferrer">
        <span class="callout-link-kind">${asset.kind}</span>
        <span class="callout-link-title">${asset.title}</span>
      </a>
    `).join('');
  }
  if (open) {
    open.dataset.calloutOpen = event.id;
    open.textContent = `full entry · ${event.tag}`;
  }
}

function paintCallout() {
  const { callout } = calloutElements();
  if (!callout) return;

  const marker = document.querySelector(`#chart-canvas .chart-point[data-index="${chartState.activeIndex}"]`);
  const visible = marker && !chartState.calloutHidden;
  callout.classList.toggle('is-hidden', !visible);
  positionDockTies();
}

function applyActive(index, { pop = false } = {}) {
  if (!storyEvents[index]) return;
  const changed = index !== chartState.activeIndex;
  chartState.activeIndex = index;
  chartState.calloutHidden = false;
  const event = storyEvents[index];
  const series = seriesFor(chartState.resolution);
  const barIndex = eventIndices(chartState.resolution)[index];
  const bar = series[barIndex];
  if (!bar) return;

  document.querySelectorAll('.chart-index-dot').forEach((button) => {
    const isActive = Number(button.dataset.index) === index;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'step' : 'false');
  });
  document.querySelectorAll('.js-event-card').forEach((card) => {
    card.classList.toggle('is-active', Number(card.dataset.index) === index);
  });

  const activeTitle = document.querySelector('#active-event-title');
  const activeDate = document.querySelector('#active-event-date');
  const activePrice = document.querySelector('#active-event-price');
  const activeDelta = document.querySelector('#active-event-delta');
  const activeNumber = document.querySelector('#active-event-number');
  if (activeTitle) activeTitle.textContent = event.title;
  if (activeDate) activeDate.textContent = formatDay(bar.date);
  if (activePrice) activePrice.textContent = formatPrice(bar.close);
  if (activeNumber) activeNumber.textContent = String(index + 1).padStart(2, '0');
  if (activeDelta) {
    const change = relativeChange(series, barIndex);
    activeDelta.textContent = formatPercent(change);
    activeDelta.classList.toggle('is-up', Number.isFinite(change) && change >= 0);
    activeDelta.classList.toggle('is-down', Number.isFinite(change) && change < 0);
  }

  const position = document.querySelector('#terminal-position');
  const range = document.querySelector('#terminal-range');
  if (position) position.textContent = `${String(index + 1).padStart(2, '0')} / ${String(storyEvents.length).padStart(2, '0')}`;
  if (range && document.activeElement !== range) range.value = String(index);

  renderCallout(index);
  paintCallout();
  if (changed && pop) {
    const { callout } = calloutElements();
    callout?.classList.remove('is-popping');
    // restart the pop animation
    void callout?.offsetWidth;
    callout?.classList.add('is-popping');
  }
}

function focusEvent(index) {
  applyActive(index);
  scrollToEvent(index);
}

/* --------------------------------------------------------- zoom handling - */

function zoomLimits() {
  return CHART_LIMITS[chartState.resolution] ?? CHART_LIMITS.day;
}

function zoomTo(nextPpb, anchorX) {
  const limits = zoomLimits();
  const previous = chartState.ppb;
  const next = clamp(nextPpb, limits.min, limits.max);
  if (Math.abs(next - previous) < 1e-4) return;
  const { viewport } = terminalElements();
  if (!viewport) return;
  const anchor = anchorX ?? viewport.clientWidth * PLAYHEAD_RATIO;
  const anchorBar = (viewport.scrollLeft + anchor) / previous;
  chartState.ppb = next;
  paintTerminal();
  const target = clamp(anchorBar * next - anchor, 0, Math.max(0, viewport.scrollWidth - viewport.clientWidth));
  viewport.scrollLeft = target;
  paintTerminal();
  syncActiveFromScroll();
  paintCallout();
}

function zoomBy(factor, anchorX) {
  zoomTo(chartState.ppb * factor, anchorX);
}

function fitHistory() {
  const { viewport } = terminalElements();
  if (!viewport) return;
  terminalPaintKey = '';
  const bars = seriesFor(chartState.resolution);
  const limits = zoomLimits();
  const metrics = terminalMetrics();
  const target = clamp((metrics.width - trailingGutter(metrics) - 18) / Math.max(1, bars.length), limits.min, limits.max);
  chartState.ppb = target;
  paintTerminal();
  viewport.scrollLeft = 0;
  paintTerminal();
  syncActiveFromScroll();
  paintCallout();
}

// Start-/Standardfenster: höchstens ca. ein Monat Tape sichtbar.
function applyDefaultZoom({ anchor = 'end' } = {}) {
  const { viewport } = terminalElements();
  if (!viewport) return;
  terminalPaintKey = '';
  chartState.ppb = windowPpb(chartState.resolution);
  paintTerminal();
  if (anchor === 'end') {
    viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  }
  paintTerminal();
  syncActiveFromScroll();
  paintCallout();
}

function setResolution(resolution) {
  if (!['day', 'week', 'month'].includes(resolution) || resolution === chartState.resolution) return;
  chartState.resolution = resolution;
  chartState.ppb = windowPpb(resolution);
  terminalPaintKey = '';
  storyPaintKey = '';
  // Bar-Indizes ändern ihre Bedeutung — Inspektor zurücksetzen, Meme neu verankern
  inspectState.barIndex = null;
  inspectState.price = null;
  const { panel } = inspectElements();
  if (panel) panel.hidden = true;
  const inspectHint = document.querySelector('#inspect-hint');
  if (inspectHint) inspectHint.hidden = false;
  if (memePlayerState.index !== null) {
    const openIndex = memePlayerState.index;
    memePlayerState.index = null;
    openChartMeme(openIndex, { autoplay: memePlayerState.playing, reveal: false });
  }
  document.querySelectorAll('.resolution-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.resolution === resolution);
  });
  const label = document.querySelector('#resolution-label');
  if (label) label.textContent = resolutionLabel(resolution);
  paintTerminal();
  paintStoryChart();
  scrollToEvent(chartState.activeIndex);
  applyActive(chartState.activeIndex);
  renderLayerDetail();
}

function resolutionLabel(resolution) {
  if (resolution === 'week') return '1W / WEEKLY';
  if (resolution === 'month') return '1M / MONTHLY';
  return '1D / DAILY DETAIL';
}

/* ---------------------------------------------------- price mode (÷4) --- */

function updatePriceModeUI() {
  const adjusted = priceMode.mode === 'adjusted';
  const toggle = document.querySelector('#price-mode-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(adjusted));
    toggle.title = adjusted
      ? 'Currently split-adjusted — click to show historical quoted prices'
      : 'Currently as traded — click to adjust for the July 2022 4:1 split';
  }
  const word = document.querySelector('#price-mode-word');
  if (word) word.textContent = adjusted ? 'SPLIT-ADJ' : 'AS TRADED';
  const hint = document.querySelector('#price-mode-hint');
  if (hint) hint.textContent = adjusted ? '↔ AS TRADED' : '↔ SPLIT-ADJ';
  const label = document.querySelector('#price-mode-label');
  if (label) label.textContent = adjusted ? 'SPLIT-ADJUSTED (÷4)' : 'AS TRADED';
}

function setPriceMode(mode) {
  if (!priceMode.available || mode === priceMode.mode) return;
  priceMode.mode = mode;
  terminalPaintKey = '';
  storyPaintKey = '';
  updatePriceModeUI();
  // Kennzahlen, Zahlenschloss und Layer-Liste hängen am Kursmodus —
  // nach dem Umschalten alles neu rechnen und die Liste neu aufbauen.
  syncLayerControls();
  buildLayerList();
  renderLayerDetail();
  if (taActive()) renderTaDesk();
  paintTerminal();
  paintStoryChart({ force: true });
  applyActive(chartState.activeIndex);
  // Inspektor bleibt an der geklickten Pixel-Position — der Kurs dahinter
  // ändert sich mit dem Modus.
  if (inspectState.barIndex !== null && terminalScale) {
    inspectState.price = terminalScale.yToPrice(inspectState.pixelY ?? 0);
    terminalPaintKey = '';
    paintTerminal();
  }
  updateInspectChip();
  refreshChartMemeHeader();
  renderLayerDetail();
  paintCallout();
  stampProvenance();
}

/* ------------------------------------------------- click-to-inspect --- */

function inspectElements() {
  const panel = document.querySelector('#chart-inspect');
  return {
    panel,
    date: panel?.querySelector('#inspect-date'),
    cursor: panel?.querySelector('#inspect-cursor'),
    open: panel?.querySelector('#inspect-open'),
    high: panel?.querySelector('#inspect-high'),
    low: panel?.querySelector('#inspect-low'),
    close: panel?.querySelector('#inspect-close-price'),
    delta: panel?.querySelector('#inspect-delta'),
    volume: panel?.querySelector('#inspect-volume')
  };
}

function setInspect(barIndex, price, pixelY) {
  inspectState.barIndex = barIndex;
  inspectState.price = price;
  inspectState.pixelY = pixelY ?? null;
  terminalPaintKey = '';
  paintTerminal();
  updateInspectChip();
}

function clearInspect() {
  if (inspectState.barIndex === null) return;
  inspectState.barIndex = null;
  inspectState.price = null;
  inspectState.pixelY = null;
  terminalPaintKey = '';
  paintTerminal();
  const { panel } = inspectElements();
  if (panel) panel.hidden = true;
  const hint = document.querySelector('#inspect-hint');
  if (hint) hint.hidden = false;
}

function updateInspectChip() {
  const { panel, date, cursor, open, high, low, close, delta, volume } = inspectElements();
  const hint = document.querySelector('#inspect-hint');
  const hide = () => {
    if (panel) panel.hidden = true;
    if (hint) hint.hidden = false;
  };
  if (!panel || inspectState.barIndex === null) {
    hide();
    return;
  }
  const series = seriesFor(chartState.resolution);
  const barIndex = clamp(inspectState.barIndex, 0, series.length - 1);
  const bar = series[barIndex];
  if (!bar) {
    hide();
    return;
  }
  panel.hidden = false;
  if (hint) hint.hidden = true;
  if (date) date.textContent = formatDay(bar.date);
  if (cursor) cursor.textContent = `CURSOR ${formatPrice(inspectState.price)}`;
  if (open) open.textContent = formatPrice(bar.open);
  if (high) high.textContent = formatPrice(bar.high);
  if (low) low.textContent = formatPrice(bar.low);
  if (close) close.textContent = formatPrice(bar.close);
  if (volume) volume.textContent = `${formatCompact(bar.volume)} SHARES`;
  if (delta) {
    const change = relativeChange(series, barIndex);
    delta.textContent = formatPercent(change);
    delta.classList.toggle('is-up', Number.isFinite(change) && change >= 0);
    delta.classList.toggle('is-down', Number.isFinite(change) && change < 0);
  }
}

/* ------------------------------------------------ in-chart meme player - */

function chartMemeElements() {
  const player = document.querySelector('#chart-meme-player');
  return {
    player,
    hint: document.querySelector('#chart-meme-hint'),
    media: player?.querySelector('#chart-meme-media'),
    gif: player?.querySelector('#chart-meme-gif'),
    video: player?.querySelector('#chart-meme-video'),
    videoPlay: player?.querySelector('#chart-meme-video-play'),
    videoLabel: player?.querySelector('#chart-meme-video-label'),
    broken: player?.querySelector('#chart-meme-media-broken'),
    brokenLink: player?.querySelector('#chart-meme-media-link'),
    label: player?.querySelector('#chart-meme-label'),
    date: player?.querySelector('#chart-meme-date'),
    price: player?.querySelector('#chart-meme-price'),
    quote: player?.querySelector('#chart-meme-quote'),
    caption: player?.querySelector('#chart-meme-caption'),
    credit: player?.querySelector('#chart-meme-credit'),
    play: player?.querySelector('#chart-meme-play'),
    playLabel: player?.querySelector('#chart-meme-play-label'),
    fill: player?.querySelector('#chart-meme-progress-fill'),
    count: player?.querySelector('#chart-meme-count'),
    close: player?.querySelector('#chart-meme-close')
  };
}

// Bild und Video eines Moments in den Player setzen. Das Video-Element wird
// bewusst erst beim Klick aufgebaut, damit keine Player im Hintergrund laufen.
function renderChartMemeMedia() {
  const { media, gif, video, videoPlay, videoLabel, broken, brokenLink, credit } = chartMemeElements();
  if (!media) return;
  const moment = memeMoments[memePlayerState.index];
  const gifSource = mediaEnabled ? primaryMedia(moment, 'gif') : null;
  const videoSource = mediaEnabled ? primaryMedia(moment, 'video') : null;
  const fallbackSource = gifSource ?? videoSource;

  media.dataset.state = mediaEnabled && (gifSource || videoSource) ? 'loaded' : 'off';
  if (gif) {
    gif.hidden = true;
    gif.removeAttribute('src');
  }
  if (video) {
    video.hidden = true;
    video.removeAttribute('src');
    delete video.dataset.embed;
    if (videoSource) video.dataset.embed = videoSource.embed;
  }
  // Das GIF läuft direkt, das Video startet per Eck-Knopf — beides bleibt belegt.
  if (videoPlay) videoPlay.hidden = !videoSource;
  if (videoLabel && videoSource) videoLabel.textContent = 'PLAY VIDEO';
  if (broken) broken.hidden = true;

  if (gifSource && gif) {
    gif.alt = `${moment.label} — ${gifSource.title}`;
    gif.onerror = () => {
      gif.hidden = true;
      media.dataset.state = 'broken';
      mediaFallback(broken);
      if (brokenLink) brokenLink.href = gifSource.page;
    };
    gif.onload = () => { media.dataset.state = 'loaded'; };
    gif.src = gifSource.src;
    gif.hidden = false;
  } else if (videoSource && video) {
    video.onerror = () => {
      video.hidden = true;
      media.dataset.state = 'broken';
      mediaFallback(broken);
      if (brokenLink) brokenLink.href = videoSource.page;
    };
  }
  if (fallbackSource && brokenLink && !gifSource) brokenLink.href = fallbackSource.page;
  renderMediaCredit(credit, [gifSource, videoSource].filter(Boolean), moment?.label ?? '');
}

// Quellenzeile: GIF und Video bleiben beide belegt — auch wenn nur eines läuft.
function renderMediaCredit(container, sources, label) {
  if (!container) return;
  if (!sources.length) {
    container.textContent = `${label} · media off`;
    return;
  }
  container.innerHTML = sources.map((source) => {
    const labelText = source.kind === 'video' ? `▶ ${source.title}` : `${source.credit} · ${source.title}`;
    return `<a href="${source.page}" target="_blank" rel="noreferrer">${labelText} ↗</a>${source.archive ? ` · <a href="${source.archive}" target="_blank" rel="noreferrer">Archive / context ↗</a>` : ''}`;
  }).join(' · ');
}

function renderChartMemeFrame(animate = true) {
  const { quote, caption, count } = chartMemeElements();
  const moment = memeMoments[memePlayerState.index];
  if (!moment || !quote || !caption) return;
  const frame = moment.frames[memePlayerState.frame] ?? moment.frames[0];
  const apply = () => {
    quote.textContent = frame.quote;
    caption.textContent = frame.caption;
    if (count) count.textContent = `${String(memePlayerState.frame + 1).padStart(2, '0')} / ${String(moment.frames.length).padStart(2, '0')}`;
    quote.classList.remove('is-changing');
    caption.classList.remove('is-changing');
  };
  if (animate) {
    quote.classList.add('is-changing');
    caption.classList.add('is-changing');
    window.setTimeout(apply, 150);
  } else {
    apply();
  }
}

function tickChartMeme() {
  const { fill } = chartMemeElements();
  if (!memePlayerState.playing || memePlayerState.index === null) {
    memePlayerState.rafId = null;
    return;
  }
  const moment = memeMoments[memePlayerState.index];
  const elapsed = Date.now() - memePlayerState.startedAt;
  const progress = Math.min(1, elapsed / MEME_FRAME_MS);
  if (fill) fill.style.width = `${progress * 100}%`;
  if (progress >= 1 && moment) {
    memePlayerState.frame = (memePlayerState.frame + 1) % moment.frames.length;
    renderChartMemeFrame();
    memePlayerState.startedAt = Date.now();
  }
  memePlayerState.rafId = raf(tickChartMeme);
}

function setChartMemePlaying(playing) {
  memePlayerState.playing = playing;
  const { play, playLabel, fill } = chartMemeElements();
  if (play) {
    play.classList.toggle('is-playing', playing);
    play.setAttribute('aria-pressed', String(playing));
  }
  if (playLabel) playLabel.textContent = playing ? 'PAUSE' : 'PLAY';
  if (playing) {
    memePlayerState.startedAt = Date.now();
    if (!memePlayerState.rafId) memePlayerState.rafId = raf(tickChartMeme);
  } else {
    if (memePlayerState.rafId && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(memePlayerState.rafId);
    memePlayerState.rafId = null;
    if (fill) fill.style.width = '0%';
  }
}

function scrollMemeIntoView(barIndex) {
  const { viewport } = terminalElements();
  if (!viewport) return;
  const markerX = (barIndex + 0.5) * chartState.ppb - viewport.scrollLeft;
  if (markerX >= 60 && markerX <= viewport.clientWidth - 60) return;
  const target = clamp(
    (barIndex + 0.5) * chartState.ppb - viewport.clientWidth * 0.42,
    0,
    Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  );
  try {
    viewport.scrollTo({ left: target, behavior: 'smooth' });
  } catch {
    viewport.scrollLeft = target;
  }
}

function openChartMeme(index, { autoplay = true, reveal = true } = {}) {
  if (!memeMoments[index]) return;
  if (document.body.classList.contains('dock-collapsed')) document.querySelector('#dock-toggle')?.click();
  memePlayerState.index = index;
  memePlayerState.frame = 0;
  const { player, hint } = chartMemeElements();
  if (player) player.hidden = false;
  if (hint) hint.hidden = true;
  refreshChartMemeHeader();
  renderChartMemeFrame(false);
  renderChartMemeMedia();
  setChartMemePlaying(autoplay);
  if (reveal) {
    const barIndex = memeIndices(chartState.resolution)[index];
    if (barIndex !== undefined) scrollMemeIntoView(barIndex);
  }
  terminalPaintKey = '';
  paintTerminal();
  positionDockTies();
}

// Kopfzeile (Label, Datum, Kurs) neu lesen — z. B. nach Modus- oder
// Auflösungswechsel, ohne die laufende Wiedergabe neu zu starten.
function refreshChartMemeHeader() {
  if (memePlayerState.index === null) return;
  const { label, date, price } = chartMemeElements();
  const series = seriesFor(chartState.resolution);
  const barIndex = memeIndices(chartState.resolution)[memePlayerState.index];
  const bar = series[barIndex];
  if (label) label.textContent = `${memeMoments[memePlayerState.index].label} · M${memePlayerState.index + 1}`;
  if (date && bar) date.textContent = formatDay(bar.date);
  if (price && bar) price.textContent = formatPrice(bar.close);
}

function closeChartMeme() {
  setChartMemePlaying(false);
  memePlayerState.index = null;
  const { player, hint, fill, video, videoPlay } = chartMemeElements();
  if (player) player.hidden = true;
  if (hint) hint.hidden = false;
  if (fill) fill.style.width = '0%';
  if (video) {
    video.hidden = true;
    video.removeAttribute('src');
  }
  if (videoPlay) videoPlay.hidden = true;
  const tick = document.querySelector('#dock-tick-meme');
  if (tick) tick.hidden = true;
  terminalPaintKey = '';
  paintTerminal();
}

// Die Karten liegen im Dock, nicht mehr über der Kursfläche. Was bleibt, ist der
// Anker: ein Marker an der Oberseite des Docks, exakt unter dem Bar, zu dem die
// Karte gehört — der Verweis bleibt also erhalten, ohne etwas zu verdecken.
function setDockTick(tickId, element) {
  const tick = document.querySelector(tickId);
  const { terminal, viewport } = terminalElements();
  if (!tick || !element || !terminal || !viewport) {
    if (tick) tick.hidden = true;
    return;
  }
  const elementRect = element.getBoundingClientRect();
  const terminalRect = terminal.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  if (!elementRect.width && !elementRect.height) {
    tick.hidden = true;
    return;
  }
  if (elementRect.right < viewportRect.left - 60 || elementRect.left > viewportRect.right + 60) {
    tick.hidden = true;
    tick.dataset.state = 'off-screen';
    return;
  }
  const centerX = elementRect.left - terminalRect.left + elementRect.width / 2;
  tick.hidden = false;
  delete tick.dataset.state;
  tick.style.left = `${Math.round(clamp(centerX, 6, terminal.clientWidth - 6))}px`;
}

function positionDockTies() {
  const { player } = chartMemeElements();
  const callout = document.querySelector('#event-callout');
  const memeChip = memePlayerState.index === null
    ? null
    : document.querySelector(`#chart-canvas .chart-meme-hit[data-meme-index="${memePlayerState.index}"]`);
  setDockTick('#dock-tick-event', callout?.classList.contains('is-hidden') ? null : callout);
  setDockTick('#dock-tick-meme', player?.hidden ? null : memeChip);
}

function setMemesEnabled(enabled) {
  document.body.classList.toggle('memes-off', !enabled);
  const toggle = document.querySelector('#meme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(enabled));
    const state = toggle.querySelector('#meme-toggle-state');
    if (state) state.textContent = enabled ? 'ON' : 'OFF';
  }
  if (!enabled) closeChartMeme();
  terminalPaintKey = '';
  paintTerminal();
}

// Einbettungen von fremden Servern lassen sich komplett abschalten — der
// Player bleibt dann rein textlich und löst keinen einzigen Request aus.
function setMediaEnabled(enabled) {
  mediaEnabled = enabled;
  document.body.classList.toggle('media-off', !enabled);
  const toggle = document.querySelector('#media-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(enabled));
    const state = document.querySelector('#media-toggle-state');
    if (state) state.textContent = enabled ? 'ON' : 'OFF';
  }
  if (memePlayerState.index !== null) renderChartMemeMedia();
  renderMemeMedia();
  loadWallMedia();
  loadClipPosters();
  if (!enabled) {
    document.querySelectorAll('.clip-card').forEach((card) => {
      card.querySelector('iframe')?.remove();
      const button = card.querySelector('.clip-hit');
      if (button) button.hidden = false;
      card.classList.remove('is-playing');
    });
  }
}

// Clip-Poster kommen nach, sobald die Rail sichtbar wird oder MEDIA wieder
// eingeschaltet wird.
function loadClipPosters() {
  document.querySelectorAll('.clip-poster').forEach((image) => {
    if (!image.dataset.src || !mediaEnabled) return;
    if (image.getAttribute('src')) return;
    image.src = image.dataset.src;
  });
}

/* ---------------------------------------------- chart layers (corp/RC) --- */

function layerBar(kind, index) {
  const series = seriesFor(chartState.resolution);
  const barIndex = layerIndices(kind, chartState.resolution)[index];
  return { series, barIndex, bar: series[barIndex] };
}

function renderLayerDetail() {
  const box = document.querySelector('#layer-detail');
  if (!box) return;
  const active = layerState.active;
  if (!active) {
    box.innerHTML = '<p class="layer-detail-hint">Click a <b>◆ diamond</b> (earnings / offerings / Bitcoin / eBay), a <b>𝕏 chip</b> (RC tweet), a <b>★ star</b> (meme number) or a list entry. Price, daily change and source appear here.</p>';
    return;
  }
  const { series, barIndex, bar } = layerBar(active.kind, active.index);
  const change = bar ? relativeChange(series, barIndex) : null;
  const priceLine = bar
    ? `<span class="layer-detail-price">${formatPrice(bar.close)}</span><span class="inspect-delta ${Number.isFinite(change) && change < 0 ? 'is-down' : 'is-up'}">${formatPercent(change)}</span><span>${formatCompact(bar.volume)} SHARES</span>`
    : '';

  if (active.kind === 'number') {
    const hit = radarList()[active.index];
    if (!hit) return;
    const sameCode = radarList().filter((entry) => entry.code.id === hit.code.id);
    const position = sameCode.findIndex((entry) => entry.iso === hit.iso) + 1;
    const adjusted = priceMode.mode === 'adjusted' && splitFactorBefore(hit.iso) > 1;
    box.innerHTML = `
      <div class="layer-detail-head"><span class="layer-kind is-number">★ ${hit.code.name}</span><time>${formatDay(hit.iso)}</time><span class="layer-detail-prices">${priceLine}</span></div>
      <h4 class="layer-detail-title">${formatPrice(hit.close)} close · ${hit.code.name}</h4>
      <p class="layer-detail-text">${escapeHtml(hit.code.note)} Tagging rule: <code>${escapeHtml(radarRule(hit.code.id))}</code>. Hit ${position} of ${sameCode.length} for this rule. Prices are always read off the printed (as traded) tape${adjusted ? ' — the chart is currently split-adjusted, so the marker sits on the same session at ÷4 scale' : ''}.</p>
      <p class="layer-detail-links"><a href="market-data.js" target="_blank" rel="noreferrer">Source: market-data.js ↗</a><span class="layer-detail-source">Computed from ${asTradedBars.length} printed EOD bars</span></p>`;
    return;
  }

  if (active.kind === 'corp') {
    const item = corporateEvents[active.index];
    const meta = CORP_TYPE[item.type] ?? CORP_TYPE.other;
    box.innerHTML = `
      <div class="layer-detail-head"><span class="layer-kind is-corp">${meta.label}</span><time>${formatDay(item.iso)}</time><span class="layer-detail-prices">${priceLine}</span></div>
      <h4 class="layer-detail-title">${escapeHtml(item.title)}</h4>
      <p class="layer-detail-text">${escapeHtml(item.detail)}</p>
      <p class="layer-detail-links"><a href="${item.url}" target="_blank" rel="noreferrer">${escapeHtml(item.source)} ↗</a></p>`;
    return;
  }

  const tweet = rcTweets[active.index];
  box.innerHTML = `
    <div class="layer-detail-head"><span class="layer-kind is-tweet">RC / 𝕏 TWEET</span><time>${formatDay(tweet.iso)}</time><span class="layer-detail-prices">${priceLine}</span></div>
    <blockquote class="layer-tweet-text">„${escapeHtml(tweet.text)}“</blockquote>
    <p class="layer-detail-text">${escapeHtml(tweet.note)}</p>
    <p class="layer-detail-links"><a href="${RC_X_URL}" target="_blank" rel="noreferrer">Original: @ryancohen on X ↗</a><a href="${tweet.url}" target="_blank" rel="noreferrer">Source: ${escapeHtml(tweet.source)} ↗</a></p>`;
}

function buildLayerList() {
  const list = document.querySelector('#layer-list');
  if (!list) return;
  const entries = [];
  if (layerState.corp) {
    corporateEvents.forEach((item, index) => {
      if (layerState.corpFilter !== 'all' && item.type !== layerState.corpFilter) return;
      entries.push({ kind: 'corp', index, iso: item.iso, item });
    });
  }
  if (layerState.tweets) {
    rcTweets.forEach((tweet, index) => entries.push({ kind: 'tweet', index, iso: tweet.iso, item: tweet }));
  }
  if (layerState.numbers) {
    radarList().forEach((hit, index) => entries.push({ kind: 'number', index, iso: hit.iso, item: hit }));
  }
  entries.sort((a, b) => a.iso.localeCompare(b.iso));

  list.innerHTML = entries.map((entry) => {
    const isActive = layerState.active?.kind === entry.kind && layerState.active?.index === entry.index;
    if (entry.kind === 'number') {
      return `<button type="button" class="layer-item is-number${isActive ? ' is-active' : ''}" data-layer-kind="number" data-layer-index="${entry.index}">
        <span class="layer-item-date">${formatShortDay(entry.iso)}</span>
        <span class="layer-item-kind">★ ${entry.item.code.name}</span>
        <span class="layer-item-title">${formatPrice(entry.item.close)} close</span>
      </button>`;
    }
    if (entry.kind === 'corp') {
      const meta = CORP_TYPE[entry.item.type] ?? CORP_TYPE.other;
      return `<button type="button" class="layer-item is-corp${isActive ? ' is-active' : ''}" data-layer-kind="corp" data-layer-index="${entry.index}">
        <span class="layer-item-date">${formatShortDay(entry.iso)}</span>
        <span class="layer-item-kind">${meta.label}</span>
        <span class="layer-item-title">${escapeHtml(entry.item.title)}</span>
      </button>`;
    }
    return `<button type="button" class="layer-item is-tweet${isActive ? ' is-active' : ''}" data-layer-kind="tweet" data-layer-index="${entry.index}">
      <span class="layer-item-date">${formatShortDay(entry.iso)}</span>
      <span class="layer-item-kind">RC 𝕏</span>
      <span class="layer-item-title">${escapeHtml(entry.item.text)}</span>
    </button>`;
  }).join('') || '<p class="layer-detail-hint">No entries — enable a layer above.</p>';

  list.querySelectorAll('.layer-item').forEach((button) => {
    button.addEventListener('click', () => openLayerItem(button.dataset.layerKind, Number(button.dataset.layerIndex)));
  });
}

function setLayersCollapsed(collapsed) {
  const terminal = document.querySelector('.chart-terminal');
  terminal?.classList.toggle('layers-collapsed', collapsed);
  const toggle = document.querySelector('#layers-toggle');
  toggle?.setAttribute('aria-expanded', String(!collapsed));
  const signal = document.querySelector('#layers-toggle-signal');
  if (signal) signal.textContent = collapsed ? '▸' : '▾';
  const panel = document.querySelector('#layer-panel');
  if (panel) panel.hidden = collapsed;
  window.setTimeout(() => { terminalPaintKey = ''; paintTerminal(); paintCallout(); }, 60);
}

function openLayerItem(kind, index, { reveal = true } = {}) {
  const items = layerItems(kind);
  if (!items[index]) return;
  layerState.active = { kind, index };
  if (kind === 'corp') layerState.corp = true;
  if (kind === 'tweet') layerState.tweets = true;
  if (kind === 'number') layerState.numbers = true;
  setLayersCollapsed(false);
  syncLayerControls();
  buildLayerList();
  renderLayerDetail();
  if (reveal) {
    const { barIndex } = layerBar(kind, index);
    if (barIndex !== undefined) scrollMemeIntoView(barIndex);
  }
  terminalPaintKey = '';
  paintTerminal();
  // Die Detailkarte deutlich nach vorne holen: kurz aufleuchten und in den
  // sichtbaren Bereich des Panels scrollen, damit der Klick eine Antwort gibt.
  const detail = document.querySelector('#layer-detail');
  if (detail) {
    detail.classList.remove('is-flash');
    void detail.offsetWidth;
    detail.classList.add('is-flash');
    detail.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
}

function syncLayerControls() {
  const corpToggle = document.querySelector('#corp-toggle');
  corpToggle?.setAttribute('aria-pressed', String(layerState.corp));
  corpToggle?.classList.toggle('is-on', layerState.corp);
  const corpState = document.querySelector('#corp-toggle-state');
  if (corpState) corpState.textContent = layerState.corp ? 'ON' : 'OFF';
  const tweetToggle = document.querySelector('#tweet-toggle');
  tweetToggle?.setAttribute('aria-pressed', String(layerState.tweets));
  tweetToggle?.classList.toggle('is-on', layerState.tweets);
  const tweetState = document.querySelector('#tweet-toggle-state');
  if (tweetState) tweetState.textContent = layerState.tweets ? 'ON' : 'OFF';
  const numberToggle = document.querySelector('#number-toggle');
  numberToggle?.setAttribute('aria-pressed', String(layerState.numbers));
  numberToggle?.classList.toggle('is-on', layerState.numbers);
  const numberState = document.querySelector('#number-toggle-state');
  if (numberState) numberState.textContent = layerState.numbers ? 'ON' : 'OFF';
  document.querySelectorAll('[data-corp-filter]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.corpFilter === layerState.corpFilter);
  });
  const count = document.querySelector('#layer-count');
  if (count) count.textContent = `${corporateEvents.length} EVENTS · ${rcTweets.length} RC-TWEETS · ${radarList().length} MEME NUMBERS · ${memeMoments.length} MEMES`;
}

function bindChartLayers() {
  document.querySelector('#layers-toggle')?.addEventListener('click', () => {
    const collapsed = !document.querySelector('.chart-terminal')?.classList.contains('layers-collapsed');
    setLayersCollapsed(collapsed);
  });
  document.querySelector('#corp-toggle')?.addEventListener('click', () => {
    layerState.corp = !layerState.corp;
    syncLayerControls(); buildLayerList(); terminalPaintKey = ''; paintTerminal();
  });
  document.querySelector('#tweet-toggle')?.addEventListener('click', () => {
    layerState.tweets = !layerState.tweets;
    syncLayerControls(); buildLayerList(); terminalPaintKey = ''; paintTerminal();
  });
  document.querySelector('#number-toggle')?.addEventListener('click', () => {
    layerState.numbers = !layerState.numbers;
    setRadarOn(layerState.numbers);
  });
  document.querySelectorAll('[data-corp-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      layerState.corpFilter = button.dataset.corpFilter;
      layerState.corp = true;
      syncLayerControls(); buildLayerList(); terminalPaintKey = ''; paintTerminal();
    });
  });

  // Direct jumps: play Tendieman / cat memes / viral clips in the chart dock
  document.querySelectorAll('[data-open-meme]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = memeMoments.findIndex((moment) => moment.id === button.dataset.openMeme);
      if (index < 0) return;
      document.querySelector('#chart-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      followPageScrollUntil = Date.now() + 1200;
      memeIndex = index;
      renderMeme(index, false);
      openChartMeme(index);
    });
  });

  syncLayerControls();
  buildLayerList();
  renderLayerDetail();
}

/* ------------------------------------------- market structure / flows --- */

// Drei offizielle Serien, direkt unter der Kursfläche:
//   • DRS / registrierte Aktien — die Zahlen, die GameStop in 10-Q/10-K nennt
//   • Short Interest — FINRA, zweimal pro Monat (Settlement 15. und letzter
//     Handelstag), Datei: flow-data.js aus scripts/fetch-market-structure.mjs
//   • Fails to Deliver — SEC (CNS), Aggregat-Bestand je Settlement-Datum
// Der Strip darunter zeigt dieselbe Kursansicht als Spiegel (Klon der
// Chart-SVG), die Serien liegen als eigene Bahnen darüber. Ein Scrollbalken,
// ein Zoom — keine zweite Bedienung.
//
// Fehlt flow-data.js (z. B. offline), greift eine dokumentierte Ankerliste,
// und die Oberfläche sagt ausdrücklich, dass sie unvollständig ist.

const FLOWS = typeof window !== 'undefined' ? window.GME_FLOWS : null;

const FALLBACK_FLOWS = {
  updated: '2026-10-16',
  shortInterest: [
    { date: '2026-02-27', short: 65600000, averageVolume: 4691392, daysToCover: 13.98 },
    { date: '2026-04-15', short: 61907606, averageVolume: 11590000, daysToCover: 5.34 },
    { date: '2026-09-15', short: 39069126, averageVolume: 9105968, daysToCover: 4.29 },
    { date: '2026-09-30', short: 42673721, averageVolume: 10727887, daysToCover: 3.98 }
  ],
  ftd: [
    { date: '2021-01-15', shares: 892653, price: null },
    { date: '2021-01-19', shares: 1498576, price: null },
    { date: '2021-01-21', shares: 1438994, price: null },
    { date: '2021-01-26', shares: 2099572, price: null },
    { date: '2021-01-27', shares: 1972862, price: null },
    { date: '2025-12-04', shares: 2068490, price: 23.21 },
    { date: '2026-03-31', shares: 24739, price: 23.04 }
  ]
};

function parseShortInterestRows(payload) {
  const rows = [];
  if (!payload?.rows) return rows;
  String(payload.rows).trim().split('\n').forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;
    const [date, short, previous, averageVolume, daysToCover] = parts;
    const value = Number(short);
    if (!date || !Number.isFinite(value)) return;
    rows.push({
      date,
      short: value,
      previous: Number(previous) || null,
      averageVolume: Number(averageVolume) || null,
      daysToCover: Number(daysToCover) || null
    });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function parseFtdRows(payload) {
  const rows = [];
  if (!payload?.rows) return rows;
  String(payload.rows).trim().split('\n').forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;
    const [date, shares, price] = parts;
    const value = Number(shares);
    if (!date || !Number.isFinite(value)) return;
    rows.push({ date, shares: value, price: Number(price) || null });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const shortInterestRows = FLOWS?.shortInterest ? parseShortInterestRows(FLOWS.shortInterest) : [];
const ftdRows = FLOWS?.ftd ? parseFtdRows(FLOWS.ftd) : [];

const flowState = {
  enabled: true,
  fallback: !shortInterestRows.length && !ftdRows.length,
  updated: FLOWS?.updated ?? FALLBACK_FLOWS.updated,
  shortInterest: shortInterestRows.length ? shortInterestRows : FALLBACK_FLOWS.shortInterest,
  ftd: ftdRows.length ? ftdRows : FALLBACK_FLOWS.ftd,
  panes: { drs: true, si: true, ftd: true },
  readout: null
};

// DRS: die Zahlen, die GameStop selbst veröffentlicht — Datum = Stichtag aus
// dem Filing. Alle Werte split-bereinigt (die Filings von 2021/22 nennen
// Pre-Split-Zahlen, hier steht der 4:1-bereinigte Wert).
const DRS_DISCLOSURES = [
  { iso: '2021-10-30', shares: 20.8e6, outstanding: 305403124, label: 'Q3 2021 10-Q', note: 'first disclosure: 5.2M shares before the 4:1 split', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2022-01-29', shares: 35.6e6, outstanding: 305356992, label: 'Q4 2021 10-K', note: '8.9M shares before the split', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2022-04-30', shares: 50.8e6, outstanding: 304516136, label: 'Q1 2022 10-Q', note: '12.7M pre-split — DRS goes mainstream', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2022-07-30', shares: 71.3e6, outstanding: 304529721, label: 'Q2 2022 10-Q', note: 'the quarter of the 4:1 split dividend', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2022-10-29', shares: 71.8e6, outstanding: 304548070, label: 'Q3 2022 10-Q', note: 'first plateau just under 72M', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2023-03-22', shares: 76.0e6, outstanding: 304675439, holders: 197058, label: 'Q4 2022 10-K', note: '197,058 record holders and 76M shares', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2023-06-01', shares: 76.6e6, outstanding: 304751243, label: 'Q1 2023 10-Q', note: 'the peak of the DRS series', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2023-08-31', shares: 75.4e6, outstanding: 305241294, label: 'Q2 2023 10-Q', note: 'first decline after two years of growth', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2023-11-30', shares: 75.4e6, outstanding: 305514315, label: 'Q3 2023 10-Q', note: 'flat, still around a quarter of all shares', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2024-03-20', shares: 75.3e6, outstanding: 305873200, label: 'Q4 2023 10-K', note: 'the last quarter before the share count jumps', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2024-06-05', shares: 74.6e6, outstanding: 351217517, label: 'Q1 2024 10-Q', note: 'the ATM offering dilutes the register to 21.2%', url: 'https://www.sec.gov/Archives/edgar/data/1326380/000132638024000030/gme-20240504.htm' },
  { iso: '2024-09-04', shares: 72.8e6, outstanding: 426509592, label: 'Q2 2024 10-Q', note: 'share count at 426.5M — the DRS share falls to 17.1%', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2024-12-04', shares: 71.0e6, outstanding: 446800365, label: 'Q3 2024 10-Q', note: '15.9% of the company', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2025-03-19', shares: 69.5e6, outstanding: 447083981, holders: 190074, label: 'Q4 2024 10-K', note: '190,074 record holders; the register shrinks while the cash grows', url: 'https://www.sec.gov/Archives/edgar/data/1326380/000162828025014731/gme-20250201.htm' },
  { iso: '2025-06-05', shares: 68.1e6, outstanding: 447336306, label: 'Q1 2025 10-Q', note: 'the same quarter the Bitcoin treasury lands', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2025-09-05', shares: 66.7e6, outstanding: 448000000, label: 'Q2 2025 10-Q', note: 'reported as roughly 15% of outstanding shares', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2025-12-05', shares: 67.0e6, outstanding: 448000000, label: 'Q3 2025 10-Q', note: 'a small bounce back to about 67M', url: 'https://www.drsgme.org/drs-reporting' },
  { iso: '2026-03-18', shares: 66.2e6, outstanding: 448400000, label: 'Q4 2025 10-K', note: '66.2M registered, 3.3M of them inside the DSPP — no later 10-Q in this archive yet, so the series stops where the filings stop', url: 'https://www.shacknews.com/article/148451/gamestop-gme-q4-2025-drs-66-million' }
];

const DRS_PEAK = DRS_DISCLOSURES.reduce((best, entry) => (entry.shares > best.shares ? entry : best), DRS_DISCLOSURES[0]);
const DRS_LATEST = DRS_DISCLOSURES[DRS_DISCLOSURES.length - 1];

function drsPercent(entry) {
  if (!entry?.outstanding) return null;
  return (entry.shares / entry.outstanding) * 100;
}

function flowStats() {
  const si = flowState.shortInterest;
  const ftd = flowState.ftd;
  const latestSi = si[si.length - 1] ?? null;
  const previousSi = si[si.length - 2] ?? null;
  const window = si.slice(-12);
  const averageSi = window.length ? window.reduce((sum, row) => sum + row.short, 0) / window.length : null;
  const peakFtd = ftd.reduce((best, row) => (!best || row.shares > best.shares ? row : best), null);
  const latestFtd = ftd[ftd.length - 1] ?? null;
  return {
    latestSi,
    previousSi,
    averageSi,
    siChange: latestSi && previousSi ? (latestSi.short / previousSi.short - 1) * 100 : null,
    ftdPeak: peakFtd,
    ftdLatest: latestFtd,
    drsLatest: DRS_LATEST,
    drsPeak: DRS_PEAK,
    drsChange: (DRS_LATEST.shares - DRS_PEAK.shares) / DRS_PEAK.shares * 100
  };
}

/* -------------------------------------------------- tendieman full screen - */

// Vollbild-Tendieman: die eigenen Zeilen des Archivs, jede an einen echten
// Handelstag des Tapes gehängt. Kein Mitschnitt, kein fremder Text.

const TENDIEMAN_LINES = [
  { text: 'A mall retailer, cheap as the carpet.', data: '2019 · $4 a share, nobody watching' },
  { text: 'Then a letter, then a board seat.', data: 'NOV 2020 · RC buys in, the thesis gets loud' },
  { text: 'The message board starts counting.', data: '13 JAN 2021 · $31.40 · +57% in one session' },
  { text: 'Soon may the tendieman come…', data: '26 JAN 2021 · $147.98 · +92.7%' },
  { text: '…to bring us tendies and rum.', data: '27 JAN 2021 · the squeeze prints $483 intraday' },
  { text: 'The buy button goes dark.', data: '28 JAN 2021 · access becomes the story' },
  { text: 'So we learned to hold the line.', data: '2021 · the year of diamond hands and receipts' },
  { text: 'Split the share, keep the ledger.', data: '22 JUL 2022 · one share becomes four' },
  { text: 'Quiet quarters, actual profit.', data: 'MAR 2023 · first quarterly profit in two years' },
  { text: 'A cat returns from the deep.', data: '13 MAY 2024 · Roaring Kitty posts, the tape jumps 74%' },
  { text: 'Cash, then Bitcoin, then a bid.', data: '2025–2026 · $9B on hand, an offer for eBay' },
  { text: 'One warrant for every ten.', data: 'OCT 2026 · $32 strike, expiring 30 October' }
];

const TENDIEMAN_DURATION = 96000; // ms for one full pass
const lyricState = { active: false, index: -1, startedAt: 0, rafId: null, pausedAt: 0 };

function tendiemanLines() {
  const last = activeDailyBars().at(-1);
  return [
    ...TENDIEMAN_LINES,
    {
      text: 'The record stays open.',
      data: `${formatDay(marketMeta.end)} · ${formatPrice(last?.close ?? 0)} on the tape`
    }
  ];
}

function tickTendieman() {
  if (!lyricState.active) {
    lyricState.rafId = null;
    return;
  }
  const total = tendiemanLines().length;
  const progress = clamp((Date.now() - lyricState.startedAt) / TENDIEMAN_DURATION, 0, 1);
  const index = Math.min(total - 1, Math.floor(progress * total));
  if (index !== lyricState.index) setTendiemanIndex(index);
  const fill = document.querySelector('#tendieman-progress-fill');
  if (fill) fill.style.width = `${progress * 100}%`;
  if (progress >= 1) {
    closeTendieman();
    return;
  }
  lyricState.rafId = raf(tickTendieman);
}

function setTendiemanIndex(index) {
  const lines = tendiemanLines();
  lyricState.index = clamp(index, 0, lines.length - 1);
  const list = document.querySelector('#tendieman-lines');
  if (!list) return;
  list.querySelectorAll('.tendieman-line').forEach((node, position) => {
    node.classList.toggle('is-active', position === lyricState.index);
    node.classList.toggle('is-past', position < lyricState.index);
  });
  const counter = document.querySelector('#tendieman-counter');
  if (counter) counter.textContent = `${String(lyricState.index + 1).padStart(2, '0')} / ${String(lines.length).padStart(2, '0')}`;
  list.querySelector('.tendieman-line.is-active')?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function openTendieman({ autoplay = true } = {}) {
  const overlay = document.querySelector('#tendieman');
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('tendieman-open');
  lyricState.active = true;
  lyricState.pausedAt = 0;
  setTendiemanIndex(0);
  if (autoplay) {
    lyricState.startedAt = Date.now();
    if (!lyricState.rafId) lyricState.rafId = raf(tickTendieman);
  }
  document.querySelector('#tendieman-close')?.focus?.();
  showToast('♪ TENDIEMAN MODE — every line is dated, ESC closes', 'code');
}

function closeTendieman() {
  const overlay = document.querySelector('#tendieman');
  if (overlay) overlay.hidden = true;
  document.body.classList.remove('tendieman-open');
  lyricState.active = false;
  if (lyricState.rafId && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(lyricState.rafId);
  lyricState.rafId = null;
}

function toggleTendiemanPause() {
  if (!lyricState.active) return;
  const label = document.querySelector('#tendieman-state');
  const button = document.querySelector('#tendieman-play');
  if (lyricState.rafId) {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(lyricState.rafId);
    lyricState.rafId = null;
    lyricState.pausedAt = Date.now() - lyricState.startedAt;
    if (label) label.textContent = 'PAUSED';
    if (button) button.textContent = 'PLAY';
    return;
  }
  lyricState.startedAt = Date.now() - lyricState.pausedAt;
  lyricState.rafId = raf(tickTendieman);
  if (label) label.textContent = 'PLAYING';
  if (button) button.textContent = 'PAUSE';
}

function renderTendieman() {
  const list = document.querySelector('#tendieman-lines');
  if (!list) return;
  list.innerHTML = tendiemanLines().map((line, index) => `
    <li class="tendieman-line" data-line-index="${index}">
      <p class="tendieman-text">${escapeHtml(line.text)}</p>
      <span class="tendieman-data">${escapeHtml(line.data)}</span>
    </li>
  `).join('');
  list.querySelectorAll('.tendieman-line').forEach((node) => {
    node.addEventListener('click', () => {
      const total = tendiemanLines().length;
      const index = Number(node.dataset.lineIndex);
      if (!lyricState.active) openTendieman({ autoplay: false });
      lyricState.startedAt = Date.now() - (index / total) * TENDIEMAN_DURATION;
      lyricState.pausedAt = Date.now() - lyricState.startedAt;
      if (!lyricState.rafId) lyricState.rafId = raf(tickTendieman);
      setTendiemanIndex(index);
    });
  });
}

/* --------------------------------------------------------- flows strip --- */

let flowsPaintKey = '';
let flowsGeometry = null;

function flowsTrack() {
  return document.querySelector('#flows-track');
}

function flowsBars() {
  return seriesFor(chartState.resolution);
}

// Der Strip zeigt dieselbe Kursfläche: ein Klon der Chart-SVG (Kurs, Volumen,
// Kerzen, Marker) liegt in der Spur, darüber werden die Serien gezeichnet.
function ensureFlowsClone() {
  const track = flowsTrack();
  const source = terminalElements().canvas;
  if (!track || !source) return null;
  const width = Number(source.getAttribute('width'));
  const height = Number(source.getAttribute('height'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const signature = `${source.getAttribute('viewBox')}|${width}|${height}|${source.childElementCount}`;
  const existing = track.querySelector('#flows-clone-canvas');
  if (existing && existing.dataset.signature === signature) return existing;
  const clone = source.cloneNode(true);
  clone.id = 'flows-clone-canvas';
  clone.classList.add('flows-clone-canvas');
  clone.removeAttribute('role');
  clone.setAttribute('aria-hidden', 'true');
  clone.dataset.signature = signature;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  if (existing) existing.replaceWith(clone);
  else track.prepend(clone);
  return clone;
}

function paintFlows({ force = false } = {}) {
  const body = document.querySelector('#flows-body');
  const track = flowsTrack();
  const svg = document.querySelector('#flows-canvas');
  if (!body || !track || !svg) return;
  if (!flowState.enabled) return;

  const clone = ensureFlowsClone();
  if (!clone) return;

  const metrics = terminalMetrics();
  const bars = flowsBars();
  const width = trackWidth(metrics);
  const height = Number(clone.getAttribute('height')) || 360;
  const source = terminalElements().canvas;
  const leftPx = Number.parseFloat(source?.style?.left || '0') || 0;

  const key = [
    chartState.resolution, chartState.ppb.toFixed(3), Math.round(leftPx), width, height, priceMode.mode,
    `${flowState.panes.drs ? 1 : 0}${flowState.panes.si ? 1 : 0}${flowState.panes.ftd ? 1 : 0}`,
    flowState.readout ? `${flowState.readout.kind}-${flowState.readout.index}` : '-'
  ].join('|');
  if (!force && key === flowsPaintKey) return;
  flowsPaintKey = key;

  const active = [
    flowState.panes.drs ? 'drs' : null,
    flowState.panes.si ? 'si' : null,
    flowState.panes.ftd ? 'ftd' : null
  ].filter(Boolean);
  const gap = 10;
  const laneHeight = Math.max(34, (height - 18 - gap * Math.max(1, active.length)) / Math.max(1, active.length));

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.replaceChildren();
  // Der Strip ist so hoch wie die Kursfläche darüber (mobil übernimmt das CSS).
  body.style.height = `${height}px`;

  // Der Chart zeichnet ein Fenster (ViewBox from..to) und schiebt die SVG mit
  // left = from * ppb in die Spur. In Spuren-Koordinaten sitzt Balken i damit
  // immer bei (i + 0.5) * ppb — genau das nutzt auch diese Ebene.
  const x = (index) => (index + 0.5) * chartState.ppb;
  const groups = {};
  const panes = {};
  active.forEach((id, position) => {
    const top = 12 + position * (laneHeight + gap);
    panes[id] = { id, top, bottom: top + laneHeight, height: laneHeight };
  });

  const grid = svgElement('g', { class: 'flows-grid', 'aria-hidden': 'true' });
  Object.values(panes).forEach((pane) => {
    grid.append(svgElement('rect', { class: 'flows-lane', x: 0, y: pane.top, width, height: pane.height }));
  });
  svg.append(grid);

  /* ---------------------------------------------------------------- DRS -- */
  if (panes.drs) {
    const pane = panes.drs;
    const group = svgElement('g', { class: 'flows-drs' });
    const values = DRS_DISCLOSURES.map((entry) => entry.shares);
    const min = Math.min(...values) * 0.93;
    const max = Math.max(...values) * 1.05;
    const y = (value) => pane.bottom - ((value - min) / (max - min)) * pane.height;
    const points = DRS_DISCLOSURES.map((entry, index) => {
      const barIndex = barIndexForDate(bars, entry.iso);
      return { entry, index, px: x(barIndex), py: y(entry.shares) };
    });
    const areaPath = [
      `M${points[0].px.toFixed(1)},${pane.bottom}`,
      ...points.map((point) => `L${point.px.toFixed(1)},${point.py.toFixed(1)}`),
      `L${points[points.length - 1].px.toFixed(1)},${pane.bottom}`,
      'Z'
    ].join(' ');
    group.append(svgElement('path', { class: 'flows-drs-area', d: areaPath }));
    points.forEach((point, position) => {
      const previous = points[position - 1];
      if (!previous) return;
      group.append(svgElement('line', {
        class: 'flows-drs-line', x1: previous.px, y1: previous.py, x2: point.px, y2: point.py
      }));
    });
    points.forEach((point, position) => {
      const isPeak = point.entry.iso === DRS_PEAK.iso;
      const isLatest = position === points.length - 1;
      const isActive = flowState.readout?.kind === 'drs' && flowState.readout.index === position;
      const dot = svgElement('circle', {
        class: `flows-drs-dot${isPeak ? ' is-peak' : ''}${isLatest ? ' is-latest' : ''}${isActive ? ' is-active' : ''}`,
        cx: point.px, cy: point.py, r: isPeak || isLatest ? 5 : 3.4,
        'data-drs-index': position
      });
      dot.append(svgElement('title', {}, `${formatDay(point.entry.iso)} — ${formatCompact(point.entry.shares)} registered · ${drsPercent(point.entry).toFixed(2)}% of ${formatCompact(point.entry.outstanding)}`));
      group.append(dot);
      if (isPeak || isLatest) {
        group.append(svgElement('text', {
          class: `flows-dot-label${isPeak ? ' is-peak' : ' is-latest'}`,
          x: clamp(point.px + 8, 60, width - 20),
          y: clamp(point.py - 6, pane.top + 13, pane.bottom - 4)
        }, `${formatCompact(point.entry.shares)} · ${drsPercent(point.entry).toFixed(1)}%`));
      }
    });
    svg.append(group);
    groups.drs = { pane, points };
  }

  /* ----------------------------------------------------- short interest -- */
  if (panes.si) {
    const pane = panes.si;
    const group = svgElement('g', { class: 'flows-si' });
    const rows = flowState.shortInterest;
    const max = Math.max(...rows.map((row) => row.short));
    const y = (value) => pane.bottom - (value / max) * pane.height;
    const average = rows.slice(-12).reduce((sum, row) => sum + row.short, 0) / Math.min(12, rows.length);
    const barWidth = clamp(chartState.ppb * 0.62, 1.4, 26);
    rows.forEach((row, index) => {
      const barIndex = barIndexForDate(bars, row.date);
      const px = x(barIndex);
      const previous = rows[index - 1];
      const rising = previous ? row.short >= previous.short : true;
      const isActive = flowState.readout?.kind === 'si' && flowState.readout.index === index;
      const rect = svgElement('rect', {
        class: `flows-si-bar${rising ? ' is-rising' : ' is-falling'}${isActive ? ' is-active' : ''}`,
        x: px - barWidth / 2,
        y: y(row.short),
        width: barWidth,
        height: Math.max(1.5, pane.bottom - y(row.short)),
        'data-si-index': index
      });
      rect.append(svgElement('title', {}, `${formatDay(row.date)} — ${formatCompact(row.short)} shares short${row.daysToCover ? ` · ${row.daysToCover.toFixed(2)} days to cover` : ''}`));
      group.append(rect);
    });
    group.append(svgElement('line', {
      class: 'flows-si-average', x1: 0, x2: width, y1: y(average), y2: y(average)
    }));
    group.append(svgElement('text', {
      class: 'flows-average-label', x: 8, y: clamp(y(average) - 6, pane.top + 13, pane.bottom - 4)
    }, `12-REPORT AVG ${formatCompact(average)}`));
    svg.append(group);
    groups.si = { pane, rows };
  }

  /* ------------------------------------------------- fails to deliver --- */
  if (panes.ftd) {
    const pane = panes.ftd;
    const group = svgElement('g', { class: 'flows-ftd' });
    const rows = flowState.ftd;
    const floor = 1000;
    const values = rows.map((row) => Math.max(floor, row.shares));
    const minLog = Math.log10(Math.min(...values));
    const maxLog = Math.log10(Math.max(...values));
    const span = Math.max(0.5, maxLog - minLog);
    const y = (value) => pane.bottom - ((Math.log10(Math.max(floor, value)) - minLog) / span) * pane.height;
    const barWidth = clamp(chartState.ppb * 0.62, 1.4, 26);
    rows.forEach((row, index) => {
      const barIndex = barIndexForDate(bars, row.date);
      const px = x(barIndex);
      const isActive = flowState.readout?.kind === 'ftd' && flowState.readout.index === index;
      const rect = svgElement('rect', {
        class: `flows-ftd-bar${isActive ? ' is-active' : ''}`,
        x: px - barWidth / 2,
        y: y(row.shares),
        width: barWidth,
        height: Math.max(1.5, pane.bottom - y(row.shares)),
        'data-ftd-index': index
      });
      rect.append(svgElement('title', {}, `${formatDay(row.date)} — ${formatCompact(row.shares)} shares failed to deliver${row.price ? ` ($${row.price.toFixed(2)} previous close)` : ''}`));
      group.append(rect);
    });
    const peak = rows.reduce((best, row) => (row.shares > best.shares ? row : best), rows[0]);
    const peakX = x(barIndexForDate(bars, peak.date));
    group.append(svgElement('text', {
      class: 'flows-dot-label is-peak',
      x: clamp(peakX + 8, 60, width - 40),
      y: pane.top + 13
    }, `PEAK ${formatCompact(peak.shares)} · ${formatDay(peak.date).toUpperCase()}`));
    svg.append(group);
    groups.ftd = { pane, rows };
  }

  flowsGeometry = groups;
  renderFlowsRail(panes);
  renderFlowReadout();
}

// Klebende Bahn-Beschriftung: bleibt beim Scrollen links stehen.
function renderFlowsRail(panes) {
  const rail = document.querySelector('#flows-rail');
  if (!rail) return;
  const stats = flowStats();
  const drsBlock = rail.querySelector('.flows-rail-block.is-drs');
  if (drsBlock) {
    drsBlock.hidden = !panes.drs;
    if (panes.drs) {
      drsBlock.style.top = `${panes.drs.top}px`;
      drsBlock.style.height = `${panes.drs.height}px`;
      drsBlock.querySelector('.flows-rail-value').textContent = `${formatCompact(stats.drsLatest.shares)} SHARES`;
      drsBlock.querySelector('.flows-rail-sub').textContent = `${drsPercent(stats.drsLatest).toFixed(1)}% · ${stats.drsLatest.label}`;
    }
  }
  const siBlock = rail.querySelector('.flows-rail-block.is-si');
  if (siBlock) {
    siBlock.hidden = !panes.si;
    if (panes.si) {
      siBlock.style.top = `${panes.si.top}px`;
      siBlock.style.height = `${panes.si.height}px`;
      siBlock.querySelector('.flows-rail-value').textContent = `${formatCompact(stats.latestSi.short)} SHARES`;
      siBlock.querySelector('.flows-rail-sub').textContent = stats.latestSi.daysToCover
        ? `${stats.latestSi.daysToCover.toFixed(2)} DAYS TO COVER`
        : 'FINRA';
    }
  }
  const ftdBlock = rail.querySelector('.flows-rail-block.is-ftd');
  if (ftdBlock) {
    ftdBlock.hidden = !panes.ftd;
    if (panes.ftd) {
      ftdBlock.style.top = `${panes.ftd.top}px`;
      ftdBlock.style.height = `${panes.ftd.height}px`;
      ftdBlock.querySelector('.flows-rail-value').textContent = `${formatCompact(stats.ftdLatest.shares)} SHARES`;
      ftdBlock.querySelector('.flows-rail-sub').textContent = `LAST ${formatDay(stats.ftdLatest.date).toUpperCase()}`;
    }
  }
}

function renderFlowReadout() {
  const box = document.querySelector('#flows-readout');
  if (!box) return;
  const hit = flowState.readout;
  if (!hit) {
    box.classList.remove('is-active');
    box.innerHTML = flowState.fallback
      ? 'anchor values only — no flow-data.js in this checkout, so the regulator series are incomplete'
      : `hover or click a bar to read it · FINRA short interest + SEC fails to deliver · updated ${escapeHtml(String(flowState.updated))}`;
    return;
  }
  box.classList.add('is-active');
  if (hit.kind === 'drs') {
    const entry = DRS_DISCLOSURES[hit.index];
    box.innerHTML = `<b>${formatDay(entry.iso)}</b> · ${formatCompact(entry.shares)} registered (${drsPercent(entry).toFixed(2)}% of ${formatCompact(entry.outstanding)})${entry.holders ? ` · ${entry.holders.toLocaleString('en-US')} record holders` : ''} · ${escapeHtml(entry.label)} — ${escapeHtml(entry.note)}`;
    return;
  }
  if (hit.kind === 'si') {
    const row = flowState.shortInterest[hit.index];
    const change = row.previous ? (row.short / row.previous - 1) * 100 : null;
    box.innerHTML = `<b>${formatDay(row.date)}</b> · ${formatCompact(row.short)} shares short${change === null ? '' : ` · ${formatPercent(change)} vs previous settlement`}${row.daysToCover ? ` · ${row.daysToCover.toFixed(2)} days to cover` : ''}${row.averageVolume ? ` · ${formatCompact(row.averageVolume)} shares/day` : ''} · FINRA`;
    return;
  }
  const row = flowState.ftd[hit.index];
  box.innerHTML = `<b>${formatDay(row.date)}</b> · ${formatCompact(row.shares)} shares failed to deliver${row.price ? ` · $${row.price.toFixed(2)} previous close` : ''} · SEC CNS`;
}

function renderFlowsStats() {
  const box = document.querySelector('#flows-stats');
  if (!box) return;
  const stats = flowStats();
  const cards = [
    {
      label: 'DRS / TRANSFER AGENT',
      value: `${drsPercent(stats.drsLatest).toFixed(1)}%`,
      sub: `${formatCompact(stats.drsLatest.shares)} of ${formatCompact(stats.drsLatest.outstanding)} shares · ${formatDay(stats.drsLatest.iso)}`,
      foot: `peak ${formatCompact(stats.drsPeak.shares)} in ${formatDay(stats.drsPeak.iso).slice(-4)} · ${formatPercent(stats.drsChange)} since`
    },
    {
      label: 'SHORT INTEREST / FINRA',
      value: `${formatCompact(stats.latestSi.short)}`,
      sub: `shares short · settled ${formatDay(stats.latestSi.date)}${stats.siChange === null ? '' : ` · ${formatPercent(stats.siChange)} vs previous`}`,
      foot: `12-report average ${formatCompact(stats.averageSi)}${stats.latestSi.daysToCover ? ` · ${stats.latestSi.daysToCover.toFixed(2)} days to cover` : ''}`
    },
    {
      label: 'FAILS TO DELIVER / SEC',
      value: `${formatCompact(stats.ftdLatest.shares)}`,
      sub: `shares on ${formatDay(stats.ftdLatest.date)} · peak ${formatCompact(stats.ftdPeak.shares)} on ${formatDay(stats.ftdPeak.date)}`,
      foot: 'aggregate balance per settlement date — not daily new fails'
    }
  ];
  box.innerHTML = cards.map((card) => `
    <div class="flows-stat">
      <span class="flows-stat-label">${card.label}</span>
      <strong>${card.value}</strong>
      <span class="flows-stat-sub">${card.sub}</span>
      <span class="flows-stat-foot">${card.foot}</span>
    </div>
  `).join('');
}

// Der Strip hängt am Scroll des Charts: ein Transform, kein zweiter Scrollbalken.
function syncFlowsScroll() {
  const track = flowsTrack();
  const { viewport } = terminalElements();
  if (!track || !viewport) return;
  track.style.transform = `translateX(${-viewport.scrollLeft}px)`;
}

function setFlowsEnabled(on) {
  flowState.enabled = on;
  document.body.classList.toggle('flows-off', !on);
  const toggle = document.querySelector('#flows-toggle');
  toggle?.setAttribute('aria-pressed', String(on));
  const state = document.querySelector('#flows-toggle-state');
  if (state) state.textContent = on ? 'ON' : 'OFF';
  if (on) {
    flowsPaintKey = '';
    paintFlows({ force: true });
    syncFlowsScroll();
  }
  showToast(on ? 'MARKET STRUCTURE STRIP ON' : 'MARKET STRUCTURE STRIP OFF', 'code');
}

function setFlowPane(pane, on) {
  if (!(pane in flowState.panes)) return;
  flowState.panes[pane] = on;
  document.querySelectorAll(`[data-flow-pane-toggle="${pane}"]`).forEach((button) => {
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('is-on', on);
  });
  flowsPaintKey = '';
  paintFlows({ force: true });
  showToast(`${pane.toUpperCase()} PANE ${on ? 'ON' : 'OFF'}`, 'code');
}

function bindFlowsInteraction() {
  const body = document.querySelector('#flows-body');
  const svg = document.querySelector('#flows-canvas');
  const { viewport } = terminalElements();
  if (!body || !svg || !viewport) return;

  const resolve = (event) => {
    const target = event.target?.closest?.('[data-si-index], [data-ftd-index], [data-drs-index]');
    if (!target) return null;
    if (target.dataset.siIndex !== undefined) return { kind: 'si', index: Number(target.dataset.siIndex) };
    if (target.dataset.ftdIndex !== undefined) return { kind: 'ftd', index: Number(target.dataset.ftdIndex) };
    return { kind: 'drs', index: Number(target.dataset.drsIndex) };
  };

  const setReadout = (hit, pinned = false) => {
    if (!hit) return;
    flowState.readout = { ...hit, pinned };
    flowsPaintKey = '';
    paintFlows();
  };

  svg.addEventListener('mousemove', (event) => {
    if (flowState.readout?.pinned) return;
    setReadout(resolve(event));
  });
  svg.addEventListener('mouseleave', () => {
    if (flowState.readout?.pinned) return;
    flowState.readout = null;
    flowsPaintKey = '';
    paintFlows();
  });
  svg.addEventListener('click', (event) => {
    const hit = resolve(event);
    if (!hit) return;
    setReadout(hit, true);
    if (hit.kind === 'drs') {
      const entry = DRS_DISCLOSURES[hit.index];
      jumpToIso(entry.iso);
      showToast(`DRS · ${formatDay(entry.iso)} · ${formatCompact(entry.shares)} SHARES · ${drsPercent(entry).toFixed(2)}% OF OUTSTANDING`, 'code');
    } else if (hit.kind === 'si') {
      const row = flowState.shortInterest[hit.index];
      jumpToIso(row.date);
      showToast(`SHORT INTEREST · ${formatDay(row.date)} · ${formatCompact(row.short)} SHARES${row.daysToCover ? ` · ${row.daysToCover.toFixed(2)} DAYS TO COVER` : ''}`, 'code');
    } else {
      const row = flowState.ftd[hit.index];
      jumpToIso(row.date);
      showToast(`FAILS TO DELIVER · ${formatDay(row.date)} · ${formatCompact(row.shares)} SHARES`, 'code');
    }
  });

  // Mausrad über dem Strip scrollt den Chart darüber — und damit beides.
  body.addEventListener('wheel', (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    viewport.scrollLeft += delta;
    syncFlowsScroll();
  }, { passive: false });

  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  body.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.flows-rail')) return;
    dragging = true;
    startX = event.clientX;
    startScroll = viewport.scrollLeft;
    body.classList.add('is-dragging');
    body.setPointerCapture?.(event.pointerId);
  });
  body.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    viewport.scrollLeft = startScroll - (event.clientX - startX);
    syncFlowsScroll();
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    body.classList.remove('is-dragging');
    body.releasePointerCapture?.(event.pointerId);
  };
  body.addEventListener('pointerup', endDrag);
  body.addEventListener('pointercancel', endDrag);

  document.querySelectorAll('[data-flow-pane-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const pane = button.dataset.flowPaneToggle;
      setFlowPane(pane, !flowState.panes[pane]);
    });
  });

  document.querySelector('#flows-toggle')?.addEventListener('click', () => setFlowsEnabled(!flowState.enabled));
  document.querySelector('#flows-strip-toggle')?.addEventListener('click', () => setFlowsEnabled(!flowState.enabled));

  window.addEventListener('resize', () => {
    flowsPaintKey = '';
    paintFlows({ force: true });
    syncFlowsScroll();
  });
}

/* ---------------------------------------------------------------- codes --- */



// Ein Toast statt Alarm: jede Aktion antwortet kurz und lesbar, ohne den
// Chart zu verdecken. prefers-reduced-motion wird respektiert.
let toastTimer = null;
function showToast(message, tone = '') {
  const toast = document.querySelector('#signal-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `signal-toast${tone ? ` is-${tone}` : ''}`;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
}

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function launchRockets() {
  const layer = document.querySelector('#rocket-layer');
  if (!layer) return;
  if (reducedMotion()) {
    showToast('🚀 (reduced motion is on — no rocket rain)', 'moon');
    return;
  }
  layer.replaceChildren();
  layer.hidden = false;
  const glyphs = ['🚀', '🚀', '🌕', '💎', '🙌'];
  for (let index = 0; index < 26; index += 1) {
    const rocket = document.createElement('span');
    rocket.className = 'rocket';
    rocket.textContent = glyphs[index % glyphs.length];
    rocket.style.left = `${(index * 3.9 + (index % 5) * 2.4).toFixed(2)}%`;
    rocket.style.animationDelay = `${(index % 9) * 0.22}s`;
    rocket.style.animationDuration = `${3.4 + (index % 5) * 0.5}s`;
    rocket.style.fontSize = `${18 + (index % 4) * 9}px`;
    layer.append(rocket);
  }
  window.setTimeout(() => {
    layer.hidden = true;
    layer.replaceChildren();
  }, 6200);
}

// Zahlenschloss ein-/ausschalten — ein Schalter für Chart und Liste.
function setRadarOn(on) {
  layerState.numbers = on;
  syncLayerControls();
  buildLayerList();
  terminalPaintKey = '';
  storyPaintKey = '';
  paintTerminal();
  paintStoryChart();
  showToast(on ? `★ NUMBER RADAR ON · ${radarList().length} cult prints on the tape` : '★ NUMBER RADAR OFF', on ? 'radar' : '');
}

function setLoreOn(on) {
  taState.lore = on;
  terminalPaintKey = '';
  storyPaintKey = '';
  paintTerminal();
  paintStoryChart();
  showToast(on ? 'LORE LEVELS ON · $483 / $69 / $20' : 'LORE LEVELS OFF');
}

// TA-Desk: gleicher Knopf wie bisher, aber mit gerechneten Zahlen,
// Marken-Legende und Community-Quellen im Panel darunter.
function setTaDesk(on) {
  document.body.classList.toggle('ta-active', on);
  const toggle = document.querySelector('#ta-toggle');
  toggle?.setAttribute('aria-pressed', String(on));
  const label = toggle?.querySelector('b');
  if (label) label.textContent = on ? 'ON' : 'OFF';
  const panel = document.querySelector('#analysis-panel');
  if (panel) panel.setAttribute('aria-hidden', String(!on));
  if (on) renderTaDesk();
  terminalPaintKey = '';
  storyPaintKey = '';
  paintTerminal();
  paintStoryChart();
}

function setTweetLayer(on) {
  layerState.tweets = on;
  syncLayerControls();
  buildLayerList();
  terminalPaintKey = '';
  paintTerminal();
  showToast(on ? '𝕏 RC TWITTER LAYER ON' : '𝕏 RC TWITTER LAYER OFF');
}

function jumpToIso(iso, note = '') {
  const series = seriesFor(chartState.resolution);
  const barIndex = barIndexForDate(series, iso);
  followPageScrollUntil = Date.now() + 900;
  scrollMemeIntoView(barIndex);
  const nearest = storyEvents.reduce((best, event, index) => {
    const distance = Math.abs(eventIndices(chartState.resolution)[index] - barIndex);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Infinity });
  if (nearest.distance < 12) applyActive(nearest.index, { pop: true });
  showToast(note || `JUMP · ${formatDay(series[barIndex]?.date ?? iso)}`);
}

function runCode(entry) {
  showToast(`CODE ${entry.label} · ${entry.hint}`, 'code');
  switch (entry.action) {
    case 'jump':
      jumpToIso(entry.value);
      break;
    case 'radar':
      setRadarOn(!layerState.numbers);
      break;
    case 'lore':
      setLoreOn(!taState.lore);
      break;
    case 'ta':
      setTaDesk(!taActive());
      break;
    case 'tweets':
      setTweetLayer(!layerState.tweets);
      break;
    case 'meme': {
      const index = memeMoments.findIndex((moment) => moment.id === entry.value);
      if (index >= 0) {
        document.querySelector('#chart-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        followPageScrollUntil = Date.now() + 1200;
        openChartMeme(index);
      }
      break;
    }
    case 'moon':
      document.querySelector('#chart-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      launchRockets();
      break;
    case 'flows':
      setFlowsEnabled(document.body.classList.contains('flows-off'));
      break;
    case 'pane':
      setFlowPane(entry.value, !flowState.panes[entry.value]);
      break;
    case 'tendieman':
      openTendieman();
      break;
    case 'drs':
      jumpToIso(DRS_LATEST.iso);
      setFlowPane('drs', true);
      break;
    default:
      break;
  }
}

const codeState = { buffer: '', timer: null };

function codesPanelOpen() {
  const panel = document.querySelector('#codes-panel');
  return Boolean(panel && !panel.hidden);
}

function setCodesPanel(open) {
  const panel = document.querySelector('#codes-panel');
  if (!panel) return;
  panel.hidden = !open;
  document.querySelector('#codes-toggle')?.setAttribute('aria-expanded', String(open));
}

function renderCodesPanel() {
  const list = document.querySelector('#codes-list');
  if (!list) return;
  list.innerHTML = CODES.map((entry) => `
    <li class="code-row">
      <kbd>${escapeHtml(entry.label)}</kbd>
      <span>${escapeHtml(entry.hint)}</span>
    </li>
  `).join('');
}

// Die Quellen-Liste des TA-Desks steht an einer Stelle im JS — Text und Link
// bleiben so zusammen und werden nicht im HTML dupliziert.
function renderCommunityReads() {
  const box = document.querySelector('#ta-reads');
  if (!box) return;
  box.innerHTML = COMMUNITY_READS.map((read) => `
    <a class="ta-read" href="${read.url}" target="_blank" rel="noreferrer">
      <span class="ta-read-kind">${escapeHtml(read.kind)}</span>
      <strong>${escapeHtml(read.name)}</strong>
      <span class="ta-read-who">${escapeHtml(read.who)}</span>
      <span class="ta-read-note">${escapeHtml(read.note)}</span>
      ${read.extra ? `<span class="ta-read-extra">${escapeHtml(read.extra.label)}</span>` : ''}
    </a>
  `).join('');
}

function bindCodes() {
  renderCodesPanel();
  renderCommunityReads();
  document.querySelector('#codes-toggle')?.addEventListener('click', () => setCodesPanel(!codesPanelOpen()));
  document.querySelector('#codes-close')?.addEventListener('click', () => setCodesPanel(false));
  document.querySelector('#hero-codes-button')?.addEventListener('click', () => {
    document.querySelector('#chart-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCodesPanel(true);
  });
  document.querySelectorAll('[data-open-ta]').forEach((link) => {
    link.addEventListener('click', () => {
      setTaDesk(true);
      window.setTimeout(() => setLayersCollapsed(true), 40);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && (target.matches?.('input, textarea, select') || target.isContentEditable)) return;
    if (event.key === '?') {
      event.preventDefault();
      setCodesPanel(!codesPanelOpen());
      return;
    }
    if (event.key === 'Escape' && codesPanelOpen()) {
      setCodesPanel(false);
      return;
    }
    if (event.repeat) return;
    const key = String(event.key || '').toLowerCase();
    if (!/^[a-z0-9]$/.test(key)) return;
    codeState.buffer = `${codeState.buffer}${key}`.slice(-14);
    window.clearTimeout(codeState.timer);
    codeState.timer = window.setTimeout(() => { codeState.buffer = ''; }, 1500);
    // Exakte Übereinstimmung: „delta“ darf nicht den TA-Desk öffnen.
    const match = CODES.find((entry) => codeState.buffer === entry.code);
    if (match) {
      codeState.buffer = '';
      runCode(match);
    }
  });
}

// Kennzahlen + Quellen für den TA-Desk. Alles kommt aus tapeAnalytics().
function renderTaDesk() {
  const indicators = document.querySelector('#ta-indicators');
  const ruler = document.querySelector('#ta-rule-line');
  const hypeBox = document.querySelector('#ta-hype');
  if (!indicators) return;
  const analytics = tapeAnalytics();
  const hype = hypeIndex();
  const last = analytics.last;
  const change = relativeChange(analytics.bars, analytics.bars.length - 1);
  const fromHigh = analytics.high52 ? (last.close / analytics.high52 - 1) * 100 : null;
  const fromTop = analytics.highs ? (last.close / analytics.highs.high - 1) * 100 : null;
  const vs50 = Number.isFinite(analytics.lastSma50) ? (last.close / analytics.lastSma50 - 1) * 100 : null;
  const vs200 = Number.isFinite(analytics.lastSma200) ? (last.close / analytics.lastSma200 - 1) * 100 : null;
  const row = (label, value, tone = '') => `
    <div class="ta-stat">
      <span class="ta-stat-label">${label}</span>
      <b class="ta-stat-value${tone ? ` is-${tone}` : ''}">${value}</b>
    </div>`;
  indicators.innerHTML = [
    row('LAST CLOSE', `${formatPrice(last.close)} <small>${formatPercent(change)}</small>`),
    row('SMA 50 / DISTANCE', `${formatAxisPrice(analytics.lastSma50)} <small>${formatPercent(vs50)}</small>`),
    row('SMA 200 / DISTANCE', `${formatAxisPrice(analytics.lastSma200)} <small>${formatPercent(vs200)}</small>`),
    row('RSI (14, daily)', analytics.rsi14 === null ? '—' : analytics.rsi14.toFixed(1)),
    row('52W HIGH / LOW', `${formatAxisPrice(analytics.high52)} / ${formatAxisPrice(analytics.low52)} <small>${formatPercent(fromHigh)}</small>`),
    row('REALIZED VOL (20D)', `${(analytics.realizedVol20 ?? 0).toFixed(0)}% ann.`),
    row('VOLUME 5D VS 60D', `${(analytics.volumeRatio ?? 1).toFixed(2)}×`),
    row('VS JAN-2021 PRINT', `<small>${formatPercent(fromTop)} from ${formatPrice(analytics.highs.high)}</small>`)
  ].join('');

  if (ruler) {
    ruler.textContent = `${radarList().length} cult-number prints on the tape (as traded) · ${taState.lore ? 'lore levels on' : 'lore levels off'}`;
  }
  if (hypeBox) {
    hypeBox.innerHTML = `
      <div class="hype-head"><span>HYPE INDEX</span><b>${hype.score.toFixed(1)} / 10 · ${hype.label}</b></div>
      <div class="hype-bar"><span style="width:${(hype.score * 10).toFixed(0)}%"></span></div>
      <ul class="hype-parts">${hype.parts.map((part) => `<li><span>${part.name}</span><b>${part.readout}</b></li>`).join('')}</ul>
      <p class="hype-note">Mood ring, not a forecast: realised volatility percentile, volume vs. its 60-day average, share of the last 20 sessions that moved ≥4%, and how close the close sits to the 52-week high.</p>`;
  }
  updateHypeChip();
}

function updateHypeChip() {
  const chip = document.querySelector('#hype-chip');
  if (!chip) return;
  const hype = hypeIndex();
  chip.textContent = `HYPE ${hype.score.toFixed(1)} · ${hype.label}`;
  chip.dataset.level = hype.label.toLowerCase();
}

/* ------------------------------------------------------------- support --- */

function initSupport() {
  const configured = typeof SUPPORT.url === 'string' && /^https:\/\//.test(SUPPORT.url);
  document.querySelectorAll('[data-support-link]').forEach((link) => {
    if (configured) {
      link.href = SUPPORT.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.removeAttribute('aria-disabled');
    } else {
      link.href = '#support';
      link.removeAttribute('target');
    }
    const label = link.querySelector('[data-support-label]');
    if (label) label.textContent = configured ? `Support on ${SUPPORT.provider}` : 'Set up support';
  });
  const note = document.querySelector('#support-setup-note');
  if (note) {
    note.textContent = configured
      ? `Live: this button links to ${SUPPORT.url} (${SUPPORT.provider}). To change it, edit SUPPORT.url in app.js.`
      : 'Not configured yet: set SUPPORT.url in app.js to your public Ko-fi or Patreon page to activate support links.';
  }
}

/* ------------------------------------------------------- story overview --- */

function paintStoryChart({ force = false } = {}) {
  const svg = document.querySelector('#story-chart');
  if (!svg) return;
  const wrapper = svg.closest('.sticky-chart-canvas') ?? svg.parentElement;
  const width = Math.max(320, wrapper?.clientWidth || 640);
  const height = Math.max(230, wrapper?.clientHeight || 300);
  const storyKey = [
    chartState.resolution,
    chartState.activeIndex,
    width,
    height,
    taActive() ? `ta-${taState.lore ? 'lore' : 'plain'}` : '-',
    `numbers-${layerState.numbers}`,
    priceMode.mode
  ].join('|');
  if (!force && storyKey === storyPaintKey) return;
  storyPaintKey = storyKey;
  const bars = seriesFor(chartState.resolution);
  const ppb = Math.max(0.2, (width - 18) / Math.max(1, bars.length));

  const events = storyEvents.map((event, index) => ({
    ...event,
    index,
    barIndex: eventIndices(chartState.resolution)[index]
  }));

  drawSeries(svg, {
    bars,
    from: 0,
    to: bars.length - 1,
    ppb,
    height,
    priceTop: 14,
    priceBottom: height - 46,
    volumeTop: height - 42,
    volumeBottom: height - 26,
    domainFrom: 0,
    domainTo: bars.length - 1,
    events,
    activeIndex: chartState.activeIndex,
    splits: marketMeta.splits.map((split) => ({ date: split.date, ratio: split.ratio ?? 4 })),
    ta: taActive() ? taModel() : null,
    numbers: layerState.numbers
      ? radarList().map((hit, index) => ({ ...hit, index, barIndex: layerIndices('number', chartState.resolution)[index] }))
      : [],
    axisInCanvas: true,
    interactive: true,
    gradientId: 'chart-area-gradient-story',
    priceMode: priceMode.mode
  });

  svg.classList.toggle('is-dense', ppb < 2.2);

  svg.querySelectorAll('.chart-point-hit, .chart-point, .chart-point-halo').forEach((target) => {
    const activate = () => {
      const index = Number(target.dataset.index);
      if (!Number.isNaN(index)) {
        applyActive(index);
        scrollCardIntoView(storyEvents[index].id);
      }
    };
    target.addEventListener('click', activate);
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        activate();
      }
    });
  });
}

/* ---------------------------------------------------------- interaction --- */

function bindChartTerminal() {
  const { viewport, range } = terminalElements();
  if (!viewport) return;

  let ticking = false;
  viewport.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    raf(() => {
      ticking = false;
      syncActiveFromScroll();
      paintTerminal();
      paintCallout();
    });
  }, { passive: true });

  viewport.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left);
      return;
    }
    const direction = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const next = viewport.scrollLeft + direction;
    if (next >= 0 && next <= viewport.scrollWidth - viewport.clientWidth) {
      event.preventDefault();
      viewport.scrollLeft = next;
    }
  }, { passive: false });

  const pointers = new Map();
  let dragStart = null;
  let pinchStart = null;
  let moved = 0;
  let capturedId = null;

  // WICHTIG: kein setPointerCapture schon bei pointerdown — in Chrome/Safari
  // würde der folgende Klick auf Marker (Memes, Earnings, Events) sonst auf
  // den Viewport umgeleitet und die Marker-Klicks würden nie auslösen. Die
  // Capture geschieht erst, sobald der Zeiger wirklich zieht.
  viewport.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragStart = { x: event.clientX, scroll: viewport.scrollLeft, pointerId: event.pointerId };
      moved = 0;
      viewport.dataset.dragDistance = '0';
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      pinchStart = {
        distance: Math.hypot(first.x - second.x, first.y - second.y) || 1,
        ppb: chartState.ppb,
        center: (Math.min(first.x, second.x) + Math.abs(first.x - second.x) / 2) - viewport.getBoundingClientRect().left
      };
      dragStart = null;
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2 && pinchStart) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y) || 1;
      zoomTo(pinchStart.ppb * (distance / pinchStart.distance), pinchStart.center);
      return;
    }

    if (!dragStart) return;
    const delta = event.clientX - dragStart.x;
    moved = Math.max(moved, Math.abs(delta));
    if (moved > 6) {
      // erst jetzt greift die Capture — reine Klicks bleiben unberührt
      viewport.classList.add('is-dragging');
      if (capturedId === null) {
        try {
          viewport.setPointerCapture(event.pointerId);
          capturedId = event.pointerId;
        } catch { /* Zeiger schon weg — egal */ }
      }
    }
    if (moved > 6) viewport.scrollLeft = dragStart.scroll - delta;
  });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (capturedId === event.pointerId) capturedId = null;
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      dragStart = null;
      viewport.classList.remove('is-dragging');
      viewport.dataset.dragDistance = String(moved);
    }
  };
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('pointerleave', (event) => {
    if (event.buttons === 0) endPointer(event);
  });

  // Marker-Aktivierung über Delegation: egal, ob der Klick sein Ziel noch
  // kennt (normale Klicks) oder umgeleitet wurde (nach Drag-Capture) —
  // wir finden den Marker unter dem Zeiger und öffnen seine Karte.
  const MARKER_SELECTOR = '.chart-point-hit, .chart-point, .chart-point-halo, .chart-meme-hit, .chart-corp-hit, .chart-tweet-hit, .chart-number-hit';

  const markerFromEvent = (event) => {
    const direct = event.target.closest?.(MARKER_SELECTOR);
    if (direct && viewport.contains(direct)) return direct;
    if (typeof document.elementFromPoint === 'function') {
      const below = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(MARKER_SELECTOR);
      if (below && viewport.contains(below)) return below;
    }
    return null;
  };

  const activateMarker = (marker) => {
    if (!marker) return false;
    if (marker.classList.contains('chart-meme-hit')) {
      const index = Number(marker.dataset.memeIndex);
      if (!Number.isNaN(index)) openChartMeme(index);
      return true;
    }
    if (marker.classList.contains('chart-corp-hit')) {
      const index = Number(marker.dataset.corpIndex);
      if (!Number.isNaN(index)) openLayerItem('corp', index);
      return true;
    }
    if (marker.classList.contains('chart-tweet-hit')) {
      const index = Number(marker.dataset.tweetIndex);
      if (!Number.isNaN(index)) openLayerItem('tweet', index);
      return true;
    }
    if (marker.classList.contains('chart-number-hit')) {
      const index = Number(marker.dataset.numberIndex);
      if (!Number.isNaN(index)) openLayerItem('number', index);
      return true;
    }
    const index = Number(marker.dataset.index);
    if (!Number.isNaN(index)) focusEvent(index);
    return true;
  };

  // suppress the click that follows a pan gesture
  viewport.addEventListener('click', (event) => {
    if (Number(viewport.dataset.dragDistance) > 6 && markerFromEvent(event)) {
      event.stopPropagation();
      event.preventDefault();
      viewport.dataset.dragDistance = '0';
    }
  }, true);

  viewport.addEventListener('dblclick', (event) => {
    const rect = viewport.getBoundingClientRect();
    const clickedBar = Math.round((viewport.scrollLeft + (event.clientX - rect.left)) / chartState.ppb - 0.5);
    const indices = eventIndices(chartState.resolution);
    let nearest = chartState.activeIndex;
    let bestDistance = Infinity;
    indices.forEach((barIndex, index) => {
      const distance = Math.abs(barIndex - clickedBar);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = index;
      }
    });
    focusEvent(nearest);
  });

  // Klick: zuerst Marker (Meme / Earnings / Tweet / Event) öffnen, sonst den
  // Kurs dieses Tages in den Inspector legen.
  viewport.addEventListener('click', (event) => {
    if (Number(viewport.dataset.dragDistance) > 6) {
      viewport.dataset.dragDistance = '0';
      return;
    }
    const marker = markerFromEvent(event);
    if (activateMarker(marker)) return;
    if (event.target.closest('.chart-meme-chip')) return;
    if (!terminalScale) return;
    const rect = viewport.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (localY < 0 || localY > rect.height) return;
    const bars = seriesFor(chartState.resolution);
    const barIndex = clamp(
      Math.round((viewport.scrollLeft + localX) / chartState.ppb - 0.5),
      0,
      bars.length - 1
    );
    const price = terminalScale.yToPrice(localY);
    setInspect(barIndex, price, localY);
  });

  document.querySelector('#inspect-close')?.addEventListener('click', clearInspect);

  // Esc schließt zuerst den Meme-Player, dann die Kurs-Anzeige
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (memePlayerState.index !== null) {
      closeChartMeme();
      return;
    }
    clearInspect();
  });

  viewport.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) {
      event.preventDefault();
      focusEvent(clamp(chartState.activeIndex + step, 0, storyEvents.length - 1));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.45);
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / 1.45);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusEvent(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusEvent(storyEvents.length - 1);
    }
  });

  document.querySelector('#zoom-in')?.addEventListener('click', () => zoomBy(1.6));
  document.querySelector('#zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.6));
  document.querySelector('#zoom-fit')?.addEventListener('click', fitHistory);

  range?.addEventListener('input', () => {
    focusEvent(Number(range.value));
  });

  document.querySelectorAll('.resolution-button').forEach((button) => {
    button.addEventListener('click', () => setResolution(button.dataset.resolution));
  });

  document.querySelectorAll('[data-terminal-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = Number(button.dataset.terminalStep);
      focusEvent(clamp(chartState.activeIndex + step, 0, storyEvents.length - 1));
    });
  });

  document.querySelectorAll('[data-terminal-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.terminalJump);
      if (!Number.isNaN(index)) focusEvent(index);
    });
  });

  document.querySelector('#callout-close')?.addEventListener('click', () => {
    chartState.calloutHidden = true;
    document.querySelector('#event-callout')?.classList.add('is-hidden');
  });

  document.querySelector('#event-callout')?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-callout-open]');
    if (trigger) {
      scrollCardIntoView(trigger.dataset.calloutOpen);
    }
  });

  // TA-Desk: derselbe Knopf, jetzt mit gerechneten Kennzahlen und Quellen.
  document.querySelector('#ta-toggle')?.addEventListener('click', () => setTaDesk(!taActive()));
  document.querySelector('#hype-chip')?.addEventListener('click', () => setTaDesk(!taActive()));

  // ANZEIGE-Schublade: alle sekundären Anzeige-Schalter sitzen hinter einem
  // Knopf, damit die Topbar ruhig bleibt.
  const controlsToggle = document.querySelector('#controls-toggle');
  const viewControls = document.querySelector('#view-controls');
  if (controlsToggle && viewControls) {
    controlsToggle.addEventListener('click', () => {
      const open = viewControls.hidden;
      viewControls.hidden = !open;
      controlsToggle.setAttribute('aria-expanded', String(open));
      controlsToggle.classList.toggle('is-open', open);
      const signal = controlsToggle.querySelector('.controls-toggle-signal');
      if (signal) signal.textContent = open ? '▴' : '▾';
      window.setTimeout(() => {
        terminalPaintKey = '';
        paintTerminal();
        paintCallout();
      }, 60);
    });
  }

  const modeToggle = document.querySelector('#chart-mode-toggle');
  modeToggle?.addEventListener('click', () => {
    const candles = document.body.classList.toggle('candles-active');
    chartState.mode = candles ? 'candles' : 'line';
    modeToggle.setAttribute('aria-pressed', String(candles));
    const signal = modeToggle.querySelector('.mode-signal');
    const word = modeToggle.querySelector('.mode-word');
    const hint = modeToggle.querySelector('b');
    signal?.classList.toggle('is-candles', candles);
    if (word) word.textContent = candles ? 'CANDLES' : 'LINE';
    if (hint) hint.textContent = candles ? '↔ LINE' : '↔ CANDLES';
    const modeLabel = document.querySelector('#chart-mode-label');
    if (modeLabel) modeLabel.textContent = candles ? 'CANDLE VIEW' : 'LINE VIEW';
  });

  document.querySelector('#price-mode-toggle')?.addEventListener('click', () => {
    setPriceMode(priceMode.mode === 'adjusted' ? 'asTraded' : 'adjusted');
  });

  document.querySelector('#meme-toggle')?.addEventListener('click', () => {
    setMemesEnabled(!memesEnabled());
  });

  document.querySelector('#chart-meme-close')?.addEventListener('click', closeChartMeme);
  document.querySelector('#chart-meme-play')?.addEventListener('click', () => {
    if (memePlayerState.index === null) return;
    setChartMemePlaying(!memePlayerState.playing);
  });

  document.querySelector('#media-toggle')?.addEventListener('click', () => {
    setMediaEnabled(!mediaEnabled);
  });

  const dockToggle = document.querySelector('#dock-toggle');
  if (dockToggle) {
    dockToggle.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('dock-collapsed');
      dockToggle.setAttribute('aria-expanded', String(!collapsed));
      const label = document.querySelector('#dock-toggle-label');
      if (label) label.textContent = collapsed ? 'SHOW DOCK' : 'HIDE DOCK';
      const signal = dockToggle.querySelector('.dock-toggle-signal');
      if (signal) signal.textContent = collapsed ? '▸' : '▾';
      window.setTimeout(() => {
        terminalPaintKey = '';
        paintTerminal();
        paintCallout();
      }, 240);
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      terminalPaintKey = '';
      storyPaintKey = '';
      paintTerminal();
      paintStoryChart();
      paintCallout();
    }, 90);
  });
}

function bindTimeline() {
  document.querySelectorAll('.chart-index-dot, [data-jump-index]').forEach((control) => {
    control.addEventListener('click', () => {
      const index = Number(control.dataset.index ?? control.dataset.jumpIndex);
      if (Number.isNaN(index)) return;
      applyActive(index);
      scrollCardIntoView(storyEvents[index].id);
      followPageScrollUntil = Date.now() + 1200;
      scrollToEvent(index, 'smooth');
    });
  });

  document.querySelectorAll('.js-event-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      const index = Number(card.dataset.index);
      applyActive(index);
      followPageScrollUntil = Date.now() + 1200;
      scrollToEvent(index, 'smooth');
    });
  });

  if (typeof IntersectionObserver !== 'function') return;
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => Math.abs(a.boundingClientRect.top - window.innerHeight * 0.44) - Math.abs(b.boundingClientRect.top - window.innerHeight * 0.44));
    if (!visible[0]) return;
    const index = Number(visible[0].target.dataset.index);
    if (index === chartState.activeIndex) return;
    followPageScrollUntil = Date.now() + 900;
    applyActive(index);
    scrollToEvent(index, 'auto');
  }, { rootMargin: '-35% 0px -48% 0px', threshold: [0, 0.12, 0.5, 1] });

  document.querySelectorAll('.js-event-card').forEach((card) => observer.observe(card));
}

/* ------------------------------------------------------- meme + sources --- */

// der Text-Player unten nutzt dieselben Momente wie der In-Chart-Player
const memeData = memeMoments.map((moment) => ({
  id: moment.id,
  iso: moment.iso,
  label: moment.label,
  quote: moment.frames[0].quote,
  caption: moment.frames[0].caption,
  media: moment.media ?? []
}));

let memeIndex = 0;
let memePlaying = false;
let memeStartedAt = 0;
let memeAnimationFrame = null;
const memeDuration = 4400;

function renderMemeMedia() {
  const box = document.querySelector('#meme-media');
  const gif = document.querySelector('#meme-gif');
  const video = document.querySelector('#meme-video');
  const playButton = document.querySelector('#meme-video-play');
  const broken = document.querySelector('#meme-media-broken');
  const brokenLink = document.querySelector('#meme-media-link');
  const sourceLink = document.querySelector('#meme-source-link');
  const kindLabel = document.querySelector('#meme-card-kind');
  if (!box) return;
  const item = memeData[memeIndex];
  const gifSource = mediaEnabled ? primaryMedia(item, 'gif') : null;
  const videoSource = mediaEnabled ? primaryMedia(item, 'video') : null;

  box.dataset.state = mediaEnabled && (gifSource || videoSource) ? 'loaded' : 'off';
  if (gif) {
    gif.hidden = true;
    gif.removeAttribute('src');
  }
  if (video) {
    video.hidden = true;
    video.removeAttribute('src');
    delete video.dataset.embed;
    if (videoSource) video.dataset.embed = videoSource.embed;
  }
  if (playButton) playButton.hidden = !videoSource;
  if (broken) broken.hidden = true;

  if (gifSource && gif) {
    gif.alt = `${item.label} — ${gifSource.title}`;
    gif.onerror = () => {
      gif.hidden = true;
      box.dataset.state = 'broken';
      mediaFallback(broken);
      if (brokenLink) brokenLink.href = gifSource.page;
    };
    gif.src = gifSource.src;
    gif.hidden = false;
  } else if (videoSource && video) {
    video.onerror = () => {
      video.hidden = true;
      box.dataset.state = 'broken';
      mediaFallback(broken);
      if (brokenLink) brokenLink.href = videoSource.page;
    };
  }
  if (brokenLink) brokenLink.href = (gifSource ?? videoSource)?.page ?? '#';
  if (sourceLink) {
    const target = gifSource ?? videoSource;
    sourceLink.href = target?.page ?? 'https://giphy.com/explore/gamestop';
    sourceLink.textContent = target?.credit ? `${target.credit} ↗` : 'open source post ↗';
  }
  if (kindLabel) {
    kindLabel.textContent = gifSource ? 'GIF / LIVE' : videoSource ? 'VIDEO / CLICK' : 'PLAY / TEXT';
  }
  renderMediaCredit(document.querySelector('#meme-credit'), [gifSource, videoSource].filter(Boolean), item.label);
}

function renderMeme(index, animate = true) {
  const card = document.querySelector('#meme-card');
  if (!card) return;
  const item = memeData[index];
  const update = () => {
    const label = document.querySelector('#meme-label');
    const quote = document.querySelector('#meme-quote');
    const caption = document.querySelector('#meme-caption');
    const counter = document.querySelector('#meme-counter');
    if (label) label.textContent = item.label;
    if (quote) quote.textContent = item.quote;
    if (caption) caption.textContent = item.caption;
    if (counter) counter.textContent = `${String(index + 1).padStart(2, '0')} — ${String(memeData.length).padStart(2, '0')}`;
    document.querySelectorAll('.meme-selector').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.memeIndex) === index));
    document.querySelectorAll('.wall-tile').forEach((tile) => tile.classList.toggle('is-active', Number(tile.dataset.memeIndex) === index));
    card.classList.remove('is-changing');
    renderMemeMedia();
  };

  if (animate) {
    card.classList.add('is-changing');
    window.setTimeout(update, 170);
  } else {
    update();
  }
}

function nextMeme() {
  memeIndex = (memeIndex + 1) % memeData.length;
  renderMeme(memeIndex);
  memeStartedAt = Date.now();
}

function tickMemeProgress() {
  const fill = document.querySelector('#meme-progress-fill');
  if (!fill) return;
  if (!memePlaying) {
    fill.style.width = '0%';
    memeAnimationFrame = null;
    return;
  }
  const elapsed = Date.now() - memeStartedAt;
  fill.style.width = `${Math.min(100, (elapsed / memeDuration) * 100)}%`;
  if (elapsed >= memeDuration) nextMeme();
  memeAnimationFrame = raf(tickMemeProgress);
}

function setMemePlaying(playing) {
  memePlaying = playing;
  const playButton = document.querySelector('#meme-play');
  const playLabel = document.querySelector('#meme-play-label');
  if (playButton) {
    playButton.classList.toggle('is-playing', playing);
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.setAttribute('aria-label', playing ? 'Pause meme tape' : 'Play meme tape');
  }
  if (playLabel) playLabel.textContent = playing ? 'PAUSE TAPE' : 'PLAY TAPE';
  if (playing) {
    memeStartedAt = Date.now();
    if (!memeAnimationFrame) memeAnimationFrame = raf(tickMemeProgress);
  } else if (memeAnimationFrame) {
    window.cancelAnimationFrame?.(memeAnimationFrame);
    memeAnimationFrame = null;
    const fill = document.querySelector('#meme-progress-fill');
    if (fill) fill.style.width = '0%';
  }
}

function bindMemePlayer() {
  document.querySelector('#meme-play')?.addEventListener('click', () => setMemePlaying(!memePlaying));

  // Auswahlknöpfe entsprechen den Meme-Markern im Chart
  const selectorRow = document.querySelector('.meme-selectors');
  if (selectorRow) {
    selectorRow.innerHTML = memeMoments.map((_, index) =>
      `<button class="meme-selector" type="button" data-meme-index="${index}" aria-label="Meme ${index + 1} Play in chart">${String(index + 1).padStart(2, '0')}</button>`
    ).join('');
  }

  const focusMeme = (index) => {
    memeIndex = index;
    renderMeme(memeIndex);
    if (memePlaying) memeStartedAt = Date.now();
    // direkt Play in chart: hingehen, verankern, loslassen
    const explorer = document.querySelector('#chart-explorer');
    if (explorer && typeof explorer.scrollIntoView === 'function') {
      explorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    followPageScrollUntil = Date.now() + 1200;
    openChartMeme(memeIndex);
  };

  document.querySelectorAll('.meme-selector').forEach((button) => {
    button.addEventListener('click', () => focusMeme(Number(button.dataset.memeIndex)));
  });

  buildMemeWall();
  buildClipRail();
  bindLazyVideo('.player-media', '#meme-video');
  bindLazyVideo('.dock-slot-meme .meme-media', '#chart-meme-video');
  renderMeme(0, false);
}

// Videos starten erst auf Klick: vorher steht nur das Posterbild, damit keine
// Player im Hintergrund mitlaufen, während man den Chart ansieht.
function bindLazyVideo(containerSelector, videoSelector) {
  const container = document.querySelector(containerSelector);
  const player = document.querySelector(videoSelector);
  const button = container?.querySelector('.meme-media-play');
  if (!container || !player || !button) return;
  button.addEventListener('click', () => {
    if (!player.dataset.embed) return;
    player.src = `${player.dataset.embed}?autoplay=1&rel=0`;
    player.hidden = false;
    button.hidden = true;
    container.dataset.state = 'video';
  });
}

// Die Wand zeigt jeden Moment als eigenes Kästchen mit echtem GIF und verlinkt
// auf den Original-Post — der Nachweis bleibt beim Bild.
function buildMemeWall() {
  const grid = document.querySelector('#wall-grid');
  if (!grid) return;
  grid.innerHTML = memeMoments.map((moment, index) => {
    const gifSource = moment.media.find((entry) => entry.kind === 'gif');
    const videoSource = moment.media.find((entry) => entry.kind === 'video');
    const media = gifSource ?? videoSource;
    const kind = gifSource ? 'GIF' : videoSource ? 'VIDEO' : 'TEXT';
    const date = formatShortDay(moment.iso);
    return `
      <article class="wall-tile${media ? '' : ' is-textual'}" data-meme-index="${index}">
        <button class="wall-tile-hit" type="button" aria-label="${moment.label} Open in chart — ${moment.frames[0].quote}">
          <span class="wall-tile-frame">
            ${media ? `<img class="wall-tile-image" data-src="${gifSource?.src ?? ''}" alt="${moment.label} — ${gifSource?.title ?? moment.frames[0].quote}" loading="lazy" decoding="async" />` : '<span class="wall-tile-text">NO MEDIA / TEXT CARD</span>'}
            <span class="wall-tile-kind">${kind}</span>
          </span>
          <span class="wall-tile-meta">
            <b>${String(index + 1).padStart(2, '0')}</b>
            <span class="wall-tile-label">${moment.label}</span>
            <span class="wall-tile-date">${date}</span>
          </span>
          <span class="wall-tile-quote">${moment.frames[0].quote}</span>
        </button>
        <a class="wall-tile-source" href="${media?.page ?? 'app.js'}" target="_blank" rel="noreferrer">${media?.credit ?? 'text card · no embed'} ↗</a>
        ${videoSource ? `<button class="wall-tile-video" type="button" data-embed="${videoSource.embed}" aria-label="Play video: ${videoSource.title}">▶ VIDEO</button>` : ''}
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.wall-tile-hit').forEach((button) => {
    button.addEventListener('click', () => {
      const explorer = document.querySelector('#chart-explorer');
      if (explorer && typeof explorer.scrollIntoView === 'function') {
        explorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      followPageScrollUntil = Date.now() + 1200;
      memeIndex = Number(button.closest('.wall-tile')?.dataset.memeIndex ?? 0);
      renderMeme(memeIndex);
      openChartMeme(memeIndex);
    });
  });

  grid.querySelectorAll('.wall-tile-video').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const tile = button.closest('.wall-tile');
      let frame = tile.querySelector('iframe');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.className = 'wall-tile-frame-video';
        frame.title = button.getAttribute('aria-label') ?? 'Meme-Video';
        frame.loading = 'lazy';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        tile.querySelector('.wall-tile-frame').append(frame);
      }
      if (!frame.src) frame.src = `${button.dataset.embed}?autoplay=1&rel=0`;
      button.hidden = true;
      tile.classList.add('is-playing');
    });
  });
}

// GIFs werden erst geladen, wenn die Wand in die Nähe des Viewports kommt.
function loadWallMedia() {
  const grid = document.querySelector('#wall-grid');
  if (!grid) return;
  grid.querySelectorAll('.wall-tile-image').forEach((image) => {
    const src = image.dataset.src;
    if (!src) {
      image.closest('.wall-tile-frame')?.classList.add('is-textual');
      return;
    }
    if (!mediaEnabled) {
      image.closest('.wall-tile-frame')?.classList.add('is-textual');
      return;
    }
    if (image.getAttribute('src')) return;
    image.src = src;
  });
}

function buildClipRail() {
  const grid = document.querySelector('#clip-grid');
  if (!grid) return;
  const clips = [];
  memeMoments.forEach((moment) => {
    (moment.media ?? []).forEach((entry) => {
      if (entry.kind !== 'video' || clips.some((clip) => clip.embed === entry.embed)) return;
      clips.push({ ...entry, label: moment.label, iso: moment.iso });
    });
  });
  grid.innerHTML = clips.map((clip, index) => `
    <article class="clip-card" data-embed-index="${index}">
      <button class="clip-hit" type="button" aria-label="Play video: ${clip.title} — ${clip.credit}">
        <img class="clip-poster" data-src="${clip.poster}" alt="${clip.title}" loading="lazy" decoding="async" />
        <span class="clip-play" aria-hidden="true">▶</span>
        <span class="clip-meta">
          <b>${formatShortDay(clip.iso)} · ${clip.label}</b>
          <span>${clip.title}</span>
        </span>
      </button>
      <div class="clip-foot">
        <span>${clip.credit}</span>
        <a href="${clip.page}" target="_blank" rel="noreferrer">Original ↗</a>
        ${clip.archive ? `<a href="${clip.archive}" target="_blank" rel="noreferrer">Archive / context ↗</a>` : ''}
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('.clip-hit').forEach((button) => {
    button.addEventListener('click', () => {
      const clip = clips[Number(button.closest('.clip-card')?.dataset.embedIndex ?? 0)];
      if (!clip || !mediaEnabled) return;
      let frame = button.parentElement.querySelector('iframe');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.className = 'clip-video';
        frame.title = clip.title;
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        button.parentElement.append(frame);
      }
      if (!frame.src) frame.src = `${clip.embed}?autoplay=1&rel=0`;
      button.hidden = true;
      button.closest('.clip-card')?.classList.add('is-playing');
    });
  });

  grid.querySelectorAll('.clip-poster').forEach((image) => {
    image.addEventListener('error', () => image.closest('.clip-card')?.classList.add('is-textual'));
  });
}

function bindSourceFilters() {
  document.querySelectorAll('.source-filter').forEach((filter) => {
    filter.addEventListener('click', () => {
      const value = filter.dataset.filter;
      document.querySelectorAll('.source-filter').forEach((button) => button.classList.toggle('is-active', button === filter));
      document.querySelectorAll('.source-card').forEach((card) => {
        card.classList.toggle('is-hidden', value !== 'all' && card.dataset.sourceType !== value);
      });
    });
  });
}

function bindMobileNav() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.mobile-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('is-open');
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav.setAttribute('aria-hidden', String(!open));
  });

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle.classList.remove('is-open');
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    nav.setAttribute('aria-hidden', 'true');
  }));
}

function bindScrollProgress() {
  const fill = document.querySelector('#scroll-progress-fill');
  if (!fill) return;
  let ticking = false;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? clamp(window.scrollY / scrollable, 0, 1) : 0;
    fill.style.width = `${progress * 100}%`;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      raf(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}

/* ----------------------------------------------------------- provenance --- */

function stampProvenance() {
  const note = document.querySelector('#chart-data-note');
  if (note) {
    const origin = usingFallback ? 'FALLBACK TAPE' : 'YAHOO EOD';
    const modeLabel = priceMode.available
      ? (priceMode.mode === 'adjusted' ? 'SPLIT-ADJUSTED' : 'AS TRADED')
      : 'AS TRADED';
    note.textContent = `${origin} · ${modeLabel} · LAST BAR ${formatShortDay(marketMeta.end).toUpperCase()}`;
    note.title = usingFallback
      ? 'market-data.js is missing — the chart uses a fallback line from documented closing prices.'
      : `${asTradedBars.length} actual daily bars since ${formatDay(asTradedBars[0].date)}, last updated ${marketMeta.updated}. ` +
        (priceMode.available
          ? (priceMode.mode === 'adjusted'
            ? 'Split-adjusted: prices before the July 22, 2022 4:1 split are divided by four.'
            : 'As traded: prices are shown as originally quoted.')
          : 'As traded: no split information available.');
  }
  const latestEvent = storyEvents[storyEvents.length - 1];
  const card = document.getElementById(latestEvent.id);
  if (card) {
    const time = card.querySelector('time');
    if (time) {
      time.textContent = formatMonth(marketMeta.end).toUpperCase();
      time.setAttribute('datetime', marketMeta.end);
    }
  }
  const heroNumbers = document.querySelectorAll('.hero-numbers strong');
  if (heroNumbers[0]) {
    const years = (Date.parse(`${marketMeta.end}T00:00:00Z`) - Date.parse('2019-12-02T00:00:00Z')) / (365.25 * 86400000);
    heroNumbers[0].textContent = String(Math.round(years)).padStart(2, '0');
  }
  // Anker-Momente und Hype-Index sind gerechnet, nicht getippt.
  if (heroNumbers[1]) heroNumbers[1].textContent = String(storyEvents.length).padStart(2, '0');
  if (heroNumbers[2]) {
    const hype = hypeIndex();
    heroNumbers[2].textContent = hype.score.toFixed(1);
    heroNumbers[2].title = `Hype index: ${hype.label} — ${hype.parts.map((part) => `${part.name} ${part.readout}`).join(' · ')}`;
  }
}

/* ------------------------------------------------------------- boot up --- */

// Tendieman-Vollbild: ESC schließt, Leertaste pausiert, Klick auf eine Zeile springt.
function bindTendieman() {
  document.querySelector('#tendieman-close')?.addEventListener('click', () => closeTendieman());
  document.querySelector('#tendieman-play')?.addEventListener('click', () => toggleTendiemanPause());
  document.querySelector('#tendieman')?.addEventListener('click', (event) => {
    if (event.target.id === 'tendieman') closeTendieman();
  });
  document.addEventListener('keydown', (event) => {
    if (!lyricState.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTendieman();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      toggleTendiemanPause();
    }
  });
  document.querySelectorAll('[data-open-tendieman]').forEach((button) => {
    button.addEventListener('click', () => openTendieman());
  });
}

function initialise() {
  stampProvenance();
  updatePriceModeUI();
  if (!priceMode.available) {
    document.querySelector('#price-mode-toggle')?.setAttribute('disabled', '');
    document.querySelector('#price-mode-toggle')?.setAttribute('title', 'No split data available — prices remain as traded');
  }
  applyActive(storyEvents.length - 1);
  paintTerminal();
  paintStoryChart();
  bindChartTerminal();
  bindChartLayers();
  bindCodes();
  bindFlowsInteraction();
  bindTendieman();
  renderTendieman();
  renderFlowsStats();
  paintFlows({ force: true });
  updateHypeChip();
  initSupport();
  bindTimeline();
  bindMobileNav();
  bindMemePlayer();
  bindSourceFilters();
  bindScrollProgress();

  // Wand und Clip-Rail laden ihre Medien erst, wenn sie sichtbar werden.
  const lazyTargets = [document.querySelector('#meme-wall'), document.querySelector('#clip-rail')].filter(Boolean);
  if (typeof IntersectionObserver === 'function' && lazyTargets.length) {
    const mediaObserver = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        loadWallMedia();
        loadClipPosters();
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '320px 0px' });
    lazyTargets.forEach((target) => mediaObserver.observe(target));
  } else {
    loadWallMedia();
    loadClipPosters();
  }

  const { viewport } = terminalElements();
  raf(() => {
    // Startansicht: rechte Kante = neuester Punkt, aber stark hereingezoomt —
    // höchstens ca. ein Monat Tape im Bild. FIT öffnet später die Historie.
    applyDefaultZoom();
    applyActive(storyEvents.length - 1);
    scrollToEvent(storyEvents.length - 1);
    paintTerminal();
    paintStoryChart({ force: true });
    paintCallout();
    // Layer-Panel startet eingeklappt — der Chart bekommt die volle Höhe,
    // Klicks auf Marker oder CHART LAYERS öffnen es wieder.
    setLayersCollapsed(true);
  });
}

document.addEventListener('DOMContentLoaded', initialise);
