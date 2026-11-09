import type { FastifyInstance } from 'fastify';
import { fetch } from 'undici';
import { requireUser, type AppContext } from '../app.ts';
import { getIntegration } from '../integrations/index.ts';
import type { ServiceInstance } from '../integrations/types.ts';
import { describeError } from '../lib/http.ts';
import { FailureTracker, errorDetails, logger } from '../lib/log.ts';

const log = logger('search');
const failures = new FailureTracker();
import { CATEGORY_BANGS, parseQuery } from '../shared/query.ts';
import { effectiveSettings } from './dashboard.ts';

/** Decide which services answer a query. */
export function selectProviders(all: ServiceInstance[], bang?: string): { providers: ServiceInstance[]; explicit: boolean } {
  const searchable = all.filter((s) => getIntegration(s.type)?.search);
  if (bang) {
    const byService = searchable.filter((s) => s.id.toLowerCase() === bang);
    if (byService.length) return { providers: byService, explicit: true };
    const byIntegration = searchable.filter((s) => getIntegration(s.type)?.bang === bang || s.type === bang);
    if (byIntegration.length) return { providers: byIntegration, explicit: true };
    const cat = CATEGORY_BANGS[bang];
    if (cat) return { providers: searchable.filter((s) => getIntegration(s.type)?.category === cat.category), explicit: true };
  }
  return { providers: searchable.filter((s) => getIntegration(s.type)?.searchByDefault !== false), explicit: false };
}

export const searchRoutes = (ctx: AppContext) => async (app: FastifyInstance) => {
  /**
   * Streams results as NDJSON, one line per provider as soon as it answers, so fast
   * services (Home Assistant) show up immediately while slow lookups are still running.
   */
  app.get('/search', { preHandler: requireUser }, async (req, reply) => {
    const q = String((req.query as any).q ?? '').slice(0, 300);
    const parsed = parseQuery(q);
    const all = ctx.services.list();
    let { providers, explicit } = selectProviders(all, parsed.bang);
    // A prefix that is not ours (e.g. a web engine like !g) means: no homelab results.
    if (parsed.bang && !explicit) providers = [];
    if (parsed.command || parsed.text.length < 2) providers = [];

    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    const write = (obj: unknown) => reply.raw.write(JSON.stringify(obj) + '\n');
    write({ type: 'start', providers: providers.map((p) => ({ id: p.id, name: p.name, icon: p.icon })), explicit });

    let closed = false;
    req.raw.on('close', () => (closed = true));

    await Promise.all(
      providers.map(async (s) => {
        const def = getIntegration(s.type)!;
        const t0 = Date.now();
        try {
          const timeout = explicit ? 20000 : 5000;
          const results = await Promise.race([
            def.search!(ctx.services.context(s), { text: parsed.text, explicit, limit: explicit ? 20 : 6 }),
            new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('Zeitüberschreitung'), { name: 'TimeoutError' })), timeout)),
          ]);
          if (failures.update(s.id, null) === 'recovered') log.info(`Suche in ${s.name} funktioniert wieder`);
          log.debug(`${s.name}: ${results.length} Treffer`, { ms: Date.now() - t0 });
          if (!closed) write({ type: 'results', provider: s.id, name: s.name, icon: s.icon, ms: Date.now() - t0, results });
        } catch (err) {
          const message = describeError(err);
          if (failures.update(s.id, message) === 'failed') {
            const details = errorDetails(err);
            const codeBug = err instanceof TypeError && !(err as any).cause;
            if (!codeBug) delete details.stack;
            log[codeBug ? 'error' : 'warn'](`Suche in ${s.name} fehlgeschlagen: ${message}`, details);
          }
          if (!closed) write({ type: 'error', provider: s.id, name: s.name, error: message });
        }
      }),
    );
    log.debug(`Suche "${parsed.text}"${parsed.bang ? ` (!${parsed.bang})` : ''}: ${providers.length} Dienste`, { user: req.user?.username });
    write({ type: 'done' });
    reply.raw.end();
    return reply;
  });

  /** Autocomplete suggestions from the user's web search engine. */
  app.get('/search/suggest', { preHandler: requireUser }, async (req) => {
    const q = String((req.query as any).q ?? '').trim().slice(0, 200);
    const settings = effectiveSettings(ctx);
    if (!q || !settings.search.suggestions) return { suggestions: [] };
    const userEngine = JSON.parse(req.user!.settings || '{}').searchEngine ?? settings.search.defaultEngine;
    const url =
      userEngine === 'duckduckgo'
        ? `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}`
        : `https://suggestqueries.google.com/complete/search?client=firefox&hl=de&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000), headers: { 'User-Agent': 'Mozilla/5.0 Kompass' } });
      const buf = Buffer.from(await res.arrayBuffer());
      // Google answers in ISO-8859-1 for some locales.
      const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
      const data = JSON.parse(new TextDecoder(charset).decode(buf));
      return { suggestions: ((data?.[1] ?? []) as string[]).filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 5) };
    } catch (err) {
      if (failures.update('suggest', describeError(err)) === 'failed') log.warn(`Suchvorschläge nicht abrufbar: ${describeError(err)}`, { engine: userEngine });
      return { suggestions: [] };
    }
  });
};
