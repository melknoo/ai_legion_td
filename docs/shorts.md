# YouTube Shorts – Plan

Ziel: mit kurzen Gameplay-Clips möglichst viele Leute auf https://legion.schleiweb.de bringen. Clips werden im Spiel aufgenommen und von Claude über die Chrome-Extension in YouTube Studio hochgeladen. **Stand: nur Plan, noch nichts umgesetzt.**

## 0. Kanal

Kanal: [Legion Pixel – @LegionPixel67](https://www.youtube.com/@LegionPixel67), angelegt am 30.10.2026.

- [x] Banner (2560x1440, [`shorts-banner.png`](shorts-banner.png)): Titelbildschirm ohne Menü, Logo in der Zone, die auf allen Geräten sichtbar ist, links Creeps und rechts Fighter auf der Wiese. Gebaut im laufenden `TitleScene` (Dev-Build, `window.__phaser`), per `renderer.snapshot` ohne Glättung hochskaliert.
- [x] Profilbild: `client/public/icons/icon-maskable-512.png` (randlos, passt in den Kreis).
- [x] Englische Beschreibung + Kanal-Link „Play free“ → `https://legion.schleiweb.de/?ref=yt`.
- [ ] Upload-Vorlage (Standard-Beschreibung, Tags, „Nicht speziell für Kinder“), eine Playlist pro Content-Säule.
- [ ] Telefon-Verifizierung (macht der Owner; nötig für eigene Thumbnails und längere Videos).

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

### a) Showcase-Modus (`?showcase`) – gebaut und im Browser getestet (31.10.2026)

Beispiel: `http://localhost:5173/?showcase&seed=7&wave=10&builder=grove&vs=corsair&title=Can+this+build+hold+the+boss%3F&rec&timeout`

| Parameter | Wirkung |
|---|---|
| `seed=N` | Partie reproduzierbar (auch die zufälligen Builder), Standard 1 |
| `wave=N` | spielt ohne Rendern bis zur Bauphase von Welle N vor |
| `lane=N` | gezeigte Lane = Spielerindex (0 = eigener Sitz, bei `size=1` ist 1 der Gegner) |
| `builder`, `vs`, `size`, `mode` | eigener Builder, Builder des ersten Gegner-Bots, Teamgröße, Modus |
| `title=…` | Hook-Text oben (Großbuchstaben, umbricht automatisch) |
| `rec` | nimmt den ersten Kampf auf (bis Wellenende + 1,5 s, max. 58 s) und lädt `legion-s<seed>-w<welle>-l<lane>.webm` herunter |

- Canvas 1080x1920, keine HUD (UiScene läuft unsichtbar weiter), Spielfeld 8x gezoomt in der Mitte (`SHOWCASE_FIELD` in `client/src/showcase/ShowcaseScene.ts`), darunter Welle + Builder und `LEGION.SCHLEIWEB.DE`. Die Texte sind auf 540x960 angeordnet und werden 2x gezeichnet.
- Kamera: in der Bauphase auf die Armee, im Kampf auf den Boss (falls einer da ist), sonst auf die kämpfenden Einheiten.
- Spieler 0 spielt per `botCommands` (`LocalSession` mit `autopilot`), Bauphasen laufen 6x schneller.
- Showcase-Spiele gehen nicht in die `/solo`-Statistik.
- `P` startet/stoppt eine Aufnahme von Hand. Während der Aufnahme steht `data-clip="recording"` am `<body>`, danach `saved`.
- Ton kommt nur mit, wenn der Browser Audio freigegeben hat: einmal auf die Seite klicken, bevor der Kampf beginnt.
- Noch offen: Zeitlupe bei Kills/Boss-Tod, Duelle mit zwei Lanes übereinander. Große Boss-Sprites in der obersten Reihe werden oben etwas angeschnitten.

**Seeds finden:** `npx tsx tools/shorts/scout.ts <builder> [vs] [size] [anzahl]` spielt Bot-Partien ohne Bild durch (genau wie `?showcase`) und listet pro Seed die letzte Welle und die Builder. Bot-gegen-Bot-Partien enden oft früh; für Boss-Clips (Welle 10/20) Seeds mit „last wave“ ≥ 11 bzw. ≥ 21 nehmen. Beispiel: `clockwork`, Seed 7 → Welle 23 (Boss 10 und 20).

**Getestete Clips:** `legion-s7-w10-l0.webm` (Boss Welle 10, 17,6 s, 1080x1920, mit Ton, ~23 MB).

### b) Aufnahme im Browser – gebaut (`client/src/showcase/recorder.ts`)

- `canvas.captureStream(30)` + Abgriff am Master-Gain des Phaser-WebAudio → `MediaRecorder` (VP9/Opus, 12 Mbit/s) → WebM-Download.
- Mit `?timeout` läuft das Spiel mit 30 fps, auch wenn das Chrome-Fenster im Hintergrund ist. Der Ton ist eher leise (Spitze ~0,1); bei Bedarf später normalisieren.
- YouTube nimmt WebM direkt an; ffmpeg ist auf dem Dev-Rechner nicht installiert, Nachbearbeitung erst bei Bedarf.

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

1. ~~Kanal anlegen und einrichten~~ (erledigt bis auf Upload-Vorlage, Playlists und Verifizierung).
2. Showcase-Modus + Hochformat (erste Version gebaut).
3. Aufnahme im Browser (gebaut), `?ref=yt`-Zählung (offen).
4. Puffer von ~7 Clips aufnehmen, Owner sichtet.
5. Täglich hochladen (mit Freigabe), wöchentlich auswerten.
