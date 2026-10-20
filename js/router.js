// Minimal hash router: #/dashboard, #/workspace, #/<module>
const routes = new Map();
let current = null;

export function register(name, mount) { routes.set(name, mount); }

export function go(name) { location.hash = '#/' + name; }

export function currentRoute() { return current; }

export function start(outlet, onChange) {
  const render = () => {
    const name = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
    const mount = routes.get(name) || routes.get('dashboard');
    current = routes.has(name) ? name : 'dashboard';
    outlet.replaceChildren();
    mount(outlet);
    onChange?.(current);
  };
  addEventListener('hashchange', render);
  render();
  return render;
}
