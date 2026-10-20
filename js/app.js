import { register, start } from './router.js';
import { mountDashboard } from './modules/dashboard.js';
import { mountWorkspace } from './modules/workspace.js';
import { mountSettings } from './modules/settings.js';
import { placeholder } from './modules/placeholder.js';
import { mountSubtitles } from './modules/subtitles.js';
import { state } from './state.js';

register('dashboard', mountDashboard);
register('workspace', mountWorkspace);
register('settings', mountSettings);
register('script', placeholder('Script Studio', 'Giai đoạn 3', 'Chưa có bộ soạn kịch bản.'));
register('subtitles', mountSubtitles);
register('voice', placeholder('Voice Studio', 'Giai đoạn 3', 'Chưa có TTS hoặc nhập giọng đọc.'));
register('aimedia', placeholder('AI Media Studio', 'Giai đoạn 5', 'Chưa có adapter tạo ảnh/video.'));
register('auto', placeholder('Auto Editor', 'Giai đoạn 4', 'Chưa có pipeline dựng tự động.'));
register('timeline', placeholder('Timeline Editor', 'Giai đoạn 3', 'Chưa có timeline.'));
register('export', placeholder('Export Center', 'Giai đoạn 4', 'Chưa có FFmpeg.wasm nên chưa xuất được video.'));

const outlet = document.getElementById('view');
const nav = document.getElementById('nav');
start(outlet, name => {
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + name));
  document.getElementById('projname').textContent = state.project ? state.project.name : '';
});

window.addEventListener('error', e => console.error(e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error(e.reason));
