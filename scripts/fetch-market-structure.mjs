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

const HEADERS = {
  'User-Agent': 'gamestop-event-tape/1.0 (github.com/hundt12345/Gamestop; archive research)',
  Accept: 'text/csv,application/zip,text/html,*/*'
};

const FTD_INDEX = 'https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data';
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

async function fetchBuffer(url, { optional = false, label = '' } = {}) {
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    if (!response.ok) {
      diagnostics.push(`${label || url}: HTTP ${response.status} ${response.statusText}`);
      if (optional) return null;
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    diagnostics.push(`${label || url}: ${error.message}`);
    if (optional) return null;
    throw error;
  }
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
    const buffer = await fetchBuffer(`${FINRA_CDN}/shrt${compact}.csv`, { optional: true, label: `FINRA ${date}` });
    if (!buffer) {
      misses += 1;
      if (misses > 6 && rows.length) break; // older periods are simply not published yet
      continue;
    }
    misses = 0;
    const parsed = parseFinraRow(buffer.toString('utf8'), date);
    if (parsed) rows.push(parsed);
    await new Promise((resolve) => setTimeout(resolve, 120));
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
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  // One row per settlement date (a ticker can appear once per file, but guard anyway).
  const byDate = new Map();
  rows.forEach((row) => byDate.set(row.date, row));
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
  shortInterest: ${renderShortInterest(shortInterest)},
  ftd: ${renderFtd(ftd)}
};
`;

  await writeFile(options.out, payload);
  console.log(`Wrote ${options.out}`);
}

export {
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
