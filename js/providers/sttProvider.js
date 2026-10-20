// Speech-to-text via a user-configured OpenAI-compatible endpoint (POST multipart to .../audio/transcriptions).
// No local model is bundled and none is assumed. If nothing is configured, callers must show the "not configured" state.
import { db } from '../storage/db.js';
import { decodeToMono16k, chunkWav } from '../media/audioExtract.js';
import { cueId } from '../utils/subtitleEngine.js';

export async function getSttConfig() {
  const p = (await db.getSetting('providers')) || {};
  return { endpoint: p.sttEndpoint || '', key: p.sttKey || '', backend: p.backendUrl || '' };
}

export const isConfigured = cfg => !!cfg.endpoint;

export function parseTranscription(json, offset = 0) {
  // verbose_json: { segments: [{start,end,text,avg_logprob?}], words?: [...] }
  if (Array.isArray(json?.segments) && json.segments.length) {
    return json.segments.map(s => ({
      id: cueId(), start: offset + s.start, end: offset + s.end, text: String(s.text || '').trim(), source: 'stt',
      confidence: typeof s.avg_logprob === 'number' ? Math.round(Math.exp(s.avg_logprob) * 100) : undefined,
    })).filter(c => c.text);
  }
  return null; // endpoint gave plain text only, no timestamps
}

/**
 * @param {Blob} mediaBlob video/audio file
 * @param {object} o { lang, signal, onProgress({stage, done, total}), model }
 * Returns { cues, hasTimestamps, rawText }
 */
export async function runSTT(mediaBlob, o = {}) {
  const { lang, signal, onProgress, model = 'whisper-1' } = o;
  const cfg = await getSttConfig();
  if (!isConfigured(cfg)) throw Object.assign(new Error('Chưa cấu hình Speech-to-Text. Vào Cài đặt để nhập endpoint, hoặc nhập lời thoại thủ công.'), { code: 'NOT_CONFIGURED' });

  onProgress?.({ stage: 'decode' });
  const audio = await decodeToMono16k(mediaBlob);
  if (audio.silent) throw Object.assign(new Error('Video không có âm thanh hoặc âm thanh im lặng.'), { code: 'NO_AUDIO' });
  const chunks = chunkWav(audio, 300);
  const cues = [];
  let rawText = '';
  let hasTimestamps = true;
  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw Object.assign(new Error('Đã hủy'), { name: 'AbortError' });
    onProgress?.({ stage: 'transcribe', done: i, total: chunks.length });
    const fd = new FormData();
    fd.append('file', chunks[i].blob, `chunk${i}.wav`);
    fd.append('model', model);
    fd.append('response_format', 'verbose_json');
    if (lang) fd.append('language', lang);
    let res;
    try {
      res = await fetch(cfg.endpoint, { method: 'POST', body: fd, signal, headers: cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {} });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('Không gọi được endpoint STT (mạng hoặc CORS chặn). Dùng backend proxy nếu endpoint không cho phép gọi từ trình duyệt.');
    }
    if (!res.ok) throw new Error(`Endpoint STT trả về HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json().catch(() => null);
    if (!json) throw new Error('Phản hồi STT không phải JSON.');
    const parsed = parseTranscription(json, chunks[i].offset);
    if (parsed) cues.push(...parsed);
    else { hasTimestamps = false; rawText += (json.text || '') + '\n'; }
  }
  onProgress?.({ stage: 'done', done: chunks.length, total: chunks.length });
  return { cues, hasTimestamps, rawText: rawText.trim(), duration: audio.duration };
}
