// Turns sparse OCR samples into subtitle cues. Pure logic, testable in Node.
// samples: [{ t: seconds, text: string, conf: 0..100 }]  (text may be '')
import { similarity, cueId, normalize } from '../utils/subtitleEngine.js';

export function buildCuesFromSamples(samples, opts = {}) {
  const { interval = 1, duration = Infinity, minConf = 50, minChars = 2, mergeSim = 0.8, persistentRatio = 0.6 } = opts;
  const warnings = [];
  const clean = samples.map(s => ({ ...s, text: (s.text || '').replace(/\s+\n/g, '\n').trim() }))
    .map(s => (s.text.length < minChars || (s.conf != null && s.conf < minConf)) ? { ...s, text: '' } : s);

  // Drop text that is on screen in most samples: almost certainly a logo/watermark/channel title, not a subtitle.
  const nonEmpty = clean.filter(s => s.text);
  const persistent = [];
  if (clean.length >= 8) {
    const groups = [];
    for (const s of nonEmpty) {
      const g = groups.find(g => similarity(g.text, s.text) >= 0.85);
      if (g) g.n++; else groups.push({ text: s.text, n: 1 });
    }
    for (const g of groups) if (g.n / clean.length >= persistentRatio) persistent.push(g.text);
  }
  const isPersistent = t => persistent.some(p => similarity(p, t) >= 0.85);
  if (persistent.length) warnings.push(`Đã loại ${persistent.length} văn bản xuất hiện liên tục (có thể là logo/watermark): ${persistent.map(p => `"${p.slice(0, 30)}"`).join(', ')}`);

  const cues = [];
  let cur = null;
  const flush = () => { if (cur) { cues.push(cur); cur = null; } };
  for (const s of clean) {
    const text = s.text && !isPersistent(s.text) ? s.text : '';
    if (!text) { flush(); continue; }
    if (cur && similarity(cur.text, text) >= mergeSim && s.t - cur.lastT <= interval * 1.5) {
      cur.lastT = s.t; cur.confs.push(s.conf ?? null);
      if ((s.conf ?? 0) > cur.bestConf) { cur.bestConf = s.conf ?? 0; cur.text = text; } // keep best reading
    } else {
      flush();
      cur = { start: s.t, lastT: s.t, text, confs: [s.conf ?? null], bestConf: s.conf ?? 0 };
    }
  }
  flush();

  const out = cues.map(c => {
    const known = c.confs.filter(x => x != null);
    // Boundaries are only known to ±interval because we sampled sparsely: mark as estimated.
    return {
      id: cueId(),
      start: Math.max(0, c.start),
      end: Math.min(duration, c.lastT + interval),
      text: c.text,
      source: 'ocr',
      confidence: known.length ? known.reduce((a, b) => a + b, 0) / known.length : undefined,
      estimated: true,
    };
  }).filter(c => c.end > c.start);
  return { cues: out, warnings };
}

export { normalize };
