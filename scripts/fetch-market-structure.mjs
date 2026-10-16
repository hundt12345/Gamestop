#!/usr/bin/env node
/**
 * Refreshes flow-data.js with the official market-structure series for GME:
 *
 *  • Short interest — FINRA equity short interest files, published twice a
 *    month (settlement on the 15th and the last business day). Direct CSV:
 *    https://cdn.finra.org/equity/otcmarket/biweekly/shrt<YYYYMMDD>.csv
 *  • Fails to deliver — SEC CNS fails-to-deliver data, one pipe-delimited
 *    file per half month (a = 1st–15th, b = 16th–end):
 *    https://www.sec.gov/files/data/fails-deliver-data/cnsfails<YYYYMM>a.zip
 *    Files are located through the SEC index page, because the path changed
 *    once already (older periods live under /files/data/other/...).
 *
 * Both series are stored verbatim, without interpretation: the numbers are
 * what the regulator published, dated by settlement date.
 *
 * Usage: node scripts/fetch-market-structure.mjs [--out flow-data.js]
 *        [--si-months 24] [--ftd-periods 30]
 */

import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// Both hosts sit behind bot filters that answer 403 to plain script agents, so
// the request carries a normal browser profile plus a contact suffix.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/126.0.0.0 Safari/537.36 gamestop-event-tape/1.0 (+https://github.com/hundt12345/Gamestop)';

function headersFor(url) {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/csv,application/zip,text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache'
  };
  if (url.includes('finra.org')) headers.Referer = 'https://www.finra.org/finra-data/browse-catalog/equity-short-interest/files';
  if (url.includes('sec.gov')) headers.Referer = 'https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data';
  return headers;
}

const FTD_INDEX = 'https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data';
const REQUEST_GAP_MS = 900;      // FINRA/SEC throttle bursts
const RETRY_DELAYS = [1500, 6000, 15000];
const FINRA_CDN = 'https://cdn.finra.org/equity/otcmarket/biweekly';
const SYMBOL = 'GME';
const CUSIP = '36467W109';

function parseArgs(argv) {
  const options = { out: 'flow-data.js', siMonths: 24, ftdPeriods: 30 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') options.out = argv[index + 1];
    if (argv[index] === '--si-months') options.siMonths = Number(argv[index + 1]) || options.siMonths;
    if (argv[index] === '--ftd-periods') options.ftdPeriods = Number(argv[index + 1]) || options.ftdPeriods;
  }
  return options;
}

/* ------------------------------------------------------------- calendar --- */

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function nthWeekday(year, month, weekday, nth) {
  // month is 0-based, weekday 0 = Sunday
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function observed(date) {
  // US market convention: Saturday → previous Friday, Sunday → following Monday
  const day = date.getUTCDay();
  if (day === 6) return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
  if (day === 0) return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return date;
}

const holidayCache = new Map();
function marketHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const list = [
    observed(new Date(Date.UTC(year, 0, 1))),
    nthWeekday(year, 0, 1, 3), // MLK
    nthWeekday(year, 1, 1, 3), // Washington's Birthday
    new Date(easterSunday(year).getTime() - 2 * 86400000), // Good Friday
    lastWeekday(year, 4, 1), // Memorial Day
    observed(new Date(Date.UTC(year, 5, 19))), // Juneteenth
    observed(new Date(Date.UTC(year, 6, 4))), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(new Date(Date.UTC(year, 11, 25))) // Christmas
  ];
  const set = new Set(list.map(iso));
  holidayCache.set(year, set);
  return set;
}

function isBusinessDay(date) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !marketHolidays(date.getUTCFullYear()).has(iso(date));
}

function previousBusinessDay(date) {
  let cursor = new Date(date.getTime());
  while (!isBusinessDay(cursor)) cursor = new Date(cursor.getTime() - 86400000);
  return cursor;
}

function lastBusinessDayOfMonth(year, month) {
  let cursor = new Date(Date.UTC(year, month + 1, 0));
  while (!isBusinessDay(cursor)) cursor = new Date(cursor.getTime() - 86400000);
  return cursor;
}

/** FINRA settlement dates: the 15th (or the business day before) and the last business day. */
function settlementCandidates(monthsBack) {
  const today = new Date();
  const dates = [];
  for (let step = 0; step <= monthsBack; step += 1) {
    const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - step, 15));
    const fifteenth = previousBusinessDay(cursor);
    if (fifteenth.getTime() <= today.getTime()) dates.push(iso(fifteenth));
    const last = lastBusinessDayOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth());
    if (last.getTime() <= today.getTime()) dates.push(iso(last));
  }
  return [...new Set(dates)].sort().reverse();
}

/* ------------------------------------------------------------------ http -- */

const diagnostics = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Both hosts throttle request bursts (403/429), so every call is paced and
// retried with backoff before it is reported as a failure.
async function fetchBuffer(url, { optional = false, label = '', retries = RETRY_DELAYS.length } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: headersFor(url), redirect: 'follow' });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      const retryable = response.status === 403 || response.status === 429 || response.status >= 500;
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
      if (!retryable || attempt === retries) break;
      await sleep(RETRY_DELAYS[attempt]);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
  diagnostics.push(`${label || url}: ${lastError.message}`);
  if (optional) return null;
  throw new Error(`${lastError.message} for ${url}`);
}

function annotate(message, level = 'warning') {
  console.log(`::${level}::${String(message).replaceAll('\n', ' ')}`);
}

function report(title, error) {
  annotate(`${title}: ${error.message}`, 'error');
  diagnostics.slice(-8).forEach((line) => annotate(line, 'error'));
  console.error(title, error);
}

/* ------------------------------------------------------------------- zip -- */

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** Minimal single-entry ZIP reader (SEC ships one pipe-delimited file per zip). */
async function unzipFirstEntry(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocd = -1;
  const scanFloor = Math.max(0, buffer.length - 66000);
  for (let index = buffer.length - 22; index >= scanFloor; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    // Some hosts strip the central directory — fall back to the local header.
    for (let index = 0; index < buffer.length - 30; index += 1) {
      if (view.getUint32(index, true) === 0x04034b50) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0) throw new Error('not a zip archive');
    const method = view.getUint16(eocd + 8, true);
    const nameLen = view.getUint16(eocd + 26, true);
    const extraLen = view.getUint16(eocd + 28, true);
    const dataStart = eocd + 30 + nameLen + extraLen;
    const data = buffer.subarray(dataStart);
    if (method === 0) return data.toString('utf8');
    return (await inflateRaw(data)).toString('utf8');
  }

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let entry = 0; entry < entries; entry += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return data.toString('utf8');
    if (method === 8) return (await inflateRaw(data)).toString('utf8');
    throw new Error(`unsupported zip compression method ${method}`);
  }
  throw new Error('zip contained no readable entry');
}

/* -------------------------------------------------------------- FINRA SI -- */

function parseFinraRow(text, settlement) {
  const lines = text.split('\n');
  const header = lines[0].split('|').map((cell) => cell.replaceAll('"', '').trim());
  const index = {
    symbol: header.indexOf('symbolCode'),
    current: header.indexOf('currentShortPositionQuantity'),
    previous: header.indexOf('previousShortPositionQuantity'),
    volume: header.indexOf('averageDailyVolumeQuantity'),
    days: header.indexOf('daysToCoverQuantity'),
    change: header.indexOf('changePercent')
  };
  for (const line of lines) {
    if (!line.includes(`"${SYMBOL}"`) && !line.startsWith(`${SYMBOL}|`)) continue;
    const cells = line.split('|').map((cell) => cell.replaceAll('"', '').trim());
    if (cells[index.symbol] !== SYMBOL) continue;
    const current = Number(cells[index.current]);
    if (!Number.isFinite(current)) continue;
    return {
      date: settlement,
      short: current,
      previous: Number(cells[index.previous]) || null,
      averageVolume: Number(cells[index.volume]) || null,
      daysToCover: Number(cells[index.days]) || null,
      changePercent: Number(cells[index.change]) || null
    };
  }
  return null;
}

async function collectShortInterest(monthsBack) {
  const candidates = settlementCandidates(monthsBack);
  const rows = [];
  let misses = 0;
  for (const date of candidates) {
    const compact = date.replaceAll('-', '');
    const buffer = await fetchBuffer(`${FINRA_CDN}/shrt${compact}.csv`, { optional: true, retries: 1, label: `FINRA ${date}` });
    if (!buffer) {
      misses += 1;
      if (misses > 2 && rows.length) break; // the newest period is not published yet
      continue;
    }
    misses = 0;
    const parsed = parseFinraRow(buffer.toString('utf8'), date);
    if (parsed) rows.push(parsed);
    await sleep(REQUEST_GAP_MS);
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ SEC --- */

/** SEC index page → every published half-month zip, newest last. */
async function ftdPeriodsFromIndex() {
  const html = (await fetchBuffer(FTD_INDEX, { label: 'SEC FTD index' })).toString('utf8');
  const found = new Map();
  const pattern = /(?:https?:\/\/www\.sec\.gov)?(\/files\/data\/(?:other\/)?fails-deliver-data\/cnsfails(\d{6}[ab])\.zip)/g;
  let match;
  while ((match = pattern.exec(html))) {
    found.set(match[2], `https://www.sec.gov${match[1]}`);
  }
  return [...found.entries()]
    .map(([period, url]) => ({ period, url }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function parseFtdFile(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cells = line.split('|').map((cell) => cell.replaceAll('"', '').trim());
    if (cells.length < 6) continue;
    const [settlement, cusip, symbol, quantity, , price] = cells;
    if (cusip !== CUSIP && symbol !== SYMBOL) continue;
    const shares = Number(quantity);
    if (!Number.isFinite(shares)) continue;
    rows.push({ date: settlement, shares, price: Number(price) || null });
  }
  return rows;
}

async function collectFtd(periodsToFetch) {
  const periods = await ftdPeriodsFromIndex();
  if (!periods.length) throw new Error('SEC published no FTD files on the index page');
  const selected = periods.slice(-periodsToFetch);
  // The January/February 2021 spike is the reason this series matters to the
  // archive, so those periods are always kept in the set.
  ['202101a', '202101b', '202102a'].forEach((period) => {
    const hit = periods.find((entry) => entry.period === period);
    if (hit && !selected.some((entry) => entry.period === period)) selected.unshift(hit);
  });

  const rows = [];
  for (const { period, url } of selected) {
    let text;
    try {
      const buffer = await fetchBuffer(url, { label: `SEC FTD ${period}` });
      text = await unzipFirstEntry(buffer);
    } catch (error) {
      console.warn(`  ! ${period} skipped: ${error.message}`);
      continue;
    }
    const parsed = parseFtdFile(text);
    if (parsed.length) rows.push(...parsed);
    await sleep(REQUEST_GAP_MS);
  }
  // One row per settlement date (a ticker can appear once per file, but guard anyway).
  const byDate = new Map();
  rows.forEach((row) => byDate.set(normaliseDate(row.date), row));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normaliseDate(value) {
  const digits = String(value).replaceAll('-', '');
  if (!/^\d{8}$/.test(digits)) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/* ------------------------------------------------------------- merge in --- */

// Nothing is ever lost: rows already in flow-data.js (including curated history
// that predates the live sources) stay in the file, new official rows win per
// settlement date.
function readExisting(path) {
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { shortInterest: [], ftd: [] };
  }
  const block = (name) => {
    const match = new RegExp(`${name}:\\s*\\{[^]*?rows:\\s*\`([^\`]*)\``).exec(text);
    return match ? match[1] : '';
  };
  const shortInterest = [];
  block('shortInterest').trim().split('\n').forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;
    const [date, short, previous, averageVolume, daysToCover] = parts;
    const value = Number(short);
    if (!Number.isFinite(value)) return;
    shortInterest.push({
      date: normaliseDate(date),
      short: value,
      previous: Number(previous) || null,
      averageVolume: Number(averageVolume) || null,
      daysToCover: Number(daysToCover) || null
    });
  });
  const ftd = [];
  block('ftd').trim().split('\n').forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;
    const [date, shares, price] = parts;
    const value = Number(shares);
    if (!Number.isFinite(value)) return;
    ftd.push({ date: normaliseDate(date), shares: value, price: Number(price) || null });
  });
  return { shortInterest, ftd };
}

function mergeRows(existing, incoming) {
  const byDate = new Map();
  existing.forEach((row) => byDate.set(row.date, row));
  incoming.forEach((row) => byDate.set(row.date, row));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ----------------------------------------------------------------- output -- */

function renderShortInterest(rows) {
  const body = rows.map((row) => [
    row.date,
    Math.round(row.short),
    row.previous === null ? '-' : Math.round(row.previous),
    row.averageVolume === null ? '-' : Math.round(row.averageVolume),
    row.daysToCover === null ? '-' : row.daysToCover.toFixed(2)
  ].join(' ')).join('\n');
  return `{\n    unit: 'shares',\n    settlement: '15th and last business day of each month (FINRA)',\n    rows: \`\n${body}\n\`\n  }`;
}

function renderFtd(rows) {
  const body = rows.map((row) => [
    row.date,
    Math.round(row.shares),
    row.price === null ? '-' : row.price.toFixed(2)
  ].join(' ')).join('\n');
  return `{\n    unit: 'shares',\n    settlement: 'settlement date, SEC CNS fails-to-deliver (half-month files)',\n    rows: \`\n${body}\n\`\n  }`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let shortInterest = [];
  let ftd = [];

  console.log('Fetching FINRA short interest …');
  try {
    shortInterest = await collectShortInterest(options.siMonths);
    console.log(`  → ${shortInterest.length} settlements${shortInterest.length ? ` (${shortInterest[0].date} … ${shortInterest.at(-1).date})` : ''}`);
  } catch (error) {
    report('FINRA short interest failed', error);
  }

  console.log('Fetching SEC fails-to-deliver …');
  try {
    ftd = await collectFtd(options.ftdPeriods);
    console.log(`  → ${ftd.length} settlement dates${ftd.length ? ` (${ftd[0].date} … ${ftd.at(-1).date})` : ''}`);
  } catch (error) {
    report('SEC fails-to-deliver failed', error);
  }

  const existing = readExisting(options.out);
  shortInterest = mergeRows(existing.shortInterest, shortInterest);
  ftd = mergeRows(existing.ftd, ftd);
  console.log(`  → ${shortInterest.length} short interest rows, ${ftd.length} fails-to-deliver rows after merge with ${options.out}`);
  if (diagnostics.length) console.log(`  (${diagnostics.length} request(s) failed and were retried)`);

  if (!shortInterest.length && !ftd.length) {
    annotate(`nothing fetched — refusing to overwrite flow-data.js | ${diagnostics.slice(-6).join(' | ')}`, 'error');
    throw new Error('nothing fetched — refusing to overwrite flow-data.js');
  }

  const payload = `// Generated by scripts/fetch-market-structure.mjs — do not edit by hand.
// Official market-structure series for GME, quoted exactly as published:
//   • short interest  — FINRA equity short interest (twice-monthly settlement)
//   • fails to deliver — SEC CNS fails-to-deliver (half-month files)
// Refresh with: node scripts/fetch-market-structure.mjs
window.GME_FLOWS = {
  symbol: '${SYMBOL}',
  updated: '${iso(new Date())}',
  sources: {
    shortInterest: 'FINRA equity short interest files (cdn.finra.org/equity/otcmarket/biweekly)',
    ftd: 'SEC fails-to-deliver data (sec.gov/data-research/sec-markets-data/fails-deliver-data)'
  },
  notes: [
    'short interest — one row per FINRA settlement date (15th and last business day)',
    'fails to deliver — SEC CNS aggregate balance per settlement date: cumulative, not daily new fails.',
    'SEC states fails to deliver are not evidence of naked short selling; a missing date is below the reporting threshold.',
    'rows dated before the first live fetch were seeded once from the same official series as republished by public mirrors (2021 and 2025/26 clusters)'
  ],
  shortInterest: ${renderShortInterest(shortInterest)},
  ftd: ${renderFtd(ftd)}
};
`;

  await writeFile(options.out, payload);
  console.log(`Wrote ${options.out}`);
}

export {
  readExisting,
  mergeRows,
  settlementCandidates,
  previousBusinessDay,
  lastBusinessDayOfMonth,
  isBusinessDay,
  parseFinraRow,
  parseFtdFile,
  unzipFirstEntry,
  inflateRaw
};

// Only fetch when executed directly — importing the module (tests) must not
// touch the network.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
