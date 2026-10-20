import assert from 'node:assert/strict';
import { buildCuesFromSamples } from '../js/providers/ocrTracker.js';

const s = (t, text, conf = 90) => ({ t, text, conf });
// 12 samples @1s: logo on all, subtitle A at 2-4, nothing 5-6, subtitle B 7-8, low-confidence junk at 10
const samples = [];
for (let t = 0; t < 12; t++) {
  let text = 'MyChannel';
  if (t >= 2 && t <= 4) text = 'Xin chào các bạn';
  else if (t >= 7 && t <= 8) text = 'Tạm biệt nhé';
  else if (t === 10) text = 'xx';
  samples.push(s(t, text, t === 10 ? 20 : 90));
}
// persistent logo appears in 6/12 = 50% here -> raise to be realistic: add more logo-only frames
const { cues, warnings } = buildCuesFromSamples(samples.concat([s(12,'MyChannel'),s(13,'MyChannel'),s(14,'MyChannel'),s(15,'MyChannel'),s(16,'MyChannel'),s(17,'MyChannel')]), { interval: 1, duration: 18 });
assert.deepEqual(cues.map(c => c.text), ['Xin chào các bạn', 'Tạm biệt nhé']);
assert.equal(cues[0].start, 2); assert.equal(cues[0].end, 5); assert.ok(cues[0].estimated);
assert.equal(cues[1].start, 7);
assert.ok(warnings.some(w => w.includes('MyChannel')));

// slight OCR jitter still merges into one cue; best-confidence reading is kept
const j = buildCuesFromSamples([s(0, 'Hello world', 70), s(1, 'Hello wor1d', 60), s(2, 'Hello world', 95)], { interval: 1, duration: 10 });
assert.equal(j.cues.length, 1); assert.equal(j.cues[0].text, 'Hello world'); assert.equal(j.cues[0].end, 3);

// a gap splits identical text into two cues
const g = buildCuesFromSamples([s(0, 'Again', 90), s(1, '', null), s(2, 'Again', 90)], { interval: 1, duration: 10 });
assert.equal(g.cues.length, 2);
// duration clamp
assert.equal(buildCuesFromSamples([s(9, 'Last', 90)], { interval: 2, duration: 10 }).cues[0].end, 10);
console.log('ocrTracker: all tests passed');
