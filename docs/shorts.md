# YouTube Shorts – Plan

Ziel: mit kurzen Gameplay-Clips möglichst viele Leute auf https://legion.schleiweb.de bringen. Clips werden im Spiel aufgenommen und von Claude über die Chrome-Extension in YouTube Studio hochgeladen. **Stand: nur Plan, noch nichts umgesetzt.**

## 0. Kanal anlegen (vor dem ersten Upload)

- Es gibt noch keinen Kanal. Der Owner legt ihn im eigenen Google-Konto an (Kontoerstellung und Telefon-Verifizierung macht der Owner selbst), danach hilft Claude per Chrome beim Einrichten.
- Name: „Legion Pixel“, Handle z. B. `@legionpixel` (Verfügbarkeit prüfen).
- Englische Kanalbeschreibung mit Link `https://legion.schleiweb.de/?ref=yt`, derselbe Link in den Kanal-Links im Profil.
- Branding nur aus eigenen Assets: Profilbild aus den App-Icons (`tools/make-icons.mjs`), Banner aus einem Spiel-Screenshot im Pixel-Look (2560x1440, sichere Zone in der Mitte beachten).
- Einstellungen: Standard „Nicht speziell für Kinder“, Upload-Vorlage mit Standard-Beschreibung und Tags, eine Playlist pro Content-Säule.
- Telefon-Verifizierung einplanen (nötig für eigene Thumbnails und längere Videos).

## 1. Ziel und Kennzahlen

- Es zählen Spieler, nicht nur Views. Gemessen werden:
  - Views und „Weitergesehen vs. weggewischt“ (YouTube Analytics),
  - Abos,
  - Besuche mit `?ref=yt` (wird in `/stats` gezählt, kleine Ergänzung in `server/src/monitor.ts`).
- Sprache: englische Titel und Texte im Clip (größere Zielgruppe), Beschreibung kurz zweisprachig.

## 2. Format-Regeln

- Hochformat 9:16 (1080x1920), 15–35 s.
- Hook in der ersten Sekunde: Text + Action, kein Intro, kein Logo vorneweg.
- Das Ende geht nahtlos in den Anfang über (Loops zählen als Rewatch).
- Aufbau: großer Text oben (Frage/Spannung), Spielfeld in der Mitte stark gezoomt, unten Platz für die YouTube-Bedienelemente lassen.
- Ton: Spiel-SFX + Jingles aus dem CC0-Pack. Keine urheberrechtlich geschützte Musik.
- Devlog-Shorts nur mit Text-Overlays + Gameplay, keine Stimme, kein Gesicht.
- Rechtliches: keine Blizzard-Assets oder -Namen im Bild. „Inspired by Legion TD“ darf in Beschreibung und Hashtags stehen (Suchbegriff), das Spiel aber nie als offizielles Produkt darstellen.

## 3. Content-Säulen (rotieren)

| Säule | Idee | Hook-/Titel-Vorlagen |
|---|---|---|
| Boss-Momente | Welle 10/20/30 gegen eine Build | „Can this build hold wave 30?“ · „The boss had 1 HP left…“ · „Wave 20 boss vs. 6 fighters“ |
| Builder-Duelle | Builder A vs. B, gleicher Seed | „Which builder wins? Comment before the end“ · „Fire vs. Ice – same gold, same wave“ · „Worst builder vs. best builder“ |
| Satisfying | Kettenkills, große AoE, Chimera-Ei schlüpft | „Watch the whole wave melt“ · „This egg hatched into…“ · „100 creeps, 3 seconds“ |
| Fails/Leaks | King fast tot, Comeback in letzter Sekunde | „I almost lost to wave 7“ · „One leak away from losing“ · „How did this hold?!“ |
| Devlog | Remake im Browser, Vorher/Nachher, neue Features | „I'm remaking a WC3 classic in the browser“ · „Day 1 vs. now“ · „I added 232 fighters to my game“ |
| Challenges | Einschränkungen und Zufall | „Only one fighter type – can it win?“ · „No upgrades challenge“ · „Random builder every game“ |

Duelle und „Comment before the end“-Hooks bringen Kommentare, das hilft der Reichweite am meisten.

## 4. Technische Umsetzung (spätere Schritte, nach Freigabe)

### a) Showcase-Modus im Client (`?showcase`)

- Spieler 0 wird ebenfalls von `botCommands` (`shared/src/sim/bot.ts`) gesteuert.
- `?seed=` wird an `LocalSession` (`client/src/session/LocalSession.ts`, nimmt schon einen Seed) durchgereicht → Partien sind reproduzierbar.
- `?wave=N` / Startgold, um direkt zu interessanten Wellen zu springen; optional feste Builds pro Seite für Duelle. Baut auf `soloFromUrl()` in `client/src/scenes/BattleScene.ts` auf.
- HUD ausblenden, „Regie“-Kamera: Zoom auf das dichteste Kampfgeschehen, kurze Zeitlupe bei großen Kills und Boss-Tod.
- Hochformat: eigenes Layout 540x960 (Canvas-Größe per Parameter), Textbalken oben/unten mit Hook-Text aus `?title=` und der Spiel-URL als Wasserzeichen.

### b) Aufnahme im Browser

- `canvas.captureStream(60)` + Audio aus dem WebAudio-Kontext (`MediaStreamAudioDestinationNode`) → `MediaRecorder` → WebM-Download.
- Start/Stopp per Taste oder automatisch über Spiel-Events (Welle startet/endet, Boss stirbt).
- Optional Nachbearbeitung mit ffmpeg (WebM → MP4, schneiden, Lautstärke normalisieren) per Script in `tools/shorts/`. Keine neuen npm-Pakete nötig.

### c) Clip-Pipeline

- `tools/shorts/queue.json`: pro Clip Seed, Builder, Welle, Hook-Text, Titel, Hashtags, Status.
- Claude nimmt Clips über Chrome auf (Seite mit Parametern öffnen, Partie laufen lassen, Datei landet im Downloads-Ordner), der Owner sichtet sie.
- Rohclips und Exporte bleiben außerhalb von Git (gitignored `media/`).

## 5. Upload über Claude in Chrome

- Der Owner ist in YouTube Studio eingeloggt. Claude öffnet studio.youtube.com, lädt die Datei hoch und setzt:
  - Titel, Beschreibung (Link mit `?ref=yt`, „Inspired by Legion TD Mega, free in the browser“),
  - Hashtags: `#shorts #towerdefense #pixelart #indiegame #legiontd`,
  - „Nicht speziell für Kinder“, Playlist, Sichtbarkeit.
- **Jeder Upload wird vorher vom Owner bestätigt.** Standard: als „Privat“ oder „Geplant“ hochladen, der Owner gibt frei.
- Links in Shorts-Beschreibungen sind nicht klickbar → Link im Kanalprofil, angepinnter Kommentar, „Related video“ auf ein längeres Gameplay-Video.
- Kein Bot-artiges Verhalten: normales Tempo, keine Massen-Uploads, keine automatischen Kommentare oder Likes.

## 6. Rhythmus und Auswertung

- Vor dem Start ~7 fertige Clips als Puffer, dann 1 Short pro Tag für 3–4 Wochen, feste Uhrzeit (z. B. 17–19 Uhr).
- Wöchentlich liest Claude YouTube Analytics in Chrome ab und trägt die Werte unten ein. Säulen mit gutem „Weitergesehen“-Wert kommen öfter.
- Später: dieselben Clips auf TikTok / Instagram Reels (manuell durch den Owner). Kommentare als Ideenquelle für Devlog-Shorts.

### Auswertung

| Woche | Shorts | Views | Weitergesehen | Abos | Besuche `?ref=yt` | Beste Säule |
|---|---|---|---|---|---|---|
| – | | | | | | |

## Reihenfolge

1. Kanal anlegen und einrichten (Owner + Claude).
2. Showcase-Modus + Hochformat.
3. Aufnahme im Browser, `?ref=yt`-Zählung.
4. Puffer von ~7 Clips aufnehmen, Owner sichtet.
5. Täglich hochladen (mit Freigabe), wöchentlich auswerten.
