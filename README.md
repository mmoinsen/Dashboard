# Kompass

Ein selbst gehostetes Dashboard für deinen Homeserver – mit **einer Suchleiste für alles**.

Tippe „dune“ und du siehst den Film aus deiner Jellyfin-Bibliothek samt Zusammenfassung und Fortschritt, kannst ihn fortsetzen,
die fehlende Fortsetzung direkt zu Radarr hinzufügen – oder doch einfach googeln. Tippe „licht“ und du schaltest und dimmst deine
Home-Assistant-Lampen direkt in der Ergebnisliste.

- **Omni-Suche** (`Ctrl K`, `/` oder einfach lostippen): Dienste, Medien, Smart Home, Container, Torrents, Rechner, URLs und Web in einer Liste
- **„Claude fragen“** in der Suche oder mit `!ai`: öffnet claude.ai mit deinem bestehenden Claude-Abo (Standard, keine Zusatzkosten) – oder antwortet direkt in der Suche, wenn du einen Anthropic-API-Key hinterlegst
- **31 Integrationen** und ein Plugin-System, das ohne Neubau des Images erweiterbar ist
- **Frei anordnen**: Widgets per Drag & Drop an jede Stelle eines 12-Spalten-Rasters ziehen und in der Breite ziehen – ohne Lücken zwischen den Reihen
- **Detailansicht** für jedes Widget (z. B. alle Torrents mit Geschwindigkeitsverlauf, alle Home-Assistant-Geräte nach Bereich)
- **Mehrere Benutzer**, jeder mit eigenem Dashboard und Theme; Admin verwaltet Dienste und Benutzer
- **Einmal anmelden** – die Sitzung bleibt bis zu 400 Tage gültig und verlängert sich bei Nutzung (ideal als Browser-Startseite)
- **Themes**: Geist (Standard) und Geist Hell, Nacht, Papier, Fjord, Terminal, Glas – plus Theme-Editor mit Live-Vorschau, Export/Import als JSON
- **Barrierearm** nach den [Vercel Web Interface Guidelines](docs/ui-review-web-interface-guidelines.md): Tastaturbedienung inkl. Widgets verschieben, sichtbarer Fokus, Skip-Link, Screenreader-Texte, reduzierte Bewegung
- **Konfiguration per Oberfläche *und* `kompass.yaml`** (mit `${ENV}`-Variablen für Geheimnisse)
- Dienst-Icons automatisch aus [dashboard-icons](https://dashboardicons.com), lokal zwischengespeichert
- API-Keys werden verschlüsselt gespeichert und verlassen nie den Server (auch Bilder laufen über einen Proxy)

## Schnellstart

```bash
git clone https://github.com/mmoinsen/Dashboard.git kompass
```

```bash
cd kompass && docker compose up -d --build
```

Dann `http://<server>:8080` öffnen und den Administrator-Account anlegen. Dienste fügst du unter **Menü → Dienste** hinzu
(oder in `./config/kompass.yaml`, siehe [`config.example/kompass.yaml`](config.example/kompass.yaml)).

**Tipp:** Hänge Kompass in dasselbe Docker-Netzwerk wie deine Dienste. Dann reichen URLs wie `http://sonarr:8989`.
Als „Öffentliche URL“ trägst du ein, wie du den Dienst im Browser erreichst – die wird für Links verwendet.

### docker-compose

```yaml
services:
  kompass:
    build: https://github.com/mmoinsen/Dashboard.git
    restart: unless-stopped
    ports: ["8080:8080"]
    volumes:
      - ./config:/config
      - /var/run/docker.sock:/var/run/docker.sock   # optional, für das Docker-Widget
    environment:
      - TZ=Europe/Berlin
```

### KI-Suche (Claude)

Unter **Allgemein → KI-Suche (Claude)** gibt es drei Modi:

- **claude.ai (Standard):** „Claude fragen“ öffnet claude.ai in einem neuen Tab und füllt die Frage vor (sie liegt zusätzlich in der
  Zwischenablage). Du nutzt dein bestehendes Claude-Abo, es entstehen keine Zusatzkosten. Ein Abo (Free/Pro/Max) direkt in Kompass
  einzubinden ist nach den Nutzungsbedingungen von Anthropic nicht erlaubt – deshalb die Weiterleitung.
- **API:** Claude antwortet direkt im Suchfenster. Braucht einen [Anthropic-API-Key](https://console.anthropic.com) (oder
  `ANTHROPIC_API_KEY` im Container) und wird pro Anfrage abgerechnet. Standardmodell Claude Opus 5.5, wählbar auch Sonnet 5.5 und
  Haiku 5.5; Antworttiefe einstellbar. Auf Wunsch sieht Claude die Namen und den Online-Status deiner Dienste sowie die Suchtreffer
  (keine API-Keys, keine Adressen). Für Opus/Sonnet ist der serverseitige Fallback bei Ablehnungen (`fallbacks: "default"`) aktiv.
- **Aus.**

Alles, was erhalten bleiben soll, liegt in `/config`: Datenbank (`kompass.db`), Schlüssel für Geheimnisse (`secret.key`),
optional `kompass.yaml`, Plugins (`plugins/`) und der Icon-Cache.

| Variable                 | Standard | Beschreibung                                                                  |
| ------------------------ | -------- | ----------------------------------------------------------------------------- |
| `PORT`                   | `8080`   | Port im Container                                                             |
| `KOMPASS_CONFIG_DIR`     | `/config`| Datenverzeichnis                                                              |
| `ANTHROPIC_API_KEY`      | –        | Alternative zum API-Key in den Einstellungen (KI-Suche)                       |
| `LOG_LEVEL`              | `info`   | `debug` (jede Anfrage, jedes Widget-Update) · `info` · `warn` · `error`        |
| `LOG_FORMAT`             | `text`   | `json` für Log-Sammler wie Loki/Graylog                                       |
| `KOMPASS_TRUSTED_HEADER` | –        | SSO über Reverse Proxy, z. B. `Remote-User` (Authelia/Authentik). Nur setzen, wenn Kompass ausschließlich über diesen Proxy erreichbar ist! |

### Logs & Fehlersuche

```bash
docker logs -f kompass
```

Im Log stehen u. a.: welche Dienste nicht erreichbar sind (mit Adresse und Grund, z. B. `ECONNREFUSED`, `HTTP 401`),
fehlgeschlagene Widgets, Suchanfragen und Aktionen, Anmeldungen und Fehlversuche, Fehler in `kompass.yaml` oder Plugins –
und **Fehler aus dem Browser** (`[browser]`), die sonst nur in der Entwicklerkonsole auftauchen würden.
Wiederholte Fehler (ein Widget fragt alle paar Sekunden ab) werden nur beim ersten Auftreten und bei der Erholung geloggt.
API-Keys erscheinen nie im Log. Für mehr Details `LOG_LEVEL=debug` setzen und den Container neu starten.

> **Docker-Socket:** Wer dem Container nicht den kompletten Socket geben will, nutzt
> [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) und trägt beim Docker-Dienst `http://docker-socket-proxy:2375` als Endpunkt ein
> (für Start/Stopp braucht der Proxy `POST=1`, `CONTAINERS=1`).

## Die Suche

| Eingabe                  | Ergebnis                                                         |
| ------------------------ | ---------------------------------------------------------------- |
| `dune`                   | Alle Dienste gleichzeitig + Web, automatisch nach Relevanz sortiert |
| `wie alt ist …?`         | Fragen → Websuche steht oben                                     |
| `!g katzen` / `katzen !g`| **Nur** Google (auch `!ddg`, `!yt`, `!w`, `!gh`, `!maps`, `!imdb` …) |
| `!jf dune`               | Nur Jellyfin (`!son`, `!rad`, `!lid`, `!ha`, `!qb`, `!d` Docker, `!pr` Prowlarr-Releases …) |
| `!m …` / `!h …`          | Alle Medien- bzw. Smart-Home-Dienste                             |
| `!sonarr …`              | Ein bestimmter Dienst über seine ID                              |
| `> …`                    | Befehle: Seiten, Theme wechseln, Bearbeiten, Abmelden            |
| `12*7`                   | Rechner                                                          |
| `192.168.1.1`            | Adresse öffnen                                                   |

`!ai …` (oder `!claude`, `!ki`) fragt Claude – je nach Einstellung auf claude.ai oder direkt in der Suche.

`↑ ↓` wählen, `Enter` öffnet/schaltet (die ausgewählte Zeile zeigt, was passiert), `Ctrl Enter` sucht immer direkt im Web, `Shift Enter` öffnet in neuem Tab, `!` zeigt alle Präfixe.
Suchmaschinen und Präfixe sind unter **Allgemein** anpassbar, jeder Benutzer kann seine Standard-Suchmaschine wählen.

## Integrationen

| Kategorie    | Dienste                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| Medien       | Jellyfin, Emby, Plex, Sonarr, Radarr, Lidarr, Bazarr, Jellyseerr, Overseerr, Immich         |
| Downloads    | qBittorrent, SABnzbd, Prowlarr, FlareSolverr                                               |
| Smart Home   | Home Assistant (Schalter, Dimmer, Thermostate, Rollläden, Szenen, Sensoren)               |
| Netzwerk     | Gluetun, Pi-hole (v5/v6), AdGuard Home, nginx (stub_status), Nginx Proxy Manager, Speedtest Tracker |
| System       | Proxmox VE (Nodes, VMs & LXC mit Start/Stopp), Docker, Glances, Uptime Kuma               |
| Produktivität| Obsidian LiveSync (CouchDB)                                                               |
| Allgemein    | Website/Link mit Online-Check, **Eigene JSON-API** (beliebige Werte ohne Code), Uhr (Digital, Minimal, Analog, in Worten), Wetter, Lesezeichen |

Fehlt dein Dienst? Siehe **[docs/integrations.md](docs/integrations.md)** – eine Integration ist eine einzelne Datei, die du als
Plugin nach `/config/plugins/` legen kannst. Beispiel: [`docs/examples/tautulli.js`](docs/examples/tautulli.js).

## Architektur

```
Browser (Svelte)  ──REST + NDJSON-Stream──▶  Kompass-Server (Node/Fastify, SQLite)
  Widget-Raster, Omni-Suche,                  Plugin-Registry · Such-Aggregator · Cache
  Theme-Engine, Einstellungen                 Health-Checks · Auth · verschlüsselte Secrets
                                                       │
                                                       ▼
                                   Integrationen: widgets() · search() · actions()
```

- Widgets liefern generische **Blöcke** (Kacheln, Listen, Schalter, Poster, Diagramme …) statt eigener Oberflächen – neue
  Integrationen brauchen keinen Frontend-Code und passen automatisch zu jedem Theme.
- Widget-Daten werden serverseitig pro Intervall gecacht; zehn offene Browser erzeugen eine Anfrage an den Dienst.
- Die Suche fragt alle Dienste parallel und streamt die Antworten – schnelle Dienste erscheinen sofort.

## Entwicklung

Voraussetzung: Node.js ≥ 22.18 (führt TypeScript direkt aus).

```bash
npm install
```

```bash
npm run dev -w server   # API auf :8080, Daten in ./.dev-config
```

```bash
npm run dev -w web      # Oberfläche mit Hot Reload auf :5173
```

```bash
npm test && npm run check
```

Projektstruktur: `server/src/integrations/` (eine Datei pro Dienst), `server/src/routes/` (API), `server/src/shared/` (Typen und
Such-Parser, von Server und Client genutzt), `web/src/components/` (Oberfläche).
