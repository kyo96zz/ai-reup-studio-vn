// Workspace: Media Library + Preview Player (phase 1 version: previews a single selected media item).
import { h, fmtBytes, fmtTime, toast, download } from '../utils/dom.js';
import { state, subscribe, touch, saveNow } from '../state.js';
import { importFiles, importFromUrl, removeMedia } from '../media/importer.js';
import { exportProject } from '../storage/projectIO.js';
import { go } from '../router.js';

let objectUrl = null;

export function mountWorkspace(root) {
  if (!state.project) {
    root.append(h('div', { class: 'notice' }, 'Chưa mở dự án. ', h('a', { href: '#/dashboard' }, 'Về Dashboard để tạo hoặc mở dự án.')));
    return;
  }
  const p = state.project;
  const status = h('span', { class: 'muted' });
  const lib = h('div', { class: 'library' });
  const stage = h('div', { class: 'stage' });
  const info = h('div', { class: 'muted' });
  const nameInput = h('input', { type: 'text', value: p.name, maxLength: 80, onchange: e => { p.name = e.target.value.trim() || 'Dự án'; touch(); } });
  const aspectSel = h('select', { onchange: e => { p.aspect = e.target.value; touch(); applyAspect(); } },
    h('option', { value: '9:16', selected: p.aspect === '9:16' }, '9:16 (dọc)'),
    h('option', { value: '16:9', selected: p.aspect === '16:9' }, '16:9 (ngang)'));
  let selected = null;

  function applyAspect() { stage.style.aspectRatio = p.aspect === '9:16' ? '9 / 16' : '16 / 9'; }

  function select(m) {
    selected = m;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    stage.replaceChildren();
    info.textContent = '';
    if (!m.blob || !['video', 'audio', 'image'].includes(m.kind)) {
      stage.append(h('p', { class: 'muted pad' }, 'Tệp này không có bản xem trước (phụ đề/văn bản dùng ở module khác).'));
      return;
    }
    objectUrl = URL.createObjectURL(m.blob);
    const el = m.kind === 'image' ? h('img', { src: objectUrl, alt: m.name })
      : h(m.kind, { src: objectUrl, controls: true, playsInline: true });
    el.addEventListener('error', () => { stage.replaceChildren(h('p', { class: 'error pad' }, 'Trình duyệt không phát được tệp này (codec không được hỗ trợ).')); });
    stage.append(el);
    const mt = m.meta || {};
    info.textContent = [m.name, fmtBytes(m.size), mt.duration ? fmtTime(mt.duration) : null, mt.width ? `${mt.width}×${mt.height}` : null].filter(Boolean).join(' · ');
    renderLib();
  }

  function renderLib() {
    lib.replaceChildren();
    if (!state.media.length) lib.append(h('p', { class: 'muted' }, 'Chưa có media. Kéo thả tệp vào đây hoặc dùng nút Nhập tệp.'));
    for (const m of state.media) {
      const mt = m.meta || {};
      lib.append(h('div', { class: 'item' + (selected?.id === m.id ? ' active' : '') },
        h('button', { class: 'itembody', onclick: () => select(m) },
          h('strong', {}, m.name),
          h('span', { class: 'muted' }, `${m.kind} · ${fmtBytes(m.size)}${mt.duration ? ' · ' + fmtTime(mt.duration) : ''}${mt.width ? ` · ${mt.width}×${mt.height}` : ''}`),
          mt.error ? h('span', { class: 'error' }, mt.error) : null),
        h('button', { class: 'btn small danger', title: 'Xóa media', onclick: async () => {
          if (!confirm(`Xóa "${m.name}" khỏi dự án?`)) return;
          await removeMedia(m.id); if (selected?.id === m.id) { selected = null; stage.replaceChildren(); } renderLib();
        } }, 'Xóa')));
    }
  }

  async function doImport(files) {
    const res = await importFiles(files, s => status.textContent = s);
    status.textContent = '';
    for (const r of res) {
      if (r.kind === 'json') toast(`${r.name}: để nhập dự án, dùng Dashboard → Nhập dự án.`, 'warn');
      else if (!r.ok) toast(`${r.name}: ${r.error}`, 'error');
    }
    renderLib();
  }

  const fileInput = h('input', { type: 'file', multiple: true, hidden: true,
    accept: 'video/*,audio/*,image/*,.srt,.vtt,.txt,.json', onchange: () => { doImport([...fileInput.files]); fileInput.value = ''; } });
  const urlInput = h('input', { type: 'url', placeholder: 'URL tệp media trực tiếp (cần cho phép CORS)' });
  const drop = h('div', { class: 'drop' }, 'Kéo thả video, âm thanh, ảnh, SRT/VTT, TXT vào đây');
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => doImport([...e.dataTransfer.files]));

  const saveInfo = h('span', { class: 'muted' });
  const unsub = subscribe(s => {
    if (!saveInfo.isConnected) { unsub(); return; }
    saveInfo.textContent = { saving: 'Đang lưu…', saved: 'Đã lưu', error: s.lastError || 'Lỗi lưu', idle: '' }[s.saveStatus];
    saveInfo.className = s.saveStatus === 'error' ? 'error' : 'muted';
  });

  root.append(
    h('div', { class: 'row' }, h('h2', {}, 'Workspace'), nameInput, aspectSel, saveInfo),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => fileInput.click() }, 'Nhập tệp'), fileInput,
      urlInput,
      h('button', { class: 'btn', onclick: async () => {
        try { status.textContent = 'Đang tải URL…'; const r = await importFromUrl(urlInput.value.trim()); status.textContent = ''; r.filter(x => !x.ok).forEach(x => toast(`${x.name}: ${x.error}`, 'error')); renderLib(); urlInput.value = ''; }
        catch (e) { status.textContent = ''; toast(e.message, 'error'); }
      } }, 'Nhập từ URL'),
      h('button', { class: 'btn', onclick: async () => { await saveNow(); download(await exportProject(false), `${p.name}.project.json`); toast('Đã xuất JSON (không kèm media).'); } }, 'Xuất JSON'),
      h('button', { class: 'btn', onclick: async () => {
        if (!confirm('Nhúng cả media vào JSON sẽ tạo tệp rất lớn và tốn RAM. Tiếp tục?')) return;
        try { download(await exportProject(true), `${p.name}.full.json`); } catch (e) { toast('Xuất thất bại: ' + e.message, 'error'); }
      } }, 'Xuất JSON + media'),
      status),
    drop,
    h('div', { class: 'split' },
      h('div', {}, h('h3', {}, 'Thư viện media'), lib),
      h('div', {}, h('h3', {}, 'Xem trước'), h('p', { class: 'muted' }, 'Hiện là xem trước từng tệp. Xem trước theo timeline sẽ có ở Giai đoạn 3 (chưa triển khai).'), stage, info)));
  applyAspect();
  renderLib();
}
