import type { HttpClient, HttpClientOptions } from '../lib/http.ts';
import type { TtlCache } from '../lib/cache.ts';
import type { FieldDef, SearchResult, WidgetData } from '../shared/types.ts';

/** A configured service instance, with secrets decrypted. Only lives on the server. */
export interface ServiceInstance {
  id: string;
  type: string;
  name: string;
  url: string;
  publicUrl: string;
  icon: string;
  config: Record<string, any>;
}

export interface Context {
  service: ServiceInstance;
  /** HTTP client preconfigured with the service base URL (and TLS options). */
  http: HttpClient;
  /** Per-service mutable state, e.g. login cookies or session ids. Survives between calls. */
  state: Record<string, any>;
  cache: TtlCache;
  /** Build a URL that proxies an image through Kompass (keeps API keys server side). */
  imageUrl(path: string): string;
  /** Link to something inside the service's web UI. */
  link(path?: string): string;
}

export interface WidgetDef {
  name: string;
  description?: string;
  /** Refresh interval in seconds. */
  interval?: number;
  options?: FieldDef[];
  size?: number;
  fetch(ctx: Context, options: Record<string, any>): Promise<WidgetData>;
  /**
   * Optional bigger view opened from the widget ("Details"). Without it, the detail view
   * calls fetch() with `detail: true` and a larger `limit`.
   */
  detail?(ctx: Context, options: Record<string, any>): Promise<WidgetData>;
}

export interface SearchQuery {
  /** Search text with any prefix removed. */
  text: string;
  /** True if the user explicitly targeted this integration via its bang. */
  explicit: boolean;
  limit: number;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export interface IntegrationDef {
  id: string;
  name: string;
  /** Icon slug from https://github.com/homarr-labs/dashboard-icons */
  icon: string;
  category: 'media' | 'downloads' | 'smarthome' | 'network' | 'system' | 'productivity' | 'other';
  description: string;
  website?: string;
  /** Configuration fields shown in the service form (url is added automatically). */
  fields?: FieldDef[];
  /** False for integrations without a base URL (e.g. Docker via socket). */
  needsUrl?: boolean;
  /** Builtin integrations (clock, weather...) need no configured service. */
  builtin?: boolean;
  /** Prefix for the omni search, e.g. "jf" makes "!jf dune" search only Jellyfin. */
  bang?: string;
  /** Include in un-prefixed searches (default true). */
  searchByDefault?: boolean;
  /** Headers added to every request, derived from the config. */
  headers?(config: Record<string, any>): Record<string, string | undefined>;
  /** Override how the HTTP client connects (e.g. unix sockets). */
  connection?(service: ServiceInstance): Partial<HttpClientOptions>;
  widgets?: Record<string, WidgetDef>;
  /** The widget added to a fresh dashboard for this service. */
  defaultWidget?: string;
  search?(ctx: Context, query: SearchQuery): Promise<SearchResult[]>;
  actions?: Record<string, (ctx: Context, params: Record<string, any>) => Promise<ActionResult | void>>;
  /** Health check; defaults to a GET on the base URL. Throw or return ok:false when unhealthy. */
  health?(ctx: Context): Promise<{ ok: boolean; message?: string } | void>;
}

export function defineIntegration(def: IntegrationDef): IntegrationDef {
  return def;
}

// ---------- common field presets ----------

export const apiKeyField: FieldDef = { key: 'apiKey', label: 'API-Key', type: 'secret', required: true };

export const usernameField: FieldDef = { key: 'username', label: 'Benutzername', type: 'string' };

export const passwordField: FieldDef = { key: 'password', label: 'Passwort', type: 'secret' };

export const limitOption = (def = 5, label = 'Anzahl Einträge'): FieldDef => ({
  key: 'limit',
  label,
  type: 'number',
  default: def,
  min: 1,
  max: 50,
});

export const daysOption = (def: number): FieldDef => ({ key: 'days', label: 'Tage voraus', type: 'number', default: def, min: 1, max: 90 });
