// Beispiel-Plugin: in /config/plugins/ ablegen und Kompass neu starten.
// Ein Plugin ist ein einfaches Objekt – keine Imports, kein Build-Schritt nötig.
// (.ts-Dateien funktionieren genauso.)

export default {
  id: 'tautulli',
  name: 'Tautulli',
  icon: 'tautulli', // Name aus https://dashboardicons.com
  category: 'media',
  description: 'Plex-Statistiken über Tautulli',
  bang: 'tt', // "!tt ..." sucht nur hier

  // Felder im Formular "Dienst hinzufügen" (die URL kommt automatisch dazu)
  fields: [{ key: 'apiKey', label: 'API-Key', type: 'secret', required: true }],

  async health(ctx) {
    await ctx.http.get('/api/v2', { query: { apikey: ctx.service.config.apiKey, cmd: 'status' } });
  },

  widgets: {
    activity: {
      name: 'Aktivität',
      interval: 15, // Sekunden
      async fetch(ctx) {
        const r = await ctx.http.get('/api/v2', { query: { apikey: ctx.service.config.apiKey, cmd: 'get_activity' } });
        const d = r.response.data;
        // Widgets liefern nur Daten-Blöcke – die Oberfläche rendert sie automatisch.
        return {
          summary: `${d.stream_count} Streams`,
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Streams', value: d.stream_count },
                { label: 'Transcodes', value: d.stream_count_transcode },
                { label: 'Bandbreite', value: Math.round(d.total_bandwidth / 1000), unit: 'Mbit/s' },
              ],
            },
            {
              type: 'list',
              empty: 'Niemand schaut gerade',
              items: d.sessions.map((s) => ({
                title: s.full_title,
                subtitle: `${s.friendly_name} · ${s.player}`,
                progress: Number(s.progress_percent),
              })),
            },
          ],
        };
      },
    },
  },
};
