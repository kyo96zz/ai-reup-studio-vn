// IndexedDB wrapper: projects (metadata + timeline) and media blobs stored separately.
const DB_NAME = 'ai-reup-studio';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new DOMException('Transaction aborted', 'AbortError'));
  }));
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isQuotaError(e) {
  return e && (e.name === 'QuotaExceededError' || e.code === 22);
}

export const db = {
  saveProject: p => tx('projects', 'readwrite', s => wrap(s.put(p))),
  getProject: id => tx('projects', 'readonly', s => wrap(s.get(id))),
  listProjects: () => tx('projects', 'readonly', s => wrap(s.getAll())),
  async deleteProject(id) {
    const items = await db.listMedia(id);
    await tx('media', 'readwrite', s => Promise.all(items.map(m => wrap(s.delete(m.id)))));
    await tx('projects', 'readwrite', s => wrap(s.delete(id)));
  },
  saveMedia: m => tx('media', 'readwrite', s => wrap(s.put(m))),
  getMedia: id => tx('media', 'readonly', s => wrap(s.get(id))),
  listMedia: projectId => tx('media', 'readonly', s => wrap(s.index('projectId').getAll(projectId))),
  deleteMedia: id => tx('media', 'readwrite', s => wrap(s.delete(id))),
  getSetting: async key => (await tx('settings', 'readonly', s => wrap(s.get(key))))?.value,
  setSetting: (key, value) => tx('settings', 'readwrite', s => wrap(s.put({ key, value }))),
  async estimate() {
    if (navigator.storage?.estimate) return navigator.storage.estimate();
    return null;
  },
};
