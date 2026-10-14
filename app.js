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
    { kind: 'DOC', title: 'Warrants + filings', source: 'SEC EDGAR / current trail', url: 'https://investor.gamestop.com/financial-information/sec-filings', mark: '8-K' },
    { kind: 'DOC', title: 'Earnings / long tail', source: 'GameStop quarterly results', url: 'https://investor.gamestop.com/financial-information/quarterly-results', mark: '10-K' },
    { kind: 'VIDEO', title: 'Keep the archive open', source: 'YouTube / source search', url: 'https://www.youtube.com/results?search_query=GameStop+latest+earnings+filings', mark: '▶' }
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
  { id: 'event-tail', date: 'OCT 2026', iso: null, title: 'Warrants, filings, the long tail', label: 'FILINGS / LONG TAIL', tag: 'archive still updating' }
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
];

/* ------------------------------------------- corporate events + RC tweets - */

// Einklappbarer Chart-Layer: Unternehmens-Ereignisse (Earnings, Aktien-
// Offerings/ATM, Split, Führung) als Rauten direkt auf der Kurslinie.
// Kuratierte Auswahl, keine vollständige Filing-Liste — jede Karte verlinkt
// auf die Primärquelle (GameStop IR / SEC EDGAR).
const corporateEvents = [
  { iso: '2020-12-09', type: 'earnings', title: 'Q3 2020 Earnings', detail: 'Quartalszahlen mitten im Umbau: Ab hier wird die RC-These an echten Zahlen gemessen — Umsatz, Marge, E-Commerce.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2021-03-23', type: 'earnings', title: 'Q4 2020 Earnings', detail: 'Die ersten Zahlen nach dem Squeeze-Januar. Der Kurs fällt nachbörslich — die Story wird vom Meme zurück zum Geschäftsbericht.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2021-04-26', type: 'offering', title: 'ATM-Offering abgeschlossen', detail: 'GameStop schließt sein At-the-Market-Programm: neue Aktien wurden direkt in die Stärke des Kurses hinein verkauft — Kapital statt Schulden.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / CIK 1326380' },
  { iso: '2021-06-09', type: 'earnings', title: 'Q1 2021 Earnings + HV', detail: 'Quartalszahlen und Hauptversammlung am selben Tag: Ryan Cohen wird Chairman — und ein weiteres Aktienprogramm wird angekündigt.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2021-06-22', type: 'offering', title: 'ATM abgeschlossen: 5 Mio. Aktien', detail: 'Das zweite große At-the-Market-Programm ist durch. Die Community liest jede Zeile: Verwässerung gegen eine prall gefüllte Kriegskasse.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / CIK 1326380' },
  { iso: '2022-03-17', type: 'earnings', title: 'Q4 2021 Earnings', detail: 'Verlust höher als erwartet, der Kurs sackt ab — am selben Tag macht eine AMC-Beteiligung im Filing die Runde (siehe Meme M16).', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2022-03-31', type: 'other', title: 'Split-Dividende angekündigt', detail: 'Der Vorstand kündigt einen Aktiensplit in Form einer Stock-Dividende an — beantragt wird die Genehmigung bei der Hauptversammlung.', url: 'https://investor.gamestop.com/', source: 'GameStop IR' },
  { iso: '2022-07-22', type: 'other', title: '4:1-Split wirksam', detail: 'Aus einer Aktie werden vier. Im Chart oben schaltet der Knopf SPLIT-ADJ ↔ AS TRADED zwischen beiden Sichtweisen um.', url: 'https://investor.gamestop.com/', source: 'GameStop IR' },
  { iso: '2023-03-21', type: 'earnings', title: 'Q4 2022: erster Gewinn seit 2 Jahren', detail: 'GameStop meldet $48.2M Nettogewinn (Q4, Vorjahr: −$147.5M) — Kostendisziplin statt Meme. Der Kurs springt am Folgetag (Meme „First Profit“).', url: 'https://investor.gamestop.com/news-releases/news-details/2023/GameStop-Reports-Fourth-Quarter-and-Fiscal-Year-2022-Results-03-21-2023/default.aspx', source: 'GameStop IR / News release 21.03.2023' },
  { iso: '2023-09-28', type: 'other', title: 'Ryan Cohen wird CEO', detail: 'Der Chairman übernimmt auch den CEO-Posten — ohne Gehalt, ohne Boni, bezahlt nur über den Aktienkurs. „Extremely intense“ inklusive.', url: 'https://investor.gamestop.com/', source: 'GameStop IR' },
  { iso: '2024-03-26', type: 'earnings', title: 'Q4 2023 Earnings', detail: 'Volljahr 2023 wieder profitabel, $1.199B Cash & Wertpapiere zum Stichtag — die Bilanz ist bereit für die volatile Phase ab Mai.', url: 'https://investor.gamestop.com/news-releases/news-details/2024/GameStop-Reports-Fourth-Quarter-and-Fiscal-Year-2023-Results-03-26-2024/default.aspx', source: 'GameStop IR / News release 26.03.2024' },
  { iso: '2024-05-24', type: 'offering', title: 'ATM abgeschlossen: $933.4M', detail: '45 Mio. neue Aktien, mitten in der Roaring-Kitty-Rückkehr verkauft. Bruttoerlös: rund $933.4M für „general corporate purposes“.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / GameStop IR, 24.05.2024' },
  { iso: '2024-06-07', type: 'earnings', title: 'Q1 2024 Earnings + neues ATM', detail: 'Quartalszahlen vorbörslich — plus Filing für bis zu 75 Mio. weitere Aktien. Am selben Tag: Roaring Kittys Livestream (Meme M22).', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2024-06-11', type: 'offering', title: 'ATM abgeschlossen: $2.137B', detail: 'Alle 75 Mio. Aktien verkauft, Bruttoerlös ca. $2.137 Milliarden. Die Kriegskasse wächst schneller als jede Story im Feed.', url: 'https://gamestop.gcs-web.com/news-releases/news-release-details/gamestop-completes-market-equity-offering-program-2', source: 'GameStop IR / News release 11.06.2024' },
  { iso: '2024-09-10', type: 'earnings', title: 'Q2 2024 Earnings', detail: 'Unerwarteter Quartalsgewinn — und gleichzeitig ein neues ATM-Programm über 20 Mio. Aktien. Der Kurs mag die Verwässerung weniger als die Zahlen.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2024-12-10', type: 'earnings', title: 'Q3 2024 Earnings', detail: 'Wieder Gewinn im Quartal, Cash-Berg wächst weiter. Die Frage im Feed verschiebt sich: Was macht GameStop mit dem Geld?', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2025-03-25', type: 'earnings', title: 'Q4 2024 Earnings', detail: 'Jahreszahlen mit deutlich besserem Ergebnis je Aktie als erwartet — direkt danach folgt die Krypto-Treasury-Debatte.', url: 'https://investor.gamestop.com/financial-information/quarterly-results', source: 'GameStop IR / Quarterly results' },
  { iso: '2025-03-27', type: 'offering', title: 'Wandelanleihen für BTC-Treasury', detail: 'GameStop kündigt Convertible Notes an, deren Erlös u. a. für Bitcoin-Käufe vorgesehen ist — das Offering wird zum Strategiestatement.', url: 'https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude', source: 'SEC EDGAR / CIK 1326380' }
];

const CORP_TYPE = {
  earnings: { label: 'EARNINGS', glyph: 'E', word: 'Quartalszahlen' },
  offering: { label: 'OFFERING', glyph: '$', word: 'Share offering / ATM' },
  other: { label: 'CORPORATE', glyph: '!', word: 'Corporate event' }
};

// RC-Tweets als native Karten im Chart: X-Einbettungen sind ohne Login oft
// blockiert, deshalb steht der Wortlaut hier als Text — mit Link aufs
// Original (@ryancohen) und auf eine dokumentierte Timeline als Beleg.
const rcTweets = [
  { iso: '2021-01-06', text: '💩', note: 'Foto einer Blockbuster-Filiale dazu — die Antwort auf Jim Cramer Vergleich „GameStop wird das neue Blockbuster“.', url: 'https://www.reddit.com/r/Superstonk/comments/p7mvxf/a_timeline_of_ryan_cohens_tweets_and_gme/', source: 'Superstonk / RC-Tweet-Timeline' },
  { iso: '2021-02-24', text: '🐸', note: 'Foto eines McDonald’s-Softeis dazu. GME verdoppelt sich noch am selben Tag auf $91.71 Close — der berühmteste Ein-Emoji-Tweet der Saga.', url: 'https://kotaku.com/gamestop-stock-explodes-again-following-board-members-m-1846348996', source: 'Kotaku, 24.02.2021' },
  { iso: '2021-03-05', text: '📸 Pets.com-Puppe (Screenshot)', note: 'Screenshot mit der Pets.com-Werbefigur, dem Dotcom-Symbol schlechthin. Reuters datiert den nachmittäglichen Kursanstieg auf diesen Tweet.', url: 'https://www.reuters.com/business/retail-consumer/gamestop-spikes-investors-eye-cryptic-tweet-by-shareholder-2021-03-05/', source: 'Reuters, 05.03.2021' },
  { iso: '2021-04-16', text: '🤜🤛', note: 'Fist-Bump-Emoji — gepostet, während Roaring Kitty seine Position weiter aufstockt. Der Feed liest es als: Wir sitzen im selben Boot.', url: 'https://www.gmedd.com/tw/', source: 'GMEDD / Twitter Chatter' },
  { iso: '2021-07-04', text: 'Power to the Players 🇺🇸', note: 'Zum Independence Day: der GameStop-Slogan als Gruß — halb Firmenmotto, halb Schlachtruf der Community.', url: 'https://www.gmedd.com/tw/', source: 'GMEDD / Twitter Chatter' },
  { iso: '2021-07-19', text: 'PG-13', note: 'Foto mit zwei Essstäbchen in der Nase. Superstonk deutet „PG-13“ als Seite 13 des Prospekts (Warrants/Units) — Beleg dafür, wie der Feed jeden Post seziert.', url: 'https://www.reddit.com/r/Superstonk/comments/p7mvxf/a_timeline_of_ryan_cohens_tweets_and_gme/', source: 'Superstonk / RC-Tweet-Timeline' },
  { iso: '2021-09-26', text: 'Talk is cheap, it takes money to buy whiskey.', note: 'Ein Satz von 1891 als Führungscredo: weniger reden, mehr liefern. GMEDD widmet dem Tweet eine eigene Einordnung.', url: 'https://www.gmedd.com/tw/', source: 'GMEDD / Twitter Chatter' },
  { iso: '2021-10-31', text: 'MGGA', note: '„Make GameStop Great Again“ — vier Buchstaben, der Feed explodiert pünktlich zu Halloween.', url: 'https://markets.businessinsider.com/news/stocks/gamestop-stock-ryan-cohen-twitter-tesla-elon-musk-retail-traders-2021-11', source: 'Business Insider, Nov. 2021' },
  { iso: '2021-11-08', text: 'Deciding between two options for my GME shares: HOLD or HODL…', note: 'Verkaufen ist keine Option — der Chairman parodiert Elon Musk Verkaufs-Poll und bekennt sich öffentlich zum Halten.', url: 'https://markets.businessinsider.com/news/stocks/gamestop-stock-ryan-cohen-twitter-tesla-elon-musk-retail-traders-2021-11', source: 'Business Insider, Nov. 2021' }
];

const RC_X_URL = 'https://x.com/ryancohen';

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
    const items = kind === 'corp' ? corporateEvents : rcTweets;
    layerIndexCache.set(key, items.map((item) => barIndexForDate(series, item.iso)));
  }
  return layerIndexCache.get(key);
}

// Zustand des einklappbaren Chart-Layers (Events + RC-Tweets)
const layerState = {
  corp: true,
  tweets: true,
  corpFilter: 'all', // all | earnings | offering | other
  active: null // { kind: 'corp' | 'tweet', index }
};

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

const CHART_LIMITS = {
  day: { min: 0.45, max: 72, base: 3.4 },
  week: { min: 1.6, max: 82, base: 7.6 },
  month: { min: 3.2, max: 96, base: 17 }
};

const PLOT = { top: 26, bottom: 46, volume: 54, gap: 12 };
const OVERSCAN = 60;
const PLAYHEAD_RATIO = 0.88;

const chartState = {
  resolution: 'day',
  ppb: CHART_LIMITS.day.base,
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
    priceMode: mode = 'asTraded', inspect = null, memes = null, corp = null, tweets = null, activeLayer = null
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

  if (ta && events.length >= 8) {
    const overlay = svgElement('g', { class: 'technical-overlay', 'aria-hidden': 'true' });
    const at = (index, price) => ({ x: x(index), y: y(price) });
    const barIndex = events.map((event) => event.barIndex);
    const lastBar = barIndex[barIndex.length - 1];
    const minVisible = Math.exp(minLog);
    const maxVisible = Math.exp(maxLog);

    // TA-Level sind in "as traded"-Kursen notiert — im bereinigten Modus werden
    // Vorkurs-Split-Marken durch den Split-Faktor ihres Anker-Datums geteilt.
    const taAdj = (price, anchorIndex) => {
      if (mode !== 'adjusted') return price;
      const anchor = bars[anchorIndex];
      if (!anchor) return price;
      return price / splitFactorBefore(anchor.date);
    };

    const line = (kind, from_, to_) => svgElement('line', {
      class: kind, x1: from_.x, y1: from_.y, x2: to_.x, y2: to_.y
    });

    // levels only make sense while they are actually on screen
    const drawLevel = (kind, price, x1, x2, text, tone, anchorIndex = barIndex[4]) => {
      if (price < minVisible * 1.02 || price > maxVisible * 0.985) return;
      const anchor = at(anchorIndex, price);
      const labelY = price > maxVisible * 0.9 ? anchor.y + 18 : anchor.y - 8;
      placeLabel(text, clamp(anchor.x + 10, 6, width - 6), labelY, tone);
      overlay.append(line(kind, { x: x1, y: anchor.y }, { x: x2, y: anchor.y }));
    };

    const placeLabel = (text, x, labelY, tone = '') => {
      const boxes = labelBoxes.concat(labelPlacements);
      const width_ = text.length * 7.2;
      const collides = boxes.some((box) => {
        const boxWidth = box.width ?? 0;
        return Math.abs(box.y - labelY) < 14 && Math.abs(box.x - x) < (boxWidth + width_) / 2 + 12;
      });
      if (collides || labelY < priceTop + 14 || labelY > priceBottom - 4) return;
      labelPlacements.push({ x, y: labelY, width: width_ });
      overlay.append(svgElement('text', { class: `ta-label${tone ? ` ${tone}` : ''}`, x, y: labelY }, text));
    };

    const labelPlacements = [];
    const triangleTop = { from: at(barIndex[1], taAdj(27, barIndex[1])), to: at(barIndex[3], taAdj(150, barIndex[3])) };
    const triangleBase = { from: at(barIndex[1], taAdj(11, barIndex[1])), to: at(barIndex[3], taAdj(62, barIndex[3])) };
    if (triangleTop.from.y > priceTop && triangleBase.to.y < priceBottom) {
      overlay.append(
        line('ta-channel', triangleTop.from, triangleTop.to),
        line('ta-channel support', triangleBase.from, triangleBase.to),
        (() => {
          placeLabel('TRIANGLE / COMMUNITY', triangleTop.from.x + 10, triangleTop.from.y - 8);
          return svgElement('g');
        })()
      );
    }

    const wedgeTop = { from: at(barIndex[4], taAdj(150, barIndex[4])), to: at(barIndex[6], taAdj(330, barIndex[6])) };
    const wedgeBase = { from: at(barIndex[4], taAdj(40, barIndex[4])), to: at(barIndex[6], taAdj(180, barIndex[6])) };
    if (wedgeBase.from.y < priceBottom && wedgeTop.to.y > priceTop) {
      overlay.append(
        line('ta-channel', wedgeTop.from, wedgeTop.to),
        line('ta-channel support', wedgeBase.from, wedgeBase.to),
        (() => {
          placeLabel('WEDGE / RE-TEST', wedgeBase.from.x + 12, wedgeBase.from.y + 16);
          return svgElement('g');
        })()
      );
    }

    const resistance = taAdj(483, barIndex[4]);
    drawLevel('ta-resistance', resistance, x(barIndex[4]), x(lastBar), `RESISTANCE / ${formatAxisPrice(resistance)}`, 'red');
    drawLevel('ta-channel support', 20, x(barIndex[7]), x(lastBar), 'SUPPORT / 20 ZONE', 'blue', barIndex[7]);

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
          'aria-label': `Meme ${meme.index + 1} von ${memes.length} abspielen: ${meme.label}`
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

  const paintKey = [
    chartState.resolution,
    chartState.ppb.toFixed(3),
    from,
    to,
    height.toFixed(1),
    chartState.activeIndex,
    document.body.classList.contains('ta-active') ? 'ta' : '-',
    priceMode.mode,
    memesEnabled() ? `memes-${memePlayerState.index}` : 'memes-off',
    `corp-${layerState.corp}-${layerState.corpFilter}`,
    `tweets-${layerState.tweets}`,
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
    ta: document.body.classList.contains('ta-active'),
    axisInCanvas: false,
    interactive: true,
    gradientId: 'chart-area-gradient-terminal',
    priceMode: priceMode.mode,
    inspect,
    memes,
    corp,
    tweets,
    activeLayer: layerState.active
  });

  terminalScale = { yToPrice, priceTop, priceBottom };
  canvas.classList.toggle('is-dense', chartState.ppb < 2.2);

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

  canvas.querySelectorAll('.chart-point-hit, .chart-point, .chart-point-halo').forEach((target) => {
    const activate = () => {
      const index = Number(target.dataset.index);
      if (!Number.isNaN(index)) focusEvent(index);
    };
    target.addEventListener('click', activate);
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        activate();
      }
    });
  });

  canvas.querySelectorAll('.chart-corp-hit').forEach((target) => {
    const activate = () => {
      const index = Number(target.dataset.corpIndex);
      if (!Number.isNaN(index)) openLayerItem('corp', index);
    };
    target.addEventListener('click', activate);
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        activate();
      }
    });
  });

  canvas.querySelectorAll('.chart-tweet-hit').forEach((target) => {
    const activate = () => {
      const index = Number(target.dataset.tweetIndex);
      if (!Number.isNaN(index)) openLayerItem('tweet', index);
    };
    target.addEventListener('click', activate);
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        activate();
      }
    });
  });

  canvas.querySelectorAll('.chart-meme-hit').forEach((target) => {
    const activate = () => {
      const index = Number(target.dataset.memeIndex);
      if (!Number.isNaN(index)) openChartMeme(index);
    };
    target.addEventListener('click', activate);
    target.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        activate();
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

function setResolution(resolution) {
  if (!['day', 'week', 'month'].includes(resolution) || resolution === chartState.resolution) return;
  chartState.resolution = resolution;
  chartState.ppb = CHART_LIMITS[resolution].base;
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
      ? 'Aktuell split-bereinigt — Klick zeigt die Kurse so, wie sie damals gehandelt wurden'
      : 'Aktuell as traded — Klick rechnet den 4:1-Split (Juli 2022) rückwirkend heraus';
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
    return `<a href="${source.page}" target="_blank" rel="noreferrer">${labelText} ↗</a>`;
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
    box.innerHTML = '<p class="layer-detail-hint">Klick auf eine <b>◆ Raute</b> (Earnings / Offerings), einen <b>𝕏-Chip</b> (RC-Tweet) im Chart — oder auf einen Eintrag in der Liste. Kurs, Tagesänderung und Quelle erscheinen hier.</p>';
    return;
  }
  const { series, barIndex, bar } = layerBar(active.kind, active.index);
  const change = bar ? relativeChange(series, barIndex) : null;
  const priceLine = bar
    ? `<span class="layer-detail-price">${formatPrice(bar.close)}</span><span class="inspect-delta ${Number.isFinite(change) && change < 0 ? 'is-down' : 'is-up'}">${formatPercent(change)}</span><span>${formatCompact(bar.volume)} SHARES</span>`
    : '';

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
    <p class="layer-detail-links"><a href="${RC_X_URL}" target="_blank" rel="noreferrer">Original: @ryancohen auf X ↗</a><a href="${tweet.url}" target="_blank" rel="noreferrer">Beleg: ${escapeHtml(tweet.source)} ↗</a></p>`;
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
  entries.sort((a, b) => a.iso.localeCompare(b.iso));

  list.innerHTML = entries.map((entry) => {
    const isActive = layerState.active?.kind === entry.kind && layerState.active?.index === entry.index;
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
  }).join('') || '<p class="layer-detail-hint">Keine Einträge — Layer oben wieder einschalten.</p>';

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
  const items = kind === 'corp' ? corporateEvents : rcTweets;
  if (!items[index]) return;
  layerState.active = { kind, index };
  if (kind === 'corp') layerState.corp = true;
  if (kind === 'tweet') layerState.tweets = true;
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
  document.querySelectorAll('[data-corp-filter]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.corpFilter === layerState.corpFilter);
  });
  const count = document.querySelector('#layer-count');
  if (count) count.textContent = `${corporateEvents.length} EVENTS · ${rcTweets.length} RC-TWEETS · ${memeMoments.length} MEMES`;
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
  document.querySelectorAll('[data-corp-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      layerState.corpFilter = button.dataset.corpFilter;
      layerState.corp = true;
      syncLayerControls(); buildLayerList(); terminalPaintKey = ''; paintTerminal();
    });
  });

  // Direktsprünge: Tendieman + Katzenmemes im Chart abspielen
  document.querySelectorAll('[data-open-meme]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = memeMoments.findIndex((moment) => moment.id === button.dataset.openMeme);
      if (index < 0) return;
      document.querySelector('#chart-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      followPageScrollUntil = Date.now() + 1200;
      memeIndex = index;
      renderMeme(index);
      openChartMeme(index);
    });
  });

  syncLayerControls();
  buildLayerList();
  renderLayerDetail();
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
    if (label) label.textContent = configured ? `Support auf ${SUPPORT.provider}` : 'Support einrichten';
  });
  const note = document.querySelector('#support-setup-note');
  if (note) {
    note.textContent = configured
      ? `Live: Dieser Button verlinkt auf ${SUPPORT.url} (${SUPPORT.provider}). Ändern: SUPPORT.url in app.js anpassen.`
      : 'Noch nicht eingerichtet: Trage in app.js bei SUPPORT.url deine Ko-fi- oder Patreon-Adresse ein — der Button wird dann automatisch zum echten Spendenlink (Anleitung unten).';
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
    document.body.classList.contains('ta-active') ? 'ta' : '-'
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
    ta: document.body.classList.contains('ta-active'),
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

  viewport.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture?.(event.pointerId);
    if (pointers.size === 1) {
      dragStart = { x: event.clientX, scroll: viewport.scrollLeft };
      moved = 0;
      viewport.dataset.dragDistance = '0';
      viewport.classList.add('is-dragging');
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
    viewport.scrollLeft = dragStart.scroll - delta;
  });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
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

  // suppress the click that follows a pan gesture
  viewport.addEventListener('click', (event) => {
    if (Number(viewport.dataset.dragDistance) > 6 && event.target.closest('.chart-point, .chart-point-hit, .chart-point-halo, .chart-meme-hit, .chart-corp-hit, .chart-tweet-hit')) {
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

  // Klick an eine beliebige Stelle im Chart → Kurs dieses Tages zeigen
  viewport.addEventListener('click', (event) => {
    if (Number(viewport.dataset.dragDistance) > 6) return;
    if (event.target.closest('.chart-point, .chart-point-hit, .chart-point-halo, .chart-meme-hit, .chart-meme-chip, .chart-corp-hit, .chart-tweet-hit')) return;
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

  const analysisToggle = document.querySelector('#ta-toggle');
  analysisToggle?.addEventListener('click', () => {
    const enabled = document.body.classList.toggle('ta-active');
    analysisToggle.setAttribute('aria-pressed', String(enabled));
    const label = analysisToggle.querySelector('b');
    if (label) label.textContent = enabled ? 'ON' : 'OFF';
    document.querySelector('#analysis-panel')?.setAttribute('aria-hidden', String(!enabled));
    terminalPaintKey = '';
    storyPaintKey = '';
    paintTerminal();
    paintStoryChart();
  });

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
    playButton.setAttribute('aria-label', playing ? 'Meme tape pausieren' : 'Meme tape abspielen');
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
      `<button class="meme-selector" type="button" data-meme-index="${index}" aria-label="Meme ${index + 1} im Chart abspielen">${String(index + 1).padStart(2, '0')}</button>`
    ).join('');
  }

  const focusMeme = (index) => {
    memeIndex = index;
    renderMeme(memeIndex);
    if (memePlaying) memeStartedAt = Date.now();
    // direkt im Chart abspielen: hingehen, verankern, loslassen
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
    const kind = gifSource ? 'GIF' : 'VIDEO';
    const date = formatShortDay(moment.iso);
    return `
      <article class="wall-tile" data-meme-index="${index}">
        <button class="wall-tile-hit" type="button" aria-label="${moment.label} im Chart öffnen — ${moment.frames[0].quote}">
          <span class="wall-tile-frame">
            <img class="wall-tile-image" data-src="${gifSource?.src ?? ''}" alt="${moment.label} — ${gifSource?.title ?? moment.frames[0].quote}" loading="lazy" decoding="async" />
            <span class="wall-tile-kind">${kind}</span>
          </span>
          <span class="wall-tile-meta">
            <b>${String(index + 1).padStart(2, '0')}</b>
            <span class="wall-tile-label">${moment.label}</span>
            <span class="wall-tile-date">${date}</span>
          </span>
          <span class="wall-tile-quote">${moment.frames[0].quote}</span>
        </button>
        <a class="wall-tile-source" href="${media?.page ?? '#'}" target="_blank" rel="noreferrer">${media?.credit ?? 'source'} ↗</a>
        ${videoSource ? `<button class="wall-tile-video" type="button" data-embed="${videoSource.embed}" aria-label="Video abspielen: ${videoSource.title}">▶ VIDEO</button>` : ''}
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
      <button class="clip-hit" type="button" aria-label="Video abspielen: ${clip.title} — ${clip.credit}">
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
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('.clip-hit').forEach((button) => {
    button.addEventListener('click', () => {
      const clip = clips[Number(button.closest('.clip-card')?.dataset.embedIndex ?? 0)];
      if (!clip) return;
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
    toggle.setAttribute('aria-label', open ? 'Navigation schließen' : 'Navigation öffnen');
    nav.setAttribute('aria-hidden', String(!open));
  });

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle.classList.remove('is-open');
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Navigation öffnen');
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
      ? 'market-data.js fehlt — der Chart zeigt eine Ersatzlinie aus den dokumentierten Schlusskursen.'
      : `${asTradedBars.length} echte Tagesbars seit ${formatDay(asTradedBars[0].date)}, zuletzt aktualisiert am ${marketMeta.updated}. ` +
        (priceMode.available
          ? (priceMode.mode === 'adjusted'
            ? 'Split-bereinigt: alle Kurse vor dem 4:1-Split (22. Juli 2022) sind durch 4 geteilt.'
            : 'As traded: die Kurse stehen so im Chart, wie sie damals gehandelt wurden.')
          : 'As traded: keine Split-Informationen verfügbar.');
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
}

/* ------------------------------------------------------------- boot up --- */

function initialise() {
  stampProvenance();
  updatePriceModeUI();
  if (!priceMode.available) {
    document.querySelector('#price-mode-toggle')?.setAttribute('disabled', '');
    document.querySelector('#price-mode-toggle')?.setAttribute('title', 'Keine Split-Daten verfügbar — Kurse bleiben as traded');
  }
  applyActive(storyEvents.length - 1);
  paintTerminal();
  paintStoryChart();
  bindChartTerminal();
  bindChartLayers();
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
    // start with the whole tape in frame, newest bar on the playhead
    fitHistory();
    applyActive(storyEvents.length - 1);
    scrollToEvent(storyEvents.length - 1);
    paintTerminal();
    paintStoryChart({ force: true });
    paintCallout();
  });
}

document.addEventListener('DOMContentLoaded', initialise);
