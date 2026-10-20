// Subtitle engine: parse/serialize SRT & VTT, validate, merge/split. Pure functions (testable in Node).
// Cue shape: { id, start, end, text, source: 'ocr'|'stt'|'manual'|'import', confidence?: number, status?: string, estimated?: boolean }

let seq = 0;
export const cueId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

const pad = (n, l = 2) => String(n).padStart(l, '0');

export function formatTimestamp(sec, sep = ',') {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(r, 3)}`;
}

export function parseTimestamp(str) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(str.trim());
  if (!m) return NaN;
  const ms = Number(m[4].padEnd(3, '0'));
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
}

const ARROW = /^\s*(\S+)\s+-->\s+(\S+)/;

function parseBlocks(text, source) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const a = ARROW.exec(lines[i]);
    if (!a) { i++; continue; }
    const start = parseTimestamp(a[1]), end = parseTimestamp(a[2]);
    i++;
    const body = [];
    while (i < lines.length && lines[i].trim() !== '') body.push(lines[i++]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      cues.push({ id: cueId(), start, end, text: body.join('\n').replace(/<[^>]+>/g, '').trim(), source });
    }
  }
  return cues;
}

export const parseSRT = t => parseBlocks(t, 'import');
export const parseVTT = t => parseBlocks(t.replace(/^WEBVTT[^\n]*\n/, ''), 'import');

export function toSRT(cues) {
  return sorted(cues).map((c, i) => `${i + 1}\n${formatTimestamp(c.start, ',')} --> ${formatTimestamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVTT(cues) {
  return 'WEBVTT\n\n' + sorted(cues).map(c => `${formatTimestamp(c.start, '.')} --> ${formatTimestamp(c.end, '.')}\n${c.text}\n`).join('\n');
}

export const sorted = cues => [...cues].sort((a, b) => a.start - b.start || a.end - b.end);

// Returns array of { cue, problems: string[] }.
export function validate(cues, duration = Infinity) {
  return cues.map(cue => {
    const problems = [];
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)) problems.push('Thời gian không hợp lệ');
    else {
      if (cue.start < 0) problems.push('Bắt đầu < 0');
      if (cue.end <= cue.start) problems.push('Kết thúc phải sau bắt đầu');
      if (cue.end > duration + 0.001) problems.push('Vượt quá thời lượng video');
    }
    if (!cue.text?.trim()) problems.push('Nội dung trống');
    return { cue, problems };
  });
}

export function clampToDuration(cues, duration) {
  if (!Number.isFinite(duration)) return cues;
  return cues
    .map(c => ({ ...c, start: Math.max(0, Math.min(c.start, duration)), end: Math.max(0, Math.min(c.end, duration)) }))
    .filter(c => c.end > c.start);
}

export function splitCue(cue, atTime) {
  if (!(atTime > cue.start && atTime < cue.end)) throw new Error('Điểm cắt phải nằm trong cue');
  const words = cue.text.split(/\s+/);
  const ratio = (atTime - cue.start) / (cue.end - cue.start);
  const k = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
  if (words.length < 2) throw new Error('Cue chỉ có 1 từ, không thể tách văn bản');
  return [
    { ...cue, id: cueId(), end: atTime, text: words.slice(0, k).join(' ') },
    { ...cue, id: cueId(), start: atTime, text: words.slice(k).join(' ') },
  ];
}

export function mergeCues(a, b) {
  return { ...a, id: cueId(), start: Math.min(a.start, b.start), end: Math.max(a.end, b.end), text: `${a.text}\n${b.text}`.trim(), source: a.source === b.source ? a.source : 'manual' };
}

// --- text similarity used by OCR de-dup and Hybrid comparison ---
export function normalize(s) {
  return s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Hybrid: classify without overwriting either source. Returns rows keeping both originals untouched.
// status: 'match' | 'ocr-only' | 'stt-only' | 'review'
export function compareSources(ocr, stt, { matchSim = 0.75, overlapMin = 0.3 } = {}) {
  const rows = [];
  const usedStt = new Set();
  for (const o of sorted(ocr)) {
    let best = null, bestScore = 0;
    stt.forEach((s, idx) => {
      if (usedStt.has(idx)) return;
      const inter = Math.min(o.end, s.end) - Math.max(o.start, s.start);
      const union = Math.max(o.end, s.end) - Math.min(o.start, s.start);
      const overlap = union > 0 ? inter / union : 0;
      if (overlap < overlapMin) return;
      const sim = similarity(o.text, s.text);
      const score = sim + overlap * 0.2;
      if (score > bestScore) { bestScore = score; best = { s, idx, sim, overlap }; }
    });
    if (best) {
      usedStt.add(best.idx);
      rows.push({ ocr: o, stt: best.s, similarity: best.sim, status: best.sim >= matchSim ? 'match' : 'review' });
    } else rows.push({ ocr: o, stt: null, similarity: 0, status: 'ocr-only' });
  }
  stt.forEach((s, idx) => { if (!usedStt.has(idx)) rows.push({ ocr: null, stt: s, similarity: 0, status: 'stt-only' }); });
  return rows.sort((a, b) => (a.ocr?.start ?? a.stt.start) - (b.ocr?.start ?? b.stt.start));
}
