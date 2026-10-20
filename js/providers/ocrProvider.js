// OCR over video frames using Tesseract.js (loaded on demand from a CDN; ES module build).
// Real OCR only: if the library or language data cannot be loaded, we throw and the UI shows the reason.
import { buildCuesFromSamples } from './ocrTracker.js';

const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
let tessPromise = null;

export const OCR_LANGS = [
  ['vie', 'Tiếng Việt'], ['eng', 'English'], ['spa', 'Español'], ['chi_sim', '中文 (giản thể)'],
  ['jpn', '日本語'], ['kor', '한국어'], ['tha', 'ไทย'],
];

function loadTesseract() {
  if (!tessPromise) tessPromise = import(/* @vite-ignore */ TESS_URL).catch(e => {
    tessPromise = null;
    throw new Error('Không tải được Tesseract.js (cần kết nối tới cdn.jsdelivr.net). ' + (e.message || e));
  });
  return tessPromise;
}

function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('Không tua được video tới ' + t.toFixed(1) + 's')); };
    const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onErr); };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.currentTime = t;
  });
}

// Preprocess: crop region, upscale small text, grayscale + contrast stretch. Returns a canvas.
function frameToCanvas(video, region, scaleTo = 1000) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const sx = Math.round(region.x * vw), sy = Math.round(region.y * vh);
  const sw = Math.max(8, Math.round(region.w * vw)), sh = Math.max(8, Math.round(region.h * vh));
  const k = Math.min(3, Math.max(1, scaleTo / sw));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const g = ((d[i] - lo) * 255 / range) | 0; d[i] = d[i + 1] = d[i + 2] = g; }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * @param {HTMLVideoElement} video  loaded video (metadata available)
 * @param {object} o { lang, interval, from, to, region:{x,y,w,h} (0..1), signal, onProgress({done,total,t,text}) }
 */
export async function runOCR(video, o) {
  const { lang = 'vie', interval = 1, from = 0, to = video.duration, region = { x: 0, y: 0.7, w: 1, h: 0.3 }, signal, onProgress } = o;
  if (!video.videoWidth) throw new Error('Video chưa sẵn sàng hoặc không có hình ảnh.');
  if (!(interval >= 0.25)) throw new Error('Tần suất lấy mẫu tối thiểu 0.25 giây.');
  const end = Math.min(to, video.duration);
  if (!(end > from)) throw new Error('Khoảng thời gian không hợp lệ.');

  const Tesseract = (await loadTesseract()).default || (await loadTesseract());
  const worker = await Tesseract.createWorker(lang, 1, {});
  const samples = [];
  const times = [];
  for (let t = from; t < end; t += interval) times.push(+t.toFixed(3));
  try {
    video.pause();
    for (let i = 0; i < times.length; i++) {
      if (signal?.aborted) throw Object.assign(new Error('Đã hủy'), { name: 'AbortError' });
      const t = times[i];
      await seekTo(video, Math.min(t, video.duration - 0.05));
      const canvas = frameToCanvas(video, region);
      const { data } = await worker.recognize(canvas);
      samples.push({ t, text: data.text, conf: data.text.trim() ? data.confidence : null });
      onProgress?.({ done: i + 1, total: times.length, t, text: data.text.trim() });
    }
  } finally {
    await worker.terminate().catch(() => {});
  }
  const { cues, warnings } = buildCuesFromSamples(samples, { interval, duration: video.duration });
  return { cues, warnings, samples };
}
