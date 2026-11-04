# Roadmap

Langfristige Themen, nach und nach umzusetzen. Reihenfolge: Standalone → Kampagne → Mobile → Steam.

## Leitplanken

- Die klassischen Modi (AP/AR/SD/All Prophet, Online + Solo vs Bots) bleiben **unverändert**. Alles Neue kommt als zusätzlicher Modus dazu.
- `shared/sim` bleibt deterministisch; neue Regeln laufen über optionale Modifier, nie über Änderungen an den Standardwerten.
- Die harten Regeln aus `CLAUDE.md` gelten weiter (keine Blizzard-Assets/-Texte, npm-Pakete ≥ 2 Wochen alt und exakt gepinnt, vor Downloads fragen).

## Phase 1 – Standalone Desktop (.exe / Installer)

**Stand:** umgesetzt mit Electron in `desktop/` (Details im README, Abschnitt „Desktop app“).

- **Hülle:** Electron 44 (gleiches Chromium wie die Browsertests, später `steamworks.js`). Der Client wird mit `vite build --mode desktop` gebaut und von `app://legion/` geladen; `DESKTOP` (`client/src/desktop.ts`) schaltet die Unterschiede.
- **Offline:** Solo vs Bots läuft ohne Server (kein Service Worker nötig, alle Dateien liegen lokal).
- **Online:** Default `https://legion.schleiweb.de`, umstellbar unter OPTIONS → SERVER oder per `--server=URL`. Der Server brauchte keine Änderung: Colyseus erlaubt jede Origin (CORS inkl. Preflight, auch für `/rooms`, `/client-error`, `/solo`). Einladungslinks zeigen auf die Server-URL statt `app://`.
- **Packaging:** electron-builder → NSIS-Installer + portable .exe (`npm run desktop:dist`, unter Windows bauen). Ohne Code-Signing → SmartScreen-Warnung beim ersten Start.
- **Fenster:** Größe/Vollbild werden gemerkt, F11/Alt+Enter oder OPTIONS → FULLSCREEN; kein Menü (Ctrl+R/Ctrl+W stören keine Hotkeys).
- **Speicherstände:** Settings in localStorage reichen vorerst; für die Kampagne später eine echte Save-Datei im App-Datenordner.
- **Offen:** Code-Signing (Zertifikat ja/nein), erster Upload auf itch.io per butler (Befehl im README), Test auf echten Windows-Rechnern (Grafiktreiber, HiDPI), Auto-Update (z. B. electron-updater) erst bei Bedarf.

## Phase 2 – Roguelike-Kampagne (neuer Modus)

- **Run:** Karte aus Knoten (Welle, Elite, Boss, Shop, Event, Rast), Pfad wählbar. Jeder Kampfknoten nutzt die bestehende Sim (eine oder mehrere Wellen). Ein Seed pro Run.
- **Im Run:** Fighter-Draft (1 aus 3 ins Roster – passt zu `PlayerState.fighters` aus der Prophet-Logik), Relikte/Segen (globale Modifier, z. B. +x % Schaden für ein Tier, billigere Mercs), Flüche, Events mit Entscheidungen.
- **Meta-Progression:** Start mit 2–3 Buildern, weitere „Rassen“ durch Fortschritt freischalten; Meta-Währung; wenige permanente Upgrades; Schwierigkeitsstufen (Ascension) statt endloser Stat-Inflation.
- **Story:** leichte Rahmenhandlung pro Akt + Aktboss, eigene Texte.
- **Incremental:** vorerst nur Idee (z. B. Meta-Währung idle sammeln, Prestige-Schicht). Entscheidung nach dem ersten spielbaren Run.
- **Technik-Hooks:** Modifier-Schnittstelle in `game.ts`, Run-Zustand außerhalb der Sim, Save-System, neue Szene für die Run-Karte, Balancing per Bot-vs-Bot-Simulation.
- **MVP:** 1 Akt, 4 Knotentypen, ~10 Relikte, 3 freischaltbare Builder.
- **Offene Fragen:** Koop-Runs (2 Spieler)? Run-Länge (20–40 min)? Gegner nur Wellen-Creeps oder auch Bot-Gegner wie in der Arena?

## Phase 3 – Mobile App

- **Basis:** PWA + Touch sind drin; zuerst auf echtem Handy/Tablet testen (noch offen).
- **Android:** TWA (Bubblewrap) für einen schnellen Store-Eintrag oder Capacitor (gleicher Build, besser offline, mehr Store-Features). Google Play einmalig 25 $.
- **iOS:** Capacitor; Apple Developer 99 $/Jahr. Reine Web-Wrapper werden gern abgelehnt → nativ wirkende Features (Offline, Saves) wichtig.
- **UI:** größeres Touch-Layout für den HUD. Die Kampagne ist der natürliche Mobile-Modus (kurze Sessions).

## Phase 4 – Steam

- **Vorbereitung:** Steam Direct 100 $ pro App; Store-Seite früh als „Coming soon“ für Wishlists; Trailer aus der Shorts-/Showcase-Pipeline; Demo + ggf. Steam Next Fest.
- **Integration:** `steamworks.js` (Achievements, Cloud-Saves, Overlay), Controller-Support, Steam Deck (1280×800, 16:10-Letterbox prüfen).
- **Rechtliches/IP:** Name und Store-Texte prüfen (Legion TD 2 ist kommerziell; nicht als „Remake von …“ bewerben), alle Builder/Fighter mit eigenen Namen, Asset-Lizenzen auflisten (Ninja Adventure CC0 = kommerziell ok). Steuer-/Bankdaten, ggf. Gewerbe, Impressum.
- **Server:** Heim-Laptop reicht für eine Beta; zum Release VPS oder mehrere Instanzen (Räume liegen aktuell im Speicher einer Instanz).
- **Preis/Modell:** offen (günstig Premium? Kampagne als Kaufgrund, Multiplayer kostenlos?).

## Backlog

Bestehende offene Punkte, Details in `CLAUDE.md` („Open“): Balance Wellen 5–10, VFX-Pack (Foozle, wartet auf OK), Prophet-Randomize-Modus, Leak-Bounty-Faktor, Team-Size-Balancing, Musik, `npm audit`, YouTube-Uploads automatisieren.

## Entscheidungspunkte

- ~~Electron vs. Tauri~~ → Electron
- Code-Signing ja/nein
- Kampagne: Koop, Run-Länge, Incremental-Schicht
- TWA vs. Capacitor
- Steam: Preis, Server-Hosting
