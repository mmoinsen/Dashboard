# UI-Review: Vercel Web Interface Guidelines

Geprüft gegen <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>
(die Quelle, die der Skill `web-design-guidelines` von Vercel lädt). Stand: Commit `76339e5`, vor den Korrekturen.
Alle Befunde wurden in diesem Branch behoben, sofern nicht unter „Bewusst nicht umgesetzt“ aufgeführt.

## web/index.html

web/index.html:5 - kein `color-scheme` auf `<html>` beim ersten Paint, nur per JS gesetzt
web/index.html:8 - kein Skip-Link / kein `<main>`-Ziel

## web/src/app.css

web/src/app.css:256 - `.input:focus` → `:focus-visible`
web/src/app.css:246 - `outline: none` auf `input[type=range]:focus-visible`; Ersatz nur am Thumb (Webkit), in Firefox kein sichtbarer Fokus
web/src/app.css:375 - reduced-motion nur für Dauer, Endlos-Animationen (Skeleton, Puls) laufen weiter
web/src/app.css - fehlt: `touch-action: manipulation`, `-webkit-tap-highlight-color`, `overscroll-behavior` auf `<html>` (pointer: fine)
web/src/app.css - fehlt: `text-wrap: balance` für Überschriften, `text-wrap: pretty` für Absätze
web/src/app.css - fehlt: explizite `background-color`/`color` für `<option>` (Windows-Dark-Mode)
web/src/app.css - fehlt: `env(safe-area-inset-*)` für Notch-Geräte
web/src/app.css - Hover-Zustände von `.btn` nicht kontrastreicher als Ruhezustand bei hellem Theme; kein `:active`-Zustand

## web/src/App.svelte

web/src/App.svelte:118 - kein `<main>`-Landmark, keine `<h1>`, wenn Begrüßung ausgeblendet ist
web/src/App.svelte:57 - `confirm()` ok; Seite löschen ohne Rückgängig

## web/src/components/Dashboard.svelte

web/src/components/Dashboard.svelte:179 - Widget entfernen sofort, ohne Bestätigung oder Rückgängig (destruktiv)
web/src/components/Dashboard.svelte:207 - "Ctrl K" → geschütztes Leerzeichen `Ctrl&nbsp;K`
web/src/components/Dashboard.svelte - Verschieben nur per Maus-Drag, keine Tastatur-/Klick-Alternative (Geste ohne Alternative)
web/src/components/Dashboard.svelte - während Drag: gezogenes Element nicht `inert`
web/src/components/Dashboard.svelte - Detailansicht nicht in der URL (kein Deep-Link, Zurück-Taste schließt sie nicht)

## web/src/components/Widget.svelte

web/src/components/Widget.svelte:92 - Widget-Titel `<h3>` ohne übergeordnete `<h2>` (Hierarchie übersprungen)
web/src/components/Widget.svelte - Dienstnamen ohne `translate="no"` (Auto-Übersetzung verstümmelt „Radarr“, „Home Assistant“)

## web/src/components/Blocks.svelte

web/src/components/Blocks.svelte:61 - `<img>` ohne `width`/`height` (CLS)
web/src/components/Blocks.svelte:105 - Poster-`<img>` ohne `width`/`height`
web/src/components/Blocks.svelte - Detail-Listen bis 100 Einträge ohne `content-visibility: auto`
web/src/components/Blocks.svelte - Werte wie Entity-IDs/Containernamen ohne `translate="no"`

## web/src/components/Search.svelte

web/src/components/Search.svelte:403 - `<img>` ohne `width`/`height`
web/src/components/Search.svelte:439 - Poster-`<img>` ohne `width`/`height`
web/src/components/Search.svelte:522 - `outline: none` am Suchfeld ohne Fokus-Ersatz
web/src/components/Search.svelte:400 - leerer `onkeydown`-Handler auf `role="option"` (nur zur Lint-Beruhigung)
web/src/components/Search.svelte:356 - Placeholder ohne Beispiel-Muster
web/src/components/Search.svelte:203 - "Ctrl ↵" → `Ctrl&nbsp;↵`
web/src/components/Search.svelte - Overlay ohne `overscroll-behavior: contain`

## web/src/components/Modal.svelte

web/src/components/Modal.svelte:13 - `.body` ohne `overscroll-behavior: contain`

## web/src/components/TopBar.svelte

web/src/components/TopBar.svelte:59 - Menü-Backdrop mit leerem `onkeydown`; Menü schließt nicht per Esc, Fokus kehrt nicht zurück
web/src/components/TopBar.svelte:50 - "Ctrl K" im Label

## web/src/components/AuthScreen.svelte

web/src/components/AuthScreen.svelte:51 - Benutzername ohne `spellcheck="false"`, `name`, `autocapitalize="none"`
web/src/components/AuthScreen.svelte - Fehler nur als Banner, nicht am Feld; Fokus springt nicht zum Fehler

## web/src/components/FieldInput.svelte

web/src/components/FieldInput.svelte - Eingaben ohne `name` und ohne `autocomplete="off"` (Passwortmanager springt bei API-Feldern an)
web/src/components/FieldInput.svelte - URL/ID-Felder ohne `spellcheck="false"`

## web/src/components/settings/ServiceForm.svelte

web/src/components/settings/ServiceForm.svelte:93 - Placeholder: „…“ am Ende statt in der Mitte
web/src/components/settings/ServiceForm.svelte:123 - Placeholder ohne Beispiel und ohne „…“
web/src/components/settings/ServiceForm.svelte:137 - Placeholder ohne „…“
web/src/components/settings/ServiceForm.svelte - Schließen mit ungespeicherten Änderungen ohne Warnung
web/src/components/settings/ServiceForm.svelte - URL-/ID-Felder ohne `spellcheck="false"`, `autocomplete="off"`, `name`

## web/src/components/settings/GeneralSettings.svelte

web/src/components/settings/GeneralSettings.svelte:42 - Placeholder „Berlin“ ohne „…“
web/src/components/settings/GeneralSettings.svelte:43 - Breitengrad als Text ohne `inputmode="decimal"`-Validierung; Placeholder ohne „…“
web/src/components/settings/GeneralSettings.svelte - ungespeicherte Änderungen ohne `beforeunload`-Warnung

## web/src/components/settings/AppearanceSettings.svelte

web/src/components/settings/AppearanceSettings.svelte:298 - `outline: none` am Hex-Eingabefeld ohne Ersatz
web/src/components/settings/AppearanceSettings.svelte - Theme-Editor: Verlassen mit ungespeicherten Änderungen ohne Warnung

## web/src/components/settings/UsersSettings.svelte, AccountSettings.svelte

UsersSettings.svelte - Benutzername ohne `spellcheck="false"`/`autocapitalize`
AccountSettings.svelte - Passwortfelder ohne `name`

## web/src/components/Chart.svelte, Toggle.svelte, ActionButton.svelte, ServiceBar.svelte, Clock.svelte, Toasts.svelte, Icon.svelte, Glyph.svelte

✓ pass (Chart: Tastatur-Bedienung, `aria-label`; Toggle: `role="switch"`; Toasts: `aria-live="polite"`; Glyph: `aria-hidden`)

## Bewusst nicht umgesetzt

- **Title Case für Überschriften/Buttons (Chicago):** englische Konvention; im Deutschen gilt normale Groß-/Kleinschreibung.
- **Sprache per `Accept-Language`:** die Oberfläche ist (noch) nur deutsch.
- **Suchfeld fokussiert sich beim Öffnen (`autoFocus`):** begründet – die Suche wird ausdrücklich geöffnet und hat genau ein Eingabefeld.
- **URL für alle Zustände:** Seiten, Einstellungen und Detailansicht stehen in der URL; Suche und Bearbeiten-Modus bewusst nicht.
