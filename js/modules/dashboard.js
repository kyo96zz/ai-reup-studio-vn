import { h, fmtDate, toast } from '../utils/dom.js';
import { db } from '../storage/db.js';
import { newProject, openProject, saveNow, state } from '../state.js';
import { importProjectJson } from '../storage/projectIO.js';
import { go } from '../router.js';

export async function mountDashboard(root) {
  const list = h('div', { class: 'grid' });
  const warn = h('div', { class: 'notice', hidden: true });
  const nameInput = h('input', { type: 'text', placeholder: 'Tên dự án', maxLength: 80 });
  const jsonInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });

  async function refresh() {
    list.replaceChildren();
    let projects = [];
    try { projects = (await db.listProjects()).sort((a, b) => b.updatedAt - a.updatedAt); }
    catch (e) { warn.hidden = false; warn.textContent = 'Không đọc được IndexedDB: ' + (e.message || e); return; }
    if (!projects.length) list.append(h('p', { class: 'muted' }, 'Chưa có dự án nào. Tạo dự án mới ở trên.'));
    for (const p of projects) {
      list.append(h('div', { class: 'card' },
        h('h3', {}, p.name),
        h('p', { class: 'muted' }, `Cập nhật: ${fmtDate(p.updatedAt)} · Tỷ lệ ${p.aspect}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: async () => { await openProject(p.id); go('workspace'); } }, 'Mở'),
          h('button', { class: 'btn danger', onclick: async () => {
            if (!confirm(`Xóa dự án "${p.name}" và toàn bộ media của nó? Không thể hoàn tác.`)) return;
            try { await db.deleteProject(p.id); if (state.project?.id === p.id) state.project = null; toast('Đã xóa dự án'); refresh(); }
            catch (e) { toast('Xóa thất bại: ' + e.message, 'error'); }
          } }, 'Xóa'))));
    }
    const est = await db.estimate();
    if (est?.quota) warn.hidden = false, warn.textContent = `Dung lượng trình duyệt: đã dùng ${(est.usage / 1048576).toFixed(0)} MB / ~${(est.quota / 1048576).toFixed(0)} MB. Dữ liệu có thể mất nếu bạn xóa dữ liệu trình duyệt — hãy xuất JSON để sao lưu.`;
  }

  jsonInput.addEventListener('change', async () => {
    const f = jsonInput.files[0]; if (!f) return;
    try {
      const { project, missingMedia } = await importProjectJson(JSON.parse(await f.text()));
      toast(missingMedia ? `Đã nhập dự án. ${missingMedia} tệp media không đi kèm trong JSON, cần nhập lại.` : 'Đã nhập dự án', missingMedia ? 'warn' : 'info');
      await openProject(project.id); go('workspace');
    } catch (e) { toast('Nhập thất bại: ' + e.message, 'error'); }
    jsonInput.value = '';
  });

  root.append(
    h('h2', {}, 'Dashboard'),
    h('p', { class: 'muted' }, 'AI Reup Studio — dùng với nội dung bạn sở hữu hoặc được cấp phép sử dụng.'),
    warn,
    h('div', { class: 'row' }, nameInput,
      h('button', { class: 'btn primary', onclick: async () => {
        const p = newProject(nameInput.value.trim());
        await db.saveProject(p); await openProject(p.id); go('workspace');
      } }, 'Tạo dự án'),
      h('button', { class: 'btn', onclick: () => jsonInput.click() }, 'Nhập dự án (JSON)'), jsonInput),
    h('h3', {}, 'Dự án gần đây'), list);
  refresh();
}
