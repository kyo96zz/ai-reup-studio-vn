// Media import: validation, metadata probing (real, via browser elements), storage.
import { db, isQuotaError } from '../storage/db.js';
import { state, uid, touch, emit } from '../state.js';

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB soft cap

export function classify(file) {
  const name = file.name.toLowerCase();
  const t = file.type || '';
  if (t.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/.test(name)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/.test(name)) return 'audio';
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)) return 'image';
  if (/\.srt$/.test(name)) return 'srt';
  if (/\.vtt$/.test(name)) return 'vtt';
  if (/\.txt$/.test(name)) return 'text';
  if (/\.json$/.test(name)) return 'json';
  return null;
}

function probe(kind, blob) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const done = info => { URL.revokeObjectURL(url); resolve(info); };
    if (kind === 'video' || kind === 'audio') {
      const el = document.createElement(kind);
      el.preload = 'metadata';
      el.onloadedmetadata = () => done({
        duration: Number.isFinite(el.duration) ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      });
      el.onerror = () => done({ error: 'Trình duyệt không đọc được tệp này (codec không hỗ trợ?)' });
      el.src = url;
    } else if (kind === 'image') {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => done({ error: 'Không đọc được ảnh' });
      img.src = url;
    } else done({});
  });
}

export async function importFiles(files, onStatus = () => {}) {
  const results = [];
  for (const file of files) {
    const kind = classify(file);
    if (!kind) { results.push({ name: file.name, ok: false, error: 'Định dạng không được hỗ trợ' }); continue; }
    if (file.size > MAX_BYTES) { results.push({ name: file.name, ok: false, error: 'Tệp quá lớn (>2 GB)' }); continue; }
    onStatus(`Đang xử lý ${file.name}...`);
    try {
      if (kind === 'json') {
        const text = await file.text();
        results.push({ name: file.name, ok: true, kind, json: JSON.parse(text) });
        continue;
      }
      if (kind === 'srt' || kind === 'vtt' || kind === 'text') {
        const text = await file.text();
        const rec = await store(kind, file, { text });
        results.push({ name: file.name, ok: true, kind, record: rec });
        continue;
      }
      const meta = await probe(kind, file);
      const rec = await store(kind, file, meta);
      results.push({ name: file.name, ok: !meta.error, kind, record: rec, error: meta.error });
    } catch (e) {
      results.push({ name: file.name, ok: false, error: isQuotaError(e) ? 'Hết dung lượng lưu trữ trình duyệt' : (e.message || String(e)) });
    }
  }
  return results;
}

async function store(kind, file, meta) {
  const rec = {
    id: uid('media'),
    projectId: state.project.id,
    kind,
    name: file.name,
    size: file.size,
    mime: file.type,
    addedAt: Date.now(),
    meta,
    blob: file,
  };
  await db.saveMedia(rec);
  state.media.push(rec);
  touch();
  emit('media');
  return rec;
}

export async function removeMedia(id) {
  await db.deleteMedia(id);
  state.media = state.media.filter(m => m.id !== id);
  // detach clips that use it
  for (const tr of state.project.timeline.tracks) tr.clips = tr.clips.filter(c => c.mediaId !== id);
  touch();
  emit('media');
}

export async function importFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('URL không hợp lệ'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Chỉ hỗ trợ http/https');
  let res;
  try { res = await fetch(u.href); }
  catch { throw new Error('Không tải được: nguồn chặn CORS hoặc không truy cập được. Hãy tải tệp về rồi nhập từ thiết bị.'); }
  if (!res.ok) throw new Error(`Máy chủ trả về HTTP ${res.status}`);
  const blob = await res.blob();
  const name = decodeURIComponent(u.pathname.split('/').pop() || 'remote-file');
  const file = new File([blob], name, { type: blob.type });
  return importFiles([file]);
}
