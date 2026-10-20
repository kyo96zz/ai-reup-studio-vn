import { h, toast } from '../utils/dom.js';
import { db } from '../storage/db.js';

// Settings are stored locally in IndexedDB on this device only. API keys typed here never leave the browser
// except in requests the user triggers to the provider they configured. Providers arrive in later phases.
export async function mountSettings(root) {
  const saved = (await db.getSetting('providers')) || {};
  const field = (id, label, ph, type = 'text') => h('label', {}, label, h('input', { id, type, placeholder: ph, value: saved[id] || '', autocomplete: 'off' }));
  const ids = ['sttEndpoint', 'sttKey', 'ttsEndpoint', 'ttsKey', 'imageEndpoint', 'imageKey', 'backendUrl'];
  root.append(
    h('h2', {}, 'Cài đặt'),
    h('div', { class: 'notice' }, 'Các giá trị dưới đây chỉ lưu trong trình duyệt này (IndexedDB), chưa được dùng bởi module nào ở Giai đoạn 1. Không dùng khóa API quan trọng trên máy dùng chung; ưu tiên backend proxy riêng.'),
    h('div', { class: 'form' },
      field('sttEndpoint', 'STT endpoint (tùy chọn)', 'https://...'), field('sttKey', 'STT API key', '', 'password'),
      field('ttsEndpoint', 'TTS endpoint (tùy chọn)', 'https://...'), field('ttsKey', 'TTS API key', '', 'password'),
      field('imageEndpoint', 'Image endpoint (tùy chọn)', 'https://...'), field('imageKey', 'Image API key', '', 'password'),
      field('backendUrl', 'Backend proxy URL (tùy chọn)', 'https://...'),
      h('button', { class: 'btn primary', onclick: async () => {
        const v = {}; ids.forEach(i => v[i] = root.querySelector('#' + i).value.trim());
        await db.setSetting('providers', v); toast('Đã lưu cài đặt');
      } }, 'Lưu')));
}
