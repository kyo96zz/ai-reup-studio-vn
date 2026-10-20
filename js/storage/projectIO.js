// Export / import of project JSON. Media blobs are exported as base64 only when the user opts in
// (large videos make huge files), otherwise only metadata is exported.
import { db } from './db.js';
import { state, uid, newProject } from '../state.js';

const FORMAT = 'ai-reup-studio/project@1';

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportProject(includeMedia = false) {
  const p = state.project;
  const out = { format: FORMAT, exportedAt: new Date().toISOString(), project: p, media: [] };
  for (const m of state.media) {
    const { blob, ...rest } = m;
    const entry = { ...rest, embedded: false };
    if (includeMedia && blob) { entry.data = await blobToDataUrl(blob); entry.embedded = true; }
    out.media.push(entry);
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

export function validateProjectJson(j) {
  if (!j || j.format !== FORMAT) throw new Error('Không phải tệp dự án AI Reup Studio hợp lệ');
  const p = j.project;
  if (!p || typeof p.name !== 'string' || !p.timeline || !Array.isArray(p.timeline.tracks)) {
    throw new Error('Cấu trúc dự án không hợp lệ');
  }
  return true;
}

export async function importProjectJson(j) {
  validateProjectJson(j);
  const base = newProject(j.project.name);
  const project = { ...base, ...j.project, id: uid('proj'), updatedAt: Date.now() };
  const idMap = new Map();
  let missing = 0;
  for (const m of j.media || []) {
    if (!m.embedded || !m.data) { missing++; continue; }
    const blob = await (await fetch(m.data)).blob();
    const nid = uid('media');
    idMap.set(m.id, nid);
    const { data, embedded, ...rest } = m;
    await db.saveMedia({ ...rest, id: nid, projectId: project.id, blob });
  }
  for (const tr of project.timeline.tracks) {
    tr.clips = (tr.clips || []).filter(c => !c.mediaId || idMap.has(c.mediaId)).map(c => c.mediaId ? { ...c, mediaId: idMap.get(c.mediaId) } : c);
  }
  await db.saveProject(project);
  return { project, missingMedia: missing };
}
