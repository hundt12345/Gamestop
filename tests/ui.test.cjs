const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

test('English UI and meme shortcuts open the selected dock player', async () => {
 const dom = new JSDOM(fs.readFileSync('index.html','utf8'), {runScripts:'outside-only', url:'http://localhost:3000'});
 const w=dom.window;
 const errors=[];
 w.addEventListener('error', e=>errors.push(e.error));
 w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.requestAnimationFrame=()=>0;
 w.cancelAnimationFrame=()=>{};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLElement.prototype.scrollTo=function(){};
 w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:100,height:100});
 w.eval(fs.readFileSync('market-data.js','utf8'));
 w.eval(fs.readFileSync('app.js','utf8') + '\nwindow.testMoments = memeMoments;');
 await new Promise(r=>setTimeout(r,50));
 assert.equal(errors.length,0,errors.map(String).join('\n'));
 assert.equal(w.document.documentElement.lang,'en');
 for (const button of w.document.querySelectorAll('[data-open-meme]')) {
   w.document.body.classList.add('dock-collapsed');
   button.click();
   const expected = w.testMoments.find(m => m.id === button.dataset.openMeme).label;
   assert.ok(w.document.querySelector('#chart-meme-label').textContent.includes(expected));
   assert.equal(w.document.querySelector('#chart-meme-player').hidden,false,button.dataset.openMeme);
   assert.equal(w.document.body.classList.contains('dock-collapsed'),false);
 }
 assert.equal(errors.length,0,errors.map(String).join('\n'));
 assert.equal(w.document.querySelectorAll('.clip-card').length>=3,true);
 w.document.querySelector('.clip-hit').click();
 assert.ok(w.document.querySelector('.clip-card iframe'));
 w.document.querySelector('#media-toggle').click();
 assert.equal(w.document.querySelectorAll('.clip-card iframe').length,0);
 w.document.querySelector('.clip-hit').click();
 assert.equal(w.document.querySelectorAll('.clip-card iframe').length,0);
 dom.window.close();
});

test('TA / DD desk, number radar and keyboard codes work on the real tape', async () => {
  const dom = new JSDOM(fs.readFileSync('index.html','utf8'), {runScripts:'outside-only', url:'http://localhost:3000'});
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', e => errors.push(e.error));
  w.matchMedia = () => ({matches:false, addEventListener(){}});
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollIntoView = function(){};
  w.HTMLElement.prototype.scrollTo = function(){};
  w.SVGElement.prototype.getBBox = () => ({x:0,y:0,width:100,height:100});
  w.eval(fs.readFileSync('market-data.js','utf8'));
  w.eval(fs.readFileSync('app.js','utf8') + `
    window.testTape = {
      storyCount: storyEvents.length,
      memes: memeMoments.map((moment) => ({id: moment.id, iso: moment.iso, frames: moment.frames.length})),
      radar: radarList().length,
      radarCodes: RADAR_CODES.map((rule) => ({id: rule.id, hits: radarList().filter((hit) => hit.code.id === rule.id).length})),
      deals: corporateEvents.filter((item) => item.type === 'deal').length,
      bitcoins: corporateEvents.filter((item) => item.type === 'bitcoin').length,
      lastCorp: corporateEvents[corporateEvents.length - 1].iso,
      hype: hypeIndex(),
      analytics: { rsi: tapeAnalytics().rsi14, sma200: tapeAnalytics().lastSma200 },
      reads: COMMUNITY_READS.length
    };
  `);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(errors.length, 0, errors.map(String).join('\n'));

  // Datenschicht: 2025/2026 ist jetzt im Tape
  assert.equal(w.testTape.storyCount, 16);
  assert.ok(w.testTape.deals >= 3, 'eBay proposal, rejection and retreat are chart layers');
  assert.ok(w.testTape.bitcoins >= 4, 'Bitcoin treasury events are chart layers');
  assert.equal(w.testTape.lastCorp, '2026-10-13');
  assert.ok(w.testTape.memes.some((moment) => moment.id === 'meme-ebay'));

  // Zahlenschloss rechnet gegen das echte Tape
  assert.ok(w.testTape.radar > 40, `expected a decent number of cult prints, got ${w.testTape.radar}`);
  const top = w.testTape.radarCodes.find((rule) => rule.id === 'top');
  assert.equal(top.hits, 1, 'the $483.00 print happens exactly once');
  const list = w.document.querySelectorAll('#layer-list [data-layer-kind="number"]');
  assert.ok(list.length > 10, 'meme numbers appear in the layer list');

  // TA-Desk: gerechnete Kennzahlen + Quellen
  assert.ok(w.testTape.analytics.rsi > 0 && w.testTape.analytics.rsi < 100);
  w.document.querySelector('#ta-toggle').click();
  assert.equal(w.document.body.classList.contains('ta-active'), true);
  const statLabels = [...w.document.querySelectorAll('#ta-indicators .ta-stat-label')].map((node) => node.textContent);
  assert.ok(statLabels.includes('RSI (14, daily)'), statLabels.join(','));
  assert.ok(statLabels.includes('SMA 200 / DISTANCE'));
  assert.equal(w.document.querySelectorAll('#ta-reads .ta-read').length, w.testTape.reads);
  assert.ok(w.document.querySelector('#ta-reads').textContent.includes('JRoland'));
  assert.ok(w.document.querySelector('#ta-hype').textContent.includes('HYPE INDEX'));
  assert.ok(['QUIET','STIRRING','COILED','JACKED','UNHINGED'].includes(w.testTape.hype.label));
  assert.ok(w.document.querySelector('#hype-chip').textContent.startsWith('HYPE '));

  // Codes: tippen, ohne in einem Feld zu sein
  const type = (text) => [...text].forEach((char) => {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key: char, bubbles: true}));
  });
  type('420');
  assert.equal(w.document.querySelector('#number-toggle-state').textContent, 'OFF');
  type('420');
  assert.equal(w.document.querySelector('#number-toggle-state').textContent, 'ON');
  type('69');
  assert.ok(w.document.querySelector('#signal-toast').textContent.includes('LORE LEVELS OFF'));
  type('69');
  type('moon');
  assert.ok(w.document.querySelector('#signal-toast').textContent.includes('CODE MOON'));
  assert.ok(w.document.querySelectorAll('#rocket-layer .rocket').length > 0);
  // Der Code TENDIEMAN öffnet jetzt das Vollbild; SHANTY spielt den Clip im Dock.
  type('tendieman');
  assert.equal(w.document.querySelector('#tendieman').hidden, false);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  assert.equal(w.document.querySelector('#tendieman').hidden, true);
  type('shanty');
  assert.equal(w.document.querySelector('#chart-meme-player').hidden, false);
  assert.ok(w.document.querySelector('#chart-meme-label').textContent.includes('TENDIEMAN'));
  assert.equal(errors.length, 0, errors.map(String).join('\n'));
  dom.window.close();
});

test('market structure strip under the chart shows DRS, FINRA short interest and SEC fails', async () => {
  const dom = new JSDOM(fs.readFileSync('index.html','utf8'), {runScripts:'outside-only', url:'http://localhost:3000'});
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', e => errors.push(e.error));
  w.matchMedia = () => ({matches:false, addEventListener(){}});
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollIntoView = function(){};
  w.HTMLElement.prototype.scrollTo = function(){};
  w.SVGElement.prototype.getBBox = () => ({x:0,y:0,width:100,height:100});
  const doc = w.document;
  w.eval(fs.readFileSync('market-data.js','utf8'));
  w.eval(fs.readFileSync('flow-data.js','utf8'));
  w.eval(fs.readFileSync('app.js','utf8') + `
    window.testFlows = {
      updated: flowState.updated,
      fallback: flowState.fallback,
      shortInterest: flowState.shortInterest.length,
      ftd: flowState.ftd.length,
      drs: DRS_DISCLOSURES.length,
      ftdPeak: flowStats().ftdPeak,
      tendiemanCode: CODES.find((entry) => entry.code === 'tendieman')
    };
  `);
  await new Promise(r=>setTimeout(r,60));
  assert.equal(errors.length, 0, errors.map(String).join('\n'));

  const flows = w.testFlows;
  assert.equal(flows.fallback, false, 'flow-data.js must be loaded');
  assert.ok(flows.shortInterest >= 2, `short interest rows: ${flows.shortInterest}`);
  assert.ok(flows.ftd >= 40, `fails-to-deliver rows: ${flows.ftd}`);
  assert.equal(flows.drs, 18, 'DRS series carries every filing disclosure');
  assert.equal(flows.ftdPeak.shares, 2099572, 'the 26 Jan 2021 peak is the anchor of the FTD series');
  assert.equal(flows.ftdPeak.date, '2021-01-26');

  // Der Strip liegt unter dem Chart, nicht darüber.
  const terminal = doc.querySelector('#chart-explorer');
  const strip = doc.querySelector('#flows-strip');
  assert.ok(strip, 'flows strip exists');
  assert.equal(terminal.compareDocumentPosition(strip) & w.Node.DOCUMENT_POSITION_FOLLOWING, w.Node.DOCUMENT_POSITION_FOLLOWING, 'strip follows the chart terminal');

  // Spiegel der Kursfläche: gleicher ViewBox-Ausschnitt, gleiche Geometrie.
  const canvas = doc.querySelector('#chart-canvas');
  const clone = doc.querySelector('#flows-clone-canvas');
  assert.ok(clone, 'the chart is mirrored into the strip');
  assert.equal(clone.getAttribute('viewBox'), canvas.getAttribute('viewBox'));
  assert.equal(clone.getAttribute('width'), canvas.getAttribute('width'));

  // Drei Bahnen mit echten Zahlen.
  assert.equal(doc.querySelectorAll('#flows-canvas .flows-lane').length, 3);
  assert.equal(doc.querySelectorAll('#flows-canvas .flows-drs-dot').length, 18);
  assert.ok(doc.querySelectorAll('#flows-canvas .flows-si-bar').length >= 2);
  assert.equal(doc.querySelectorAll('#flows-canvas .flows-ftd-bar').length, flows.ftd);

  const rail = doc.querySelector('#flows-rail').textContent.replace(/\s+/g, ' ');
  assert.ok(rail.includes('66.2M SHARES'), rail);
  assert.ok(rail.includes('14.8%'), rail);
  assert.ok(rail.includes('DAYS TO COVER'), rail);
  const stats = doc.querySelector('#flows-stats').textContent.replace(/\s+/g, ' ');
  assert.ok(stats.includes('66.2M of 448.4M shares'), stats);
  assert.ok(stats.includes('peak 76.6M in 2023'), stats);
  assert.ok(stats.includes('2.1M on 26 JAN 2021'), stats);

  // Hover liest den Balken aus: 4. Okt 2025 kann es nicht geben, aber der
  // jüngste FINRA-Settlement schon.
  const siBar = doc.querySelector('#flows-canvas .flows-si-bar:last-of-type') || doc.querySelector('#flows-canvas .flows-si-bar');
  siBar.dispatchEvent(new w.MouseEvent('mousemove', {bubbles:true}));
  const readout = doc.querySelector('#flows-readout').textContent.replace(/\s+/g, ' ');
  assert.ok(/SHARES|shares short/.test(readout), readout);

  // Bahn abschalten entfernt genau eine Spur.
  doc.querySelector('[data-flow-pane-toggle="ftd"]').click();
  assert.equal(doc.querySelectorAll('#flows-canvas .flows-lane').length, 2);
  assert.equal(doc.querySelectorAll('#flows-canvas .flows-ftd-bar').length, 0);
  assert.equal(doc.querySelector('[data-flow-pane-toggle="ftd"]').getAttribute('aria-pressed'), 'false');
  doc.querySelector('[data-flow-pane-toggle="ftd"]').click();
  assert.equal(doc.querySelectorAll('#flows-canvas .flows-lane').length, 3);

  // Strip abschalten lässt den Chart allein.
  doc.querySelector('#flows-toggle').click();
  assert.equal(doc.body.classList.contains('flows-off'), true);
  doc.querySelector('#flows-toggle').click();
  assert.equal(doc.body.classList.contains('flows-off'), false);

  // Vollbild-Tendieman: Zeilen des Archivs, ESC schließt.
  doc.querySelector('[data-open-tendieman]').click();
  const overlay = doc.querySelector('#tendieman');
  assert.equal(overlay.hidden, false);
  assert.equal(doc.body.classList.contains('tendieman-open'), true);
  const lines = doc.querySelectorAll('#tendieman-lines .tendieman-line');
  assert.equal(lines.length, 13);
  assert.equal(doc.querySelectorAll('#tendieman-lines .tendieman-line.is-active').length, 1);
  assert.ok(lines[0].textContent.includes('A mall retailer'));
  assert.ok(/every line is dated/.test(doc.querySelector('#tendieman-counter').textContent + lines[0].textContent) === false);
  assert.ok([...lines].at(-1).textContent.includes('13 OCT 2026'));
  doc.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  assert.equal(overlay.hidden, true);
  assert.equal(doc.body.classList.contains('tendieman-open'), false);

  // Code TENDIEMAN öffnet dasselbe Overlay.
  w.runCode(w.testFlows.tendiemanCode);
  assert.equal(overlay.hidden, false);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  assert.equal(overlay.hidden, true);

  assert.equal(errors.length, 0, errors.map(String).join('\n'));
  dom.window.close();
});
