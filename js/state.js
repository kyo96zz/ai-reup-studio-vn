// Single source of truth for the open project + tiny pub/sub.
import { db, isQuotaError } from './storage/db.js';

const listeners = new Set();
let saveTimer = null;

export const state = {
  project: null,       // current project object (metadata, script, subtitles, timeline, settings)
  media: [],           // media records of current project (with blobs)
  saveStatus: 'idle',  // idle | saving | saved | error
  lastError: null,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(reason = '') { listeners.forEach(fn => { try { fn(state, reason); } catch (e) { console.error(e); } }); }

export function uid(prefix = 'id') {
  const r = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${r}`;
}

export function newProject(name) {
  const now = Date.now();
  return {
    id: uid('proj'),
    name: name || 'Dự án mới',
    createdAt: now,
    updatedAt: now,
    aspect: '9:16',
    script: { original: '', summary: '', rewritten: '', scenes: [], cta: '' },
    subtitles: { ocr: [], stt: [], merged: [], style: { size: 42, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', outline: true, position: 'bottom' } },
    timeline: { duration: 0, tracks: [
      { id: 'video', name: 'Video', enabled: true, clips: [] },
      { id: 'image', name: 'Ảnh', enabled: true, clips: [] },
      { id: 'voice', name: 'Giọng đọc', enabled: true, clips: [] },
      { id: 'music', name: 'Nhạc nền', enabled: true, clips: [] },
      { id: 'subtitle', name: 'Phụ đề', enabled: true, clips: [] },
    ] },
  };
}

export async function openProject(id) {
  const p = await db.getProject(id);
  if (!p) throw new Error('Không tìm thấy dự án');
  state.project = p;
  state.media = await db.listMedia(id);
  state.saveStatus = 'saved';
  emit('open');
}

export function closeProject() { state.project = null; state.media = []; emit('close'); }

// Debounced autosave of project metadata (media blobs are saved on import).
export function touch() {
  if (!state.project) return;
  state.project.updatedAt = Date.now();
  state.saveStatus = 'saving';
  emit('touch');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}

export async function saveNow() {
  if (!state.project) return;
  try {
    await db.saveProject(state.project);
    state.saveStatus = 'saved';
    state.lastError = null;
  } catch (e) {
    state.saveStatus = 'error';
    state.lastError = isQuotaError(e)
      ? 'Hết dung lượng lưu trữ của trình duyệt. Hãy xóa bớt media hoặc dự án cũ.'
      : 'Không thể lưu dự án: ' + (e.message || e);
  }
  emit('saved');
}
