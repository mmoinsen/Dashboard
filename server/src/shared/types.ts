// Types shared between server and web client.
// Integrations never ship UI code: widgets return a list of generic "blocks"
// which the client knows how to render. A new integration therefore needs no
// frontend changes at all.

export type Tone = 'default' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'muted';

/** A call to an integration action, executed via POST /api/actions. */
export interface ActionRef {
  /** Service instance id (or builtin integration id when `builtin` is set). */
  service: string;
  action: string;
  params?: Record<string, unknown>;
  label: string;
  tone?: Tone;
  /** Ask the user for confirmation before executing. */
  confirm?: string;
}

export interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  tone?: Tone;
}

export interface BarItem {
  label: string;
  value: string;
  /** 0..100 */
  percent: number;
  tone?: Tone;
}

export interface ListItem {
  title: string;
  subtitle?: string;
  meta?: string;
  /** Image URL (absolute or /api/... proxied). */
  image?: string;
  /** Icon slug or URL. */
  icon?: string;
  status?: Tone;
  badge?: { text: string; tone?: Tone };
  /** 0..100 */
  progress?: number;
  url?: string;
  actions?: ActionRef[];
}

export interface ToggleItem {
  title: string;
  subtitle?: string;
  on: boolean;
  /** Executed when the toggle is clicked. */
  action?: ActionRef;
  /** Optional slider (e.g. brightness). The value is passed as params.value. */
  slider?: { value: number; min: number; max: number; unit?: string; action: ActionRef };
  readonly?: boolean;
}

export interface PosterItem {
  title: string;
  subtitle?: string;
  image?: string;
  url?: string;
}

export type Block =
  | { type: 'stats'; items: StatItem[] }
  | { type: 'bars'; items: BarItem[] }
  | { type: 'list'; title?: string; items: ListItem[]; empty?: string }
  | { type: 'toggles'; items: ToggleItem[] }
  | { type: 'posters'; title?: string; items: PosterItem[] }
  | { type: 'chart'; label?: string; unit?: string; series: { label: string; points: number[]; tone?: Tone }[] }
  | { type: 'kv'; items: { label: string; value: string }[] }
  | { type: 'text'; text: string; tone?: Tone }
  | { type: 'actions'; items: ActionRef[] }
  | { type: 'clock'; seconds?: boolean; timezone?: string; showDate?: boolean }
  | { type: 'links'; items: { title: string; url: string; icon?: string; subtitle?: string }[] };

export interface WidgetData {
  /** Short line shown under the widget title, e.g. "3 aktiv · 41 seeding". */
  summary?: string;
  status?: Tone;
  blocks: Block[];
}

export interface SearchDetail {
  title: string;
  image?: string;
  meta?: string[];
  description?: string;
  progress?: number;
  progressLabel?: string;
  source?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  url?: string;
  /** Group heading in the result list, e.g. "Jellyfin · In deiner Bibliothek". */
  group: string;
  kind: 'media' | 'entity' | 'container' | 'download' | 'service' | 'web' | 'command' | 'item';
  /** 0..1, relevance as computed by the provider. */
  score: number;
  actions?: ActionRef[];
  toggle?: ToggleItem;
  detail?: SearchDetail;
}

export type FieldType = 'string' | 'url' | 'secret' | 'number' | 'boolean' | 'select' | 'text';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface WidgetInfo {
  id: string;
  name: string;
  description?: string;
  interval: number;
  options: FieldDef[];
  /** Default column span (1-4). */
  size?: number;
}

export interface IntegrationInfo {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  website?: string;
  fields: FieldDef[];
  widgets: WidgetInfo[];
  searchable: boolean;
  bang?: string;
  /** Builtin integrations need no configured service. */
  builtin?: boolean;
  /** Whether the service needs a URL field (most do). */
  needsUrl: boolean;
}

export interface ServicePublic {
  id: string;
  type: string;
  name: string;
  url: string;
  /** URL used for links in the browser (defaults to url). */
  publicUrl: string;
  icon: string;
  source: 'file' | 'ui';
  /** Non-secret config values; secrets are reported as `true` when set. */
  config: Record<string, unknown>;
  sort: number;
}

export interface ServiceStatus {
  ok: boolean;
  ms?: number;
  message?: string;
  checkedAt: number;
}

export interface WidgetInstance {
  id: string;
  /** Service instance id, or builtin integration id when builtin is true. */
  service: string;
  builtin?: boolean;
  widget: string;
  title?: string;
  options?: Record<string, unknown>;
  /** Column span 1..4 */
  w?: number;
}

export interface DashboardPage {
  id: string;
  name: string;
  showServices?: boolean;
  showSearch?: boolean;
  widgets: WidgetInstance[];
}

export interface Dashboard {
  pages: DashboardPage[];
}

export interface ThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  accent2: string;
  ok: string;
  warn: string;
  bad: string;
  radius: number;
  fontBody: string;
  fontHeading: string;
  fontMono: string;
  /** 0..1 card opacity, < 1 enables glass look together with blur */
  surfaceAlpha: number;
  blur: number;
  wallpaper?: string;
  density: 'compact' | 'normal' | 'airy';
}

export interface Theme {
  id: string;
  name: string;
  tokens: ThemeTokens;
  custom?: boolean;
}

export interface UserSettings {
  theme?: string;
  customThemes?: Theme[];
  searchEngine?: string;
  openLinksInNewTab?: boolean;
  greeting?: boolean;
}

export interface UserPublic {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  settings: UserSettings;
}

export interface SearchEngine {
  id: string;
  name: string;
  bang: string;
  /** URL with {q} placeholder */
  url: string;
  icon?: string;
}

export interface AppSettings {
  title: string;
  search: {
    defaultEngine: string;
    suggestions: boolean;
    engines: SearchEngine[];
  };
  weather?: { latitude: number; longitude: number; name?: string };
}
