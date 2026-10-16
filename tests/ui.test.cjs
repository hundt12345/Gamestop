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
