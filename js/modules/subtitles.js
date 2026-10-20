// Subtitle Extractor + editor: OCR, Speech-to-Text, Hybrid, manual import, editing, SRT/VTT/JSON export.
import { h, toast, download, fmtTime } from '../utils/dom.js';
import { state, touch } from '../state.js';
import * as S from '../utils/subtitleEngine.js';
import { runOCR, OCR_LANGS } from '../providers/ocrProvider.js';
import { runSTT, getSttConfig, isConfigured } from '../providers/sttProvider.js';

let url = null;

export async function mountSubtitles(root) {
  if (!state.project) { root.append(h('div', { class: 'notice' }, 'Chưa mở dự án. ', h('a', { href: '#/dashboard' }, 'Về Dashboard.'))); return; }
  const sub = state.project.subtitles;
  sub.ocr ||= []; sub.stt ||= []; sub.merged ||= [];
  sub.style ||= { size: 42, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', outline: true, position: 'bottom' };
  const videos = state.media.filter(m => m.kind === 'video');
  const textMedia = state.media.filter(m => ['srt', 'vtt', 'text'].includes(m.kind));

  const status = h('div', { class: 'muted', role: 'status' });
  const progress = h('progress', { max: 1, value: 0, hidden: true });
  const warnBox = h('div', { class: 'notice', hidden: true });
  const videoSel = h('select', {}, videos.length ? videos.map(v => h('option', { value: v.id }, v.name)) : h('option', { value: '' }, '(chưa có video trong dự án)'));
  const player = h('video', { controls: true, playsInline: true, class: 'subvideo' });
  const overlay = h('div', { class: 'suboverlay' });
  let abort = null;

  const currentMedia = () => videos.find(v => v.id === videoSel.value);
  function loadPlayer() {
    if (url) URL.revokeObjectURL(url);
    const m = currentMedia(); if (!m) { player.removeAttribute('src'); return; }
    url = URL.createObjectURL(m.blob); player.src = url;
  }
  videoSel.addEventListener('change', loadPlayer);
  loadPlayer();
  const duration = () => Number.isFinite(player.duration) ? player.duration : (currentMedia()?.meta?.duration ?? Infinity);

  // ---------- overlay preview ----------
  function styleOverlay() {
    const st = sub.style;
    Object.assign(overlay.style, { fontSize: st.size / 3 + 'px', color: st.color, background: st.bg,
      textShadow: st.outline ? '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000' : 'none',
      top: st.position === 'top' ? '6%' : st.position === 'middle' ? '45%' : 'auto', bottom: st.position === 'bottom' ? '6%' : 'auto' });
  }
  player.addEventListener('timeupdate', () => {
    const t = player.currentTime, c = sub.merged.find(c => t >= c.start && t < c.end);
    overlay.textContent = c ? c.text : ''; overlay.hidden = !c;
  });

  // ---------- progress helpers ----------
  const setBusy = (busy, text = '') => { runBtns.forEach(b => b.disabled = busy); cancelBtn.disabled = !busy; status.textContent = text; if (!busy) progress.hidden = true; };
  const cancelBtn = h('button', { class: 'btn', disabled: true, onclick: () => abort?.abort() }, 'Hủy');

  // ---------- OCR ----------
  const ocrLang = h('select', {}, OCR_LANGS.map(([v, l]) => h('option', { value: v }, l)));
  const ocrInt = h('input', { type: 'number', min: 0.25, step: 0.25, value: 1, title: 'Giây giữa các lần lấy mẫu' });
  const ocrFrom = h('input', { type: 'number', min: 0, step: 1, value: 0 });
  const ocrTo = h('input', { type: 'number', min: 0, step: 1, placeholder: 'hết video' });
  const ocrY = h('input', { type: 'number', min: 0, max: 95, value: 70 });
  const ocrH = h('input', { type: 'number', min: 5, max: 100, value: 30 });

  async function doOCR() {
    if (!currentMedia()) throw new Error('Chọn một video trước.');
    if (!player.videoWidth) await new Promise(r => player.addEventListener('loadeddata', r, { once: true }));
    abort = new AbortController(); setBusy(true, 'Đang tải Tesseract.js và dữ liệu ngôn ngữ…');
    progress.hidden = false; progress.removeAttribute('value');
    const y = +ocrY.value / 100, hh = Math.min(+ocrH.value / 100, 1 - y);
    const res = await runOCR(player, {
      lang: ocrLang.value, interval: +ocrInt.value, from: +ocrFrom.value || 0, to: ocrTo.value ? +ocrTo.value : player.duration,
      region: { x: 0, y, w: 1, h: hh }, signal: abort.signal,
      onProgress: p => { progress.max = p.total; progress.value = p.done; status.textContent = `OCR ${p.done}/${p.total} khung (t=${p.t.toFixed(1)}s)${p.text ? ': ' + p.text.slice(0, 40) : ''}`; },
    });
    sub.ocr = res.cues; touch();
    showWarnings(res.warnings);
    return res.cues.length;
  }

  // ---------- STT ----------
  const sttLang = h('input', { type: 'text', placeholder: 'mã ngôn ngữ, ví dụ vi, en (tùy chọn)', maxLength: 8 });
  async function doSTT() {
    const m = currentMedia(); if (!m) throw new Error('Chọn một video trước.');
    const cfg = await getSttConfig();
    if (!isConfigured(cfg)) throw new Error('Chưa cấu hình Speech-to-Text. Vào Cài đặt, hoặc dùng nhập thủ công bên dưới.');
    let host; try { host = new URL(cfg.endpoint).host; } catch { throw new Error('Endpoint STT trong Cài đặt không hợp lệ.'); }
    if (!confirm(`Âm thanh của video "${m.name}" sẽ được gửi tới ${host}. Bạn có quyền sử dụng nội dung này và đồng ý gửi?`)) throw Object.assign(new Error('Đã hủy'), { name: 'AbortError' });
    abort = new AbortController(); setBusy(true, 'Đang giải mã âm thanh…'); progress.hidden = false; progress.removeAttribute('value');
    const res = await runSTT(m.blob, { lang: sttLang.value.trim() || undefined, signal: abort.signal,
      onProgress: p => { if (p.stage === 'transcribe') { progress.max = p.total; progress.value = p.done; status.textContent = `STT: đoạn ${p.done + 1}/${p.total}`; } } });
    if (!res.hasTimestamps) {
      showWarnings([`Endpoint chỉ trả văn bản, không có timestamp. Văn bản đã được đặt vào ô nhập thủ công để bạn gán thời gian.`]);
      manualText.value = res.rawText;
    }
    sub.stt = S.clampToDuration(res.cues, res.duration); touch();
    return sub.stt.length;
  }

  function showWarnings(list) { warnBox.hidden = !list?.length; warnBox.replaceChildren(...(list || []).map(w => h('div', {}, w))); }

  async function run(kind) {
    showWarnings([]);
    try {
      let msg = '';
      if (kind === 'ocr' || kind === 'hybrid') msg += `OCR: ${await doOCR()} cue. `;
      if (kind === 'stt' || kind === 'hybrid') msg += `STT: ${await doSTT()} cue. `;
      if (kind === 'hybrid') compareView();
      setBusy(false, msg + 'Kết quả OCR/STT được giữ riêng; dùng bảng bên dưới để đưa vào bản chỉnh sửa.');
      renderSources();
    } catch (e) {
      setBusy(false, '');
      if (e.name === 'AbortError') toast('Đã hủy'); else { toast(e.message, 'error'); status.textContent = 'Lỗi: ' + e.message; }
    }
  }
  const runBtns = [
    h('button', { class: 'btn primary', onclick: () => run('ocr') }, 'Chạy OCR'),
    h('button', { class: 'btn primary', onclick: () => run('stt') }, 'Chạy STT'),
    h('button', { class: 'btn primary', onclick: () => run('hybrid') }, 'Chạy Hybrid (OCR rồi STT)'),
  ];

  // ---------- sources + hybrid comparison ----------
  const sourcesBox = h('div');
  function addToMerged(cues) {
    const ids = new Set(sub.merged.map(c => c.id));
    for (const c of cues) sub.merged.push(ids.has(c.id) ? { ...c, id: S.cueId() } : { ...c });
    sub.merged = S.sorted(sub.merged); touch(); renderEditor();
  }
  function renderSources() {
    sourcesBox.replaceChildren();
    const rows = S.compareSources(sub.ocr, sub.stt);
    sourcesBox.append(h('p', { class: 'muted' }, `Bản gốc: OCR ${sub.ocr.length} cue · STT ${sub.stt.length} cue (không bị ghi đè khi chỉnh sửa).`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: !sub.ocr.length, onclick: () => addToMerged(sub.ocr) }, 'Đưa toàn bộ OCR vào bản chỉnh sửa'),
        h('button', { class: 'btn', disabled: !sub.stt.length, onclick: () => addToMerged(sub.stt) }, 'Đưa toàn bộ STT vào bản chỉnh sửa')));
    if (!sub.ocr.length || !sub.stt.length) return;
    const label = { match: 'Khớp nhau', 'ocr-only': 'Chỉ có OCR', 'stt-only': 'Chỉ có STT', review: 'Cần kiểm tra' };
    const tbl = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Trạng thái', 'OCR (chữ trên hình)', 'STT (lời nói)', 'Chọn'].map(t => h('th', {}, t)))));
    const body = h('tbody');
    for (const r of rows) {
      const cell = c => h('td', {}, c ? [h('div', { class: 'muted' }, `${fmtTime(c.start)}–${fmtTime(c.end)}`), c.text] : '—');
      body.append(h('tr', { class: 'st-' + r.status },
        h('td', {}, label[r.status] + (r.ocr && r.stt ? ` (${Math.round(r.similarity * 100)}%)` : '')), cell(r.ocr), cell(r.stt),
        h('td', {}, h('div', { class: 'row' },
          r.ocr ? h('button', { class: 'btn small', onclick: () => addToMerged([r.ocr]) }, 'Dùng OCR') : null,
          r.stt ? h('button', { class: 'btn small', onclick: () => addToMerged([r.stt]) }, 'Dùng STT') : null))));
    }
    tbl.append(body);
    sourcesBox.append(h('h3', {}, 'Đối chiếu Hybrid'),
      h('p', { class: 'muted' }, 'Chữ trên hình có thể là bản dịch hoặc tóm tắt nên khác lời nói. Hệ thống không tự chọn thay bạn.'), tbl);
  }
  const compareView = renderSources;

  // ---------- manual / import ----------
  const manualText = h('textarea', { rows: 6, placeholder: 'Dán nội dung SRT/VTT, hoặc mỗi dòng một câu (sẽ chia đều thời gian — ước lượng)…' });
  function importManual() {
    const t = manualText.value.trim(); if (!t) return;
    let cues = /-->/.test(t) ? S.parseSRT(t) : [];
    if (!cues.length) {
      const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean), d = duration();
      if (!Number.isFinite(d)) { toast('Cần video đã tải để biết thời lượng khi chia đều thời gian.', 'warn'); return; }
      const step = d / lines.length;
      cues = lines.map((text, i) => ({ id: S.cueId(), start: i * step, end: (i + 1) * step, text, source: 'manual', estimated: true }));
      toast('Thời gian được chia đều (ước lượng) — hãy chỉnh lại.', 'warn');
    }
    addToMerged(cues); manualText.value = '';
  }
  const fileIn = h('input', { type: 'file', accept: '.srt,.vtt', hidden: true, onchange: async () => {
    const f = fileIn.files[0]; if (!f) return; const t = await f.text();
    const cues = /\.vtt$/i.test(f.name) ? S.parseVTT(t) : S.parseSRT(t);
    if (!cues.length) toast('Không đọc được cue nào từ tệp.', 'error'); else addToMerged(cues);
    fileIn.value = '';
  } });

  // ---------- editor ----------
  const editorBox = h('div');
  function renderEditor() {
    editorBox.replaceChildren();
    const d = duration();
    const checks = S.validate(sub.merged, d);
    const bad = checks.filter(c => c.problems.length).length;
    editorBox.append(h('div', { class: 'row' },
      h('strong', {}, `Bản chỉnh sửa: ${sub.merged.length} cue`), bad ? h('span', { class: 'error' }, `${bad} cue có lỗi`) : null,
      h('button', { class: 'btn small', onclick: () => { sub.merged.push({ id: S.cueId(), start: player.currentTime || 0, end: (player.currentTime || 0) + 2, text: 'Văn bản mới', source: 'manual' }); sub.merged = S.sorted(sub.merged); touch(); renderEditor(); } }, 'Thêm cue tại playhead'),
      h('button', { class: 'btn small', onclick: () => { sub.merged = S.clampToDuration(sub.merged, d); touch(); renderEditor(); } }, 'Cắt cue vượt thời lượng'),
      h('button', { class: 'btn small danger', onclick: () => { if (confirm('Xóa toàn bộ bản chỉnh sửa? (Bản gốc OCR/STT vẫn giữ)')) { sub.merged = []; touch(); renderEditor(); } } }, 'Xóa hết')));
    const body = h('div', { class: 'cues' });
    sub.merged.forEach((c, i) => {
      const prob = checks[i].problems;
      const uncertain = c.estimated || (c.confidence != null && c.confidence < 60);
      const num = (key) => h('input', { type: 'number', step: 0.1, min: 0, value: +c[key].toFixed(2), class: 'tin', onchange: e => { c[key] = +e.target.value; touch(); renderEditor(); } });
      body.append(h('div', { class: 'cue' + (prob.length ? ' bad' : '') },
        h('div', { class: 'row' }, h('button', { class: 'btn small', title: 'Nhảy tới', onclick: () => { player.currentTime = c.start; } }, '▶'),
          num('start'), '→', num('end'), h('span', { class: 'muted' }, c.source),
          uncertain ? h('span', { class: 'warn', title: c.estimated ? 'Thời gian chỉ là ước lượng từ lấy mẫu thưa' : 'Độ tin cậy thấp' }, '⚠ chưa chắc chắn') : null,
          c.confidence != null ? h('span', { class: 'muted' }, `${Math.round(c.confidence)}%`) : null),
        h('textarea', { rows: 2, value: c.text, oninput: e => { c.text = e.target.value; touch(); } }),
        prob.length ? h('div', { class: 'error' }, prob.join('; ')) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => { try { sub.merged.splice(i, 1, ...S.splitCue(c, player.currentTime)); touch(); renderEditor(); } catch (e) { toast(e.message, 'warn'); } } }, 'Tách tại playhead'),
          h('button', { class: 'btn small', disabled: i === sub.merged.length - 1, onclick: () => { sub.merged.splice(i, 2, S.mergeCues(c, sub.merged[i + 1])); touch(); renderEditor(); } }, 'Gộp với dòng sau'),
          h('button', { class: 'btn small danger', onclick: () => { sub.merged.splice(i, 1); touch(); renderEditor(); } }, 'Xóa'))));
    });
    editorBox.append(body);
  }

  // ---------- export ----------
  function exportAs(kind) {
    const cues = sub.merged;
    if (!cues.length) { toast('Chưa có cue nào để xuất.', 'warn'); return; }
    const bad = S.validate(cues, duration()).filter(c => c.problems.length);
    if (bad.length && !confirm(`${bad.length} cue có lỗi (thời gian/nội dung). Vẫn xuất?`)) return;
    const name = (state.project.name || 'subtitles').replace(/[^\p{L}\p{N}_-]+/gu, '_');
    if (kind === 'srt') download(new Blob([S.toSRT(cues)], { type: 'application/x-subrip' }), name + '.srt');
    if (kind === 'vtt') download(new Blob([S.toVTT(cues)], { type: 'text/vtt' }), name + '.vtt');
    if (kind === 'json') download(new Blob([JSON.stringify({ ocr: sub.ocr, stt: sub.stt, merged: cues }, null, 2)], { type: 'application/json' }), name + '.subtitles.json');
  }

  // ---------- style ----------
  const styleRow = h('div', { class: 'row' },
    h('label', {}, 'Cỡ chữ ', h('input', { type: 'number', min: 16, max: 120, value: sub.style.size, class: 'tin', onchange: e => { sub.style.size = +e.target.value; touch(); styleOverlay(); } })),
    h('label', {}, 'Màu ', h('input', { type: 'color', value: sub.style.color, onchange: e => { sub.style.color = e.target.value; touch(); styleOverlay(); } })),
    h('label', {}, 'Nền ', h('select', { onchange: e => { sub.style.bg = e.target.value; touch(); styleOverlay(); } },
      [['rgba(0,0,0,0.55)', 'Mờ đen'], ['transparent', 'Không nền'], ['#000000', 'Đen đặc']].map(([v, l]) => h('option', { value: v, selected: sub.style.bg === v }, l)))),
    h('label', {}, h('input', { type: 'checkbox', checked: sub.style.outline, onchange: e => { sub.style.outline = e.target.checked; touch(); styleOverlay(); } }), ' Viền'),
    h('label', {}, 'Vị trí ', h('select', { onchange: e => { sub.style.position = e.target.value; touch(); styleOverlay(); } },
      [['bottom', 'Dưới'], ['middle', 'Giữa'], ['top', 'Trên']].map(([v, l]) => h('option', { value: v, selected: sub.style.position === v }, l)))),
    h('span', { class: 'muted' }, 'Chỉ xem trước tại đây; nhúng vào video thuộc Giai đoạn 4 (chưa triển khai).'));

  const f = (label, el) => h('label', { class: 'fld' }, label, el);
  root.append(
    h('h2', {}, 'Subtitle Extractor'),
    h('div', { class: 'row' }, f('Video ', videoSel)),
    h('div', { class: 'split' },
      h('div', {},
        h('div', { class: 'videowrap' }, player, overlay),
        h('h3', {}, 'OCR (chữ cứng trên hình)'),
        h('div', { class: 'row' }, f('Ngôn ngữ ', ocrLang), f('Mỗi (giây) ', ocrInt), f('Từ (s) ', ocrFrom), f('Đến (s) ', ocrTo)),
        h('div', { class: 'row' }, f('Vùng quét: từ ', ocrY), f('% chiều cao, cao ', ocrH), h('span', { class: 'muted' }, '% (mặc định: 30% dưới cùng)')),
        h('p', { class: 'muted' }, 'OCR tải Tesseract.js và dữ liệu ngôn ngữ từ CDN lần đầu. Thời gian cue là ước lượng (±một khoảng lấy mẫu).'),
        h('h3', {}, 'Speech-to-Text'),
        h('div', { class: 'row' }, f('Ngôn ngữ ', sttLang)),
        h('p', { class: 'muted' }, 'Cần endpoint STT tương thích OpenAI trong Cài đặt. Âm thanh chỉ được gửi sau khi bạn xác nhận.'),
        h('div', { class: 'row' }, ...runBtns, cancelBtn), progress, status, warnBox),
      h('div', {}, h('h3', {}, 'Nhập thủ công / từ tệp'), manualText,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: importManual }, 'Thêm vào bản chỉnh sửa'),
          h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Nhập SRT/VTT'), fileIn,
          ...textMedia.filter(m => m.kind !== 'text').map(m => h('button', { class: 'btn small', onclick: () => addToMerged(m.kind === 'vtt' ? S.parseVTT(m.meta.text) : S.parseSRT(m.meta.text)) }, `Từ thư viện: ${m.name}`))),
        h('h3', {}, 'Kiểu hiển thị'), styleRow)),
    sourcesBox,
    h('h3', {}, 'Chỉnh sửa phụ đề'), editorBox,
    h('div', { class: 'row' }, ...['srt', 'vtt', 'json'].map(k => h('button', { class: 'btn primary', onclick: () => exportAs(k) }, 'Xuất ' + k.toUpperCase()))));
  styleOverlay(); renderSources(); renderEditor();
}
