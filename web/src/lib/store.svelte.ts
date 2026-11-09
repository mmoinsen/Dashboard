import { ApiError, get, put } from './api.ts';
import { reportError } from './report.ts';
import { applyTheme, findTheme } from './themes.ts';
import { autoPlace, type AppSettings, type Dashboard, type IntegrationInfo, type ServicePublic, type ServiceStatus, type UserPublic } from './types.ts';

interface AppState {
  phase: 'loading' | 'setup' | 'login' | 'ready';
  user: UserPublic | null;
  settings: AppSettings | null;
  integrations: IntegrationInfo[];
  services: ServicePublic[];
  status: Record<string, ServiceStatus>;
  dashboard: Dashboard | null;
  configError: string | null;
  editing: boolean;
  searchOpen: boolean;
  searchSeed: string;
  route: string;
}

export const app: AppState = $state({
  phase: 'loading',
  user: null,
  settings: null,
  integrations: [],
  services: [],
  status: {},
  dashboard: null,
  configError: null,
  editing: false,
  searchOpen: false,
  searchSeed: '',
  route: location.hash.slice(1) || '/',
});

window.addEventListener('hashchange', () => (app.route = location.hash.slice(1) || '/'));
window.addEventListener('kompass:unauthorized', () => {
  if (app.phase === 'ready') {
    app.phase = 'login';
    app.user = null;
  }
});

export function navigate(route: string) {
  location.hash = route;
}

export function integration(id: string): IntegrationInfo | undefined {
  return app.integrations.find((i) => i.id === id);
}

export function service(id: string): ServicePublic | undefined {
  return app.services.find((s) => s.id === id);
}

export function applyUserTheme() {
  const s = app.user?.settings;
  applyTheme(findTheme(s?.theme, s?.customThemes).tokens);
}

export async function boot() {
  try {
    const state = await get<{ setupRequired: boolean; user: UserPublic | null }>('/auth/state');
    if (state.setupRequired) {
      app.phase = 'setup';
      return;
    }
    if (!state.user) {
      app.phase = 'login';
      return;
    }
    await loadAll();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) reportError('Start der Oberfläche', e);
    app.phase = 'login';
  }
}

export async function loadAll() {
  const b = await get('/bootstrap');
  app.user = b.user;
  app.settings = b.settings;
  app.integrations = b.integrations;
  app.services = b.services;
  app.status = b.status;
  const { dashboard, changed } = migrateDashboard(b.dashboard);
  app.dashboard = dashboard;
  if (changed) saveDashboard();
  app.configError = b.configError;
  applyUserTheme();
  document.title = b.settings.title;
  app.phase = 'ready';
}

export async function refreshServices() {
  const [s, st] = await Promise.all([get('/services'), get('/services/status')]);
  app.services = s.services;
  app.configError = s.configError;
  app.status = st.status;
}

/**
 * Layout 2 = 12-column grid with free positions. Older dashboards (4 columns, no
 * positions) are converted once; widgets without a position get one.
 */
export function migrateDashboard(d: Dashboard): { dashboard: Dashboard; changed: boolean } {
  const legacy = d.layout !== 2;
  let changed = legacy;
  const pages = d.pages.map((p) => {
    const missing = p.widgets.some((w) => w.x == null || w.y == null);
    if (!legacy && !missing) return p;
    changed = true;
    return { ...p, widgets: autoPlace(p.widgets, legacy) };
  });
  return { dashboard: { ...d, layout: 2, pages }, changed };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Debounced save, so dragging widgets around does not hammer the server. */
export function saveDashboard() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!app.dashboard) return;
    put('/dashboard', { dashboard: $state.snapshot(app.dashboard) }).catch((e) => {
      toast(`Dashboard konnte nicht gespeichert werden: ${e.message}`, 'bad');
      if (!(e instanceof ApiError && e.status === 401)) reportError('Dashboard speichern', e);
    });
  }, 400);
}

export async function saveUserSettings(patch: Partial<UserPublic['settings']>, displayName?: string) {
  const r = await put('/me', { settings: { ...app.user!.settings, ...patch }, displayName });
  app.user = r.user;
  applyUserTheme();
}

// ---------- toasts ----------

export const toasts: { id: number; text: string; tone: string }[] = $state([]);
let toastId = 0;
export function toast(text: string, tone: 'ok' | 'bad' | 'default' = 'default') {
  const id = ++toastId;
  toasts.push({ id, text, tone });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 3500);
}

export function linkTarget() {
  return app.user?.settings.openLinksInNewTab ? '_blank' : '_self';
}

export function openUrl(url: string, newTab = app.user?.settings.openLinksInNewTab ?? false) {
  if (newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}
