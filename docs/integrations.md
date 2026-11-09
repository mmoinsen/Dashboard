# Integrationen schreiben

Kompass ist so gebaut, dass ein neuer Dienst **nur eine Datei** braucht – ohne Änderungen an der Oberfläche.
Jede Integration kann drei Dinge:

| Fähigkeit   | Wofür                                              | Beispiel                                    |
| ----------- | -------------------------------------------------- | ------------------------------------------- |
| `widgets`   | Daten fürs Dashboard liefern                       | qBittorrent-Geschwindigkeit, Docker-Health  |
| `search`    | Treffer für die Omni-Suche liefern                 | Jellyfin-Filme, Home-Assistant-Entitäten    |
| `actions`   | Etwas im Dienst auslösen                           | Licht schalten, Film zu Radarr hinzufügen   |

Dazu kommen `health` (Online-Check für die Statuspunkte) und `fields` (das Formular in „Dienst hinzufügen“).

## Zwei Wege

1. **Als Plugin (ohne Neubau des Images):** Datei nach `/config/plugins/<name>.js` (oder `.ts`) legen, Container neu starten.
   Ein Beispiel liegt in [`docs/examples/tautulli.js`](examples/tautulli.js). Ein Plugin mit derselben `id` wie eine
   eingebaute Integration ersetzt diese.
2. **Fest eingebaut:** Datei unter `server/src/integrations/` anlegen und in `server/src/integrations/index.ts` eintragen.
   Hier stehen Helfer wie `defineIntegration`, `bestScore` (Suchrelevanz) und Formatierer (`bytes`, `duration` …) zur Verfügung.

## Aufbau

```ts
export default defineIntegration({
  id: 'radarr',            // Typ-Name, wird in kompass.yaml als `type:` benutzt
  name: 'Radarr',
  icon: 'radarr',          // Slug aus https://dashboardicons.com, "mdi-<name>" oder URL
  category: 'media',       // media | downloads | smarthome | network | system | productivity | other
  description: '…',
  bang: 'rad',             // "!rad dune" sucht nur in Radarr
  searchByDefault: true,   // false = nur mit Präfix durchsuchen (z. B. langsame Indexer)
  fields: [{ key: 'apiKey', label: 'API-Key', type: 'secret', required: true }],
  headers: (config) => ({ 'X-Api-Key': config.apiKey }),   // an jede Anfrage angehängt
  defaultWidget: 'calendar',                                // landet auf neuen Dashboards

  async health(ctx) { await ctx.http.get('/api/v3/system/status'); },

  widgets: {
    calendar: {
      name: 'Kalender',
      interval: 300,                       // Aktualisierung in Sekunden (serverseitig gecacht)
      options: [{ key: 'days', label: 'Tage', type: 'number', default: 30 }],
      async fetch(ctx, options) {
        return { summary: '3 Releases', blocks: [ /* siehe unten */ ] };
      },
    },
  },

  // optional: große Ansicht hinter dem Details-Button (sonst: fetch() mit detail: true und größerem limit)
  // async detail(ctx, options) { return { blocks: [...] }; },

  async search(ctx, query) {
    // query.text = Suchbegriff ohne Präfix, query.explicit = per Präfix angesprochen
    return [{ id: 'radarr:1', title: 'Dune', group: 'Radarr · Bibliothek', kind: 'media', score: 0.9 }];
  },

  actions: {
    async addMovie(ctx, params) {
      await ctx.http.post('/api/v3/movie', { /* … */ });
      return { ok: true, message: 'Hinzugefügt' };
    },
  },
});
```

### Feldtypen

`string`, `url`, `secret` (verschlüsselt gespeichert, nie an den Browser gesendet), `number` (mit optionalem `min`/`max`, wird im Formular und auf dem Server erzwungen), `boolean`, `select` (mit `options`), `text` (mehrzeilig).

### Detailansicht

Jedes Widget hat einen Details-Button. Definiert ein Widget `detail(ctx, options)`, wird diese Funktion für die große Ansicht
benutzt (z. B. alle Torrents mit Einzel-Aktionen und Geschwindigkeitsverlauf). Ohne `detail` ruft Kompass `fetch()` mit
`options.detail = true` und einem vierfachen `limit` auf – jede Integration bekommt also automatisch eine größere Ansicht.

### Der Kontext `ctx`

| Eigenschaft        | Beschreibung                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| `ctx.service`      | `{ id, name, url, publicUrl, config }` – `config` enthält entschlüsselte Felder |
| `ctx.http`         | HTTP-Client mit Basis-URL, Headern, Timeout: `get`, `post`, `put`, `delete`, `request` |
| `ctx.state`        | Objekt pro Dienst, das zwischen Aufrufen erhalten bleibt (Login-Cookies, Session-IDs, Verlauf) |
| `ctx.cache.get(key, ttlMs, loader)` | Zwischenspeicher mit Deduplizierung gleichzeitiger Anfragen |
| `ctx.imageUrl(path)` | Bild aus dem Dienst über Kompass ausliefern (API-Key bleibt auf dem Server) |
| `ctx.link(path)`   | Link in die Weboberfläche des Dienstes (nutzt `publicUrl`)                   |

## Blöcke: so sieht ein Widget aus

Widgets liefern keine HTML-Oberfläche, sondern eine Liste von Blöcken. Dadurch sehen alle Widgets einheitlich aus, passen sich jedem Theme an
und neue Integrationen brauchen keinen Frontend-Code.

| Block      | Inhalt                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| `stats`    | Kacheln: `{ label, value, unit?, tone? }`                                               |
| `bars`     | Fortschrittsbalken: `{ label, value, percent, tone? }`                                  |
| `list`     | Zeilen: `{ title, subtitle?, meta?, image?, icon?, status?, badge?, progress?, url?, actions? }` |
| `toggles`  | Schalter mit optionalem Schieberegler: `{ title, subtitle?, on, action?, slider? }`     |
| `posters`  | Poster-Raster: `{ title, subtitle?, image?, url? }`                                     |
| `chart`    | Verlauf, mehrere Linien mit gemeinsamer Skala: `{ series: [{ label, points: number[], tone? }], unit?, label? }` |
| `kv`       | Schlüssel/Wert-Liste: `{ label, value }`                                                |
| `actions`  | Buttons: `ActionRef[]`                                                                  |
| `text`     | Hinweistext                                                                             |
| `links`    | Link-Kacheln                                                                            |
| `clock`    | Live-Uhr                                                                                |
| `heading`  | Zwischenüberschrift (vor allem für Detailansichten)                                     |

`tone` ist eine von `default | accent | ok | warn | bad | info | muted` – die Farben kommen aus dem Theme.

Eine **Aktion** (`ActionRef`) sieht so aus: `{ service: ctx.service.id, action: 'pause', params: { hash }, label: 'Pausieren', confirm?: 'Sicher?' }`.
Ein Klick ruft die gleichnamige Funktion in `actions` auf.

## Suchtreffer und Ranking

Ohne Präfix fragt Kompass alle durchsuchbaren Dienste gleichzeitig ab und streamt die Antworten, sobald sie eintreffen
(langsame Dienste blockieren nicht; Timeout 5 s, mit Präfix 20 s). Sortiert wird nach `score` (0–1):

- Gruppen werden nach ihrem besten Treffer sortiert, der beste Treffer insgesamt ist vorausgewählt (Enter).
- Die Websuche bekommt einen eigenen Score: Fragen („wie …?“, lange Sätze) rutschen nach oben; findet das Homelab nichts Gutes, steht sie zuerst.
- Richtwerte der eingebauten Integrationen: eigene Medien 0.55–1, Home-Assistant-Entitäten 0.7–1, „Hinzufügen“-Vorschläge ≤ 0.7,
  Torrents/Container ≤ 0.7.

Ein Treffer kann `url` (Enter öffnet), `toggle` (Enter schaltet), `actions` (Buttons) und `detail` (Seitenpanel mit Poster,
Beschreibung, Fortschritt) haben. Aktionen, die etwas verändern (z. B. „Zu Radarr hinzufügen“), werden nie per Enter ausgelöst – nur per Klick.

Mit `matchScore`/`bestScore` aus `server/src/lib/match.ts` bekommst du eine einheitliche Relevanz (exakt = 1, Wortanfang ≈ 0.8, enthält ≈ 0.65).

## Ohne Code: „Eigene JSON-API“

Für einfache Fälle braucht es gar kein Plugin. Der Diensttyp **Eigene JSON-API** fragt einen beliebigen Endpunkt ab und zeigt
Felder als Kacheln an:

```
Benutzer = data.users
Speicher = data.disk.used | GB
```
