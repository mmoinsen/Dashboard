/**
 * Sends browser-side errors to the server, so they show up in `docker logs` –
 * otherwise a broken button only fails silently in someone's browser console.
 */
let sent = 0;
let windowStart = Date.now();

export function reportError(where: string, err: unknown) {
  // at most 10 reports per minute per tab
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    sent = 0;
  }
  if (++sent > 10) return;
  const e = err as any;
  const body = {
    where,
    message: e?.message ?? String(err),
    stack: typeof e?.stack === 'string' ? e.stack : undefined,
    page: location.hash || '/',
    secureContext: window.isSecureContext,
  };
  console.error(`[Kompass] ${where}:`, err);
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting itself throw */
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => {
    // resource load errors (img 404 etc.) have no error object – those are expected
    if (e.error) reportError('Unbehandelter Fehler', e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as any;
    // aborted fetches (search typing) are normal
    if (r?.name === 'AbortError') return;
    reportError('Unbehandelter Fehler (Promise)', r);
  });
}
