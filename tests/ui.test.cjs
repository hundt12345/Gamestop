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
  type('tendieman');
  assert.equal(w.document.querySelector('#chart-meme-player').hidden, false);
  assert.ok(w.document.querySelector('#chart-meme-label').textContent.includes('TENDIEMAN'));
  assert.equal(errors.length, 0, errors.map(String).join('\n'));
  dom.window.close();
});
