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
function seriesFor(resolution) {
  if (!seriesCache.has(resolution)) seriesCache.set(resolution, aggregateBars(dailyBars, resolution));
  return seriesCache.get(resolution);
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
  if (!eventIndexCache.has(resolution)) {
    const series = seriesFor(resolution);
    eventIndexCache.set(resolution, storyEvents.map((event) => barIndexForDate(series, event.iso)));
  }
  return eventIndexCache.get(resolution);
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

// the terminal canvas only has to be re-drawn when its window, zoom or the
// active event changes — panning alone just moves the existing canvas.
let terminalPaintKey = '';
let storyPaintKey = '';

let followPageScrollUntil = 0;

/* --------------------------------------------------------------- drawing - */

function drawSeries(svg, options) {
  const {
    bars, from, to, ppb, height, priceTop, priceBottom, volumeTop, volumeBottom,
    domainFrom, domainTo, events, activeIndex, splits, ta, axisInCanvas, interactive, gradientId
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
    group.append(
      svgElement('line', { class: 'chart-split-line', x1: splitX, x2: splitX, y1: priceTop, y2: volumeBottom }),
      svgElement('text', { class: 'chart-split-label', x: splitX + 5, y: priceTop + 12 },
        `${split.ratio}:1 SPLIT / AS TRADED`)
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
    if (event.label && pointX - lastLabelX > 96) {
      const above = event.barIndex % 2 === 0;
      const labelX = clamp(pointX, from * ppb + 46, width - 46);
      const labelY = above ? Math.max(priceTop + 10, pointY - 15) : Math.min(volumeBottom - 8, pointY + 24);
      group.append(svgElement('text', { class: 'chart-point-label', x: labelX, y: labelY, 'text-anchor': 'middle' }, event.label));
      labelBoxes.push({ x: labelX, y: labelY, width: event.label.length * 5.6 });
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

    const line = (kind, from_, to_) => svgElement('line', {
      class: kind, x1: from_.x, y1: from_.y, x2: to_.x, y2: to_.y
    });

    // levels only make sense while they are actually on screen
    const drawLevel = (kind, price, x1, x2, text, tone) => {
      if (price < minVisible * 1.02 || price > maxVisible * 0.985) return;
      const anchor = at(barIndex[4], price);
      const labelY = price > maxVisible * 0.9 ? anchor.y + 18 : anchor.y - 8;
      placeLabel(text, clamp(anchor.x + 10, 6, width - 6), labelY, tone);
      overlay.append(line(kind, { x: x1, y: anchor.y }, { x: x2, y: anchor.y }));
    };

    const placeLabel = (text, x, labelY, tone = '') => {
      const boxes = labelBoxes.concat(labelPlacements);
      const width_ = text.length * 5.6;
      const collides = boxes.some((box) => {
        const boxWidth = box.width ?? 0;
        return Math.abs(box.y - labelY) < 13 && Math.abs(box.x - x) < (boxWidth + width_) / 2 + 12;
      });
      if (collides || labelY < priceTop + 12 || labelY > priceBottom - 4) return;
      labelPlacements.push({ x, y: labelY, width: width_ });
      overlay.append(svgElement('text', { class: `ta-label${tone ? ` ${tone}` : ''}`, x, y: labelY }, text));
    };

    const labelPlacements = [];
    const triangleTop = { from: at(barIndex[1], 27), to: at(barIndex[3], 150) };
    const triangleBase = { from: at(barIndex[1], 11), to: at(barIndex[3], 62) };
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

    const wedgeTop = { from: at(barIndex[4], 150), to: at(barIndex[6], 330) };
    const wedgeBase = { from: at(barIndex[4], 40), to: at(barIndex[6], 180) };
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

    drawLevel('ta-resistance', 483, x(barIndex[4]), x(lastBar), 'RESISTANCE / 483.00', 'red');
    drawLevel('ta-channel support', 20, x(barIndex[7]), x(lastBar), 'SUPPORT / 20 ZONE', 'blue');

    svg.append(overlay);
  }

  return { ticks, y };
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

  const paintKey = [
    chartState.resolution,
    chartState.ppb.toFixed(3),
    from,
    to,
    height.toFixed(1),
    chartState.activeIndex,
    document.body.classList.contains('ta-active') ? 'ta' : '-'
  ].join('|');

  if (!force && paintKey === terminalPaintKey) {
    paintPlayhead(bars, firstVisible, lastVisible);
    return;
  }
  terminalPaintKey = paintKey;

  const { ticks, y } = drawSeries(canvas, {
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
    gradientId: 'chart-area-gradient-terminal'
  });

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
    pointer: callout?.querySelector('.callout-pointer'),
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
  const { callout, pointer } = calloutElements();
  const { terminal, viewport } = terminalElements();
  if (!callout || !terminal || !viewport) return;

  const marker = document.querySelector(`#chart-canvas .chart-point[data-index="${chartState.activeIndex}"]`);
  const visible = marker && !chartState.calloutHidden;
  callout.classList.toggle('is-hidden', !visible);
  if (!visible) return;

  const markerRect = marker.getBoundingClientRect();
  const terminalRect = terminal.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const calloutRect = callout.getBoundingClientRect();
  const width = calloutRect.width || callout.offsetWidth || 340;
  const height = calloutRect.height || callout.offsetHeight || 168;

  const markerCenterX = markerRect.left - terminalRect.left + markerRect.width / 2;
  const left = clamp(
    markerCenterX - width / 2,
    12,
    Math.max(12, terminal.clientWidth - width - 12)
  );

  const minTop = viewportRect.top - terminalRect.top + 8;
  const maxTop = viewportRect.bottom - terminalRect.top - height - 8;
  let top = markerRect.top - terminalRect.top - height - 14;
  let placement = 'above';
  if (top < minTop) {
    top = markerRect.bottom - terminalRect.top + 14;
    placement = 'below';
  }
  top = clamp(top, minTop, Math.max(minTop, maxTop));

  callout.style.left = `${Math.round(left)}px`;
  callout.style.top = `${Math.round(top)}px`;
  callout.dataset.placement = placement;
  if (pointer) {
    pointer.style.left = `${Math.round(clamp(markerCenterX - left, 18, width - 18))}px`;
  }
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
  document.querySelectorAll('.resolution-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.resolution === resolution);
  });
  const label = document.querySelector('#resolution-label');
  if (label) label.textContent = resolutionLabel(resolution);
  paintTerminal();
  paintStoryChart();
  scrollToEvent(chartState.activeIndex);
  applyActive(chartState.activeIndex);
}

function resolutionLabel(resolution) {
  if (resolution === 'week') return '1W / WEEKLY';
  if (resolution === 'month') return '1M / MONTHLY';
  return '1D / DAILY DETAIL';
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
    gradientId: 'chart-area-gradient-story'
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
    if (Number(viewport.dataset.dragDistance) > 6 && event.target.closest('.chart-point, .chart-point-hit, .chart-point-halo')) {
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

const memeData = [
  { label: 'WSB / 2021', quote: 'I LIKE THE STOCK.', caption: 'conviction, condensed.' },
  { label: 'HEARING / 2021', quote: 'I AM NOT A CAT.', caption: 'a meme becomes testimony.' },
  { label: 'COMMUNITY / ALWAYS', quote: 'HODL THE LINE.', caption: 'an internet learns to archive.' }
];

let memeIndex = 0;
let memePlaying = false;
let memeStartedAt = 0;
let memeAnimationFrame = null;
const memeDuration = 4400;

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
    card.classList.remove('is-changing');
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
  document.querySelectorAll('.meme-selector').forEach((button) => {
    button.addEventListener('click', () => {
      memeIndex = Number(button.dataset.memeIndex);
      renderMeme(memeIndex);
      if (memePlaying) memeStartedAt = Date.now();
    });
  });
  renderMeme(0, false);
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
    note.textContent = `${origin} · ${marketMeta.asTraded ? 'AS TRADED' : 'ADJUSTED'} · LAST BAR ${formatShortDay(marketMeta.end).toUpperCase()}`;
    note.title = usingFallback
      ? 'market-data.js fehlt — der Chart zeigt eine Ersatzlinie aus den dokumentierten Schlusskursen.'
      : `${dailyBars.length} echte Tagesbars seit ${formatDay(dailyBars[0].date)}, zuletzt aktualisiert am ${marketMeta.updated}.`;
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
  applyActive(storyEvents.length - 1);
  paintTerminal();
  paintStoryChart();
  bindChartTerminal();
  bindTimeline();
  bindMobileNav();
  bindMemePlayer();
  bindSourceFilters();
  bindScrollProgress();

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
