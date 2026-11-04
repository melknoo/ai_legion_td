# YouTube Shorts

Ziel: mit kurzen Gameplay-Clips möglichst viele Leute auf https://legion.schleiweb.de bringen. Clips werden im Spiel aufgenommen (`?showcase`) und von Claude über die Chrome-Extension in YouTube Studio hochgeladen.

## Stand (04.11.2026) und nächste Schritte

- 04.11.: Wegen HUD-Rework und neuer Karte zeigen alle 8 Shorts der ersten Runde den alten Look → werden durch 8 neue ersetzt („Zweiter Vorrat“ unten, Trailer 04.11. 19:00, dann täglich 17:30 bis 11.11.). Die alten gehen auf **privat** (nicht gelöscht), sobald der Ersatz hochgeladen ist; `MS5itYsEWwY` (04.11.) ist schon privat.
- Seit dem Kampf-Fix (Commit 2c02880) enden Bot-gegen-Bot-Partien meist bei Welle 4–9. Seeds, die weiter kommen (1v1, `ap`, ohne `vs`): canopy 4 (bis Welle 27, Boss 10 + 20 gehalten), Boss 10 gehalten: warclan 3, chimera 3/15, canopy 3/5, abyss 3/4/5/15, primal 2/5; Boss 10 leakt: primal 3, crypt 4/5.
- Kanal eingerichtet, Showcase-Modus + Aufnahme gebaut, Trailer-Short (01.11., 19:00) und erste Woche (7 Shorts, 3.–9.11., je 17:30) geplant hochgeladen – Liste unten unter „Erster Vorrat“.
- `?ref=yt`-Zählung ist gebaut (`/stats`, `visits.jsonl`); der Owner deployt sie am 01.11. per `npm run deploy`. Prüfen: nach dem Deploy `https://legion.schleiweb.de/?ref=yt` öffnen, dann erscheint auf `/stats` eine Zeile unter „Visits from links“.
- Als Nächstes:
  1. Bis ~08.11.: zweite Woche (10.–16.11.) vorbereiten – Seeds mit `scout.ts` suchen, Clips aufnehmen, Einträge an `tools/shorts/schedule.json` anhängen; der Owner committet (= Freigabe), dann hochladen wie in Abschnitt 5. Mehr Abwechslung: Fails/Leaks, Welle 30, Chimera, Devlog.
  2. Ab ~10.11.: erste Auswertung (YouTube Analytics + `/stats`), Tabelle unten füllen.
  3. Offen/optional: Ton lauter (Spitze ~0,1), Zeitlupe bei Boss-Tod, Duelle mit zwei Lanes, Upload-Vorlage im Kanal, Telefon-Verifizierung (Owner).
  4. Stufe B (automatischer Upload vom Laptop per API) erst nach Google-Cloud-Einrichtung und API-Audit, siehe [shorts-upload.md](shorts-upload.md).

**Auf einem anderen PC weitermachen:** `git pull`, `npm install`, `npm run dev`; Chrome mit der Claude-Erweiterung und eingeloggtem YouTube-Konto. `media/clips/` ist nicht in Git – die Clips der ersten Woche sind schon bei YouTube, und jeder Clip lässt sich aus seinem `recipe` in `schedule.json` neu aufnehmen. Für Deploys braucht der PC den SSH-Alias `legion-home` (siehe `docs/hosting.md`).

## 0. Kanal

Kanal: [Legion Pixel – @LegionPixel67](https://www.youtube.com/@LegionPixel67), angelegt am 30.10.2026.

- [x] Banner (2560x1440, [`shorts-banner.png`](shorts-banner.png)): Titelbildschirm ohne Menü, Logo in der Zone, die auf allen Geräten sichtbar ist, links Creeps und rechts Fighter auf der Wiese. Gebaut im laufenden `TitleScene` (Dev-Build, `window.__phaser`), per `renderer.snapshot` ohne Glättung hochskaliert.
- [x] Profilbild: `client/public/icons/icon-maskable-512.png` (randlos, passt in den Kreis).
- [x] Kanal-Keywords (01.11.): legion pixel, tower defense, pixel art, browser game, legion td, indie game, multiplayer. Wohnsitzland nicht gesetzt (Sache des Owners).
- [x] Englische Beschreibung + Kanal-Link „Play free“ → `https://legion.schleiweb.de/?ref=yt`.
- [x] Playlists „Boss moments“ und „Satisfying“ (weitere Säulen bekommen ihre Playlist beim ersten Clip).
- [ ] Upload-Vorlage im Kanal (Standard-Beschreibung, Tags, „Nicht speziell für Kinder“) – bisher setzt Claude alles pro Video.
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

## 4. Technische Umsetzung

### a) Showcase-Modus (`?showcase`) – gebaut und im Browser getestet (31.10.2026)

Beispiel: `http://localhost:5173/?showcase&seed=7&wave=10&builder=grove&vs=corsair&title=Can+this+build+hold+the+boss%3F&rec&timeout`

| Parameter | Wirkung |
|---|---|
| `seed=N` | Partie reproduzierbar (auch die zufälligen Builder), Standard 1 |
| `wave=N` | spielt ohne Rendern bis zur Bauphase von Welle N vor |
| `lane=N` | gezeigte Lane = Spielerindex (0 = eigener Sitz, bei `size=1` ist 1 der Gegner) |
| `builder`, `vs`, `size`, `mode` | eigener Builder, Builder des ersten Gegner-Bots, Teamgröße, Modus |
| `title=…` | Hook-Text oben (Großbuchstaben, umbricht automatisch) |
| `rec` | nimmt den ersten Kampf auf, bis die gezeigte Lane frei ist, + 1,5 s Nachlauf (max. 58 s), und speichert `media/clips/legion-s<seed>-w<welle>-l<lane>-<builder>.webm` (außerhalb des Dev-Servers: Download) |
| `from=N`, `len=N` | Aufnahme erst N s nach Kampfbeginn starten (wenn die Lane voll ist); mit `len` läuft der Clip fest N s (endet nur früher, wenn die Welle endet), ohne HELD/LEAKED-Einblendung – für Trailer |

- Canvas 1080x1920, keine HUD (UiScene läuft unsichtbar weiter), Spielfeld 6x gezoomt in der Mitte (volle Lane-Höhe) (`SHOWCASE_FIELD` in `client/src/showcase/ShowcaseScene.ts`), darunter Welle + Builder und `LEGION.SCHLEIWEB.DE`. Die Texte sind auf 540x960 angeordnet und werden 2x gezeichnet.
- Kamera: in der Bauphase auf die Armee, im Kampf auf den Boss (falls einer da ist), sonst auf die kämpfenden Einheiten.
- Spieler 0 spielt per `botCommands` (`LocalSession` mit `autopilot`), Bauphasen laufen 6x schneller.
- Showcase-Spiele gehen nicht in die `/solo`-Statistik.
- `P` startet/stoppt eine Aufnahme von Hand. Während der Aufnahme steht `data-clip="recording"` am `<body>`, danach `saved` und in `data-clip-file` der Pfad.
- Ende eines Clips: Die Welle endet erst, wenn alle Lanes frei sind, und im selben Tick setzt die Simulation die Fighter zurück. Darum stoppt die Aufnahme, sobald die gezeigte Lane frei ist; endet die Welle vorher (letzter Kill oder Leak), hält BattleScene Simulation und Kamera für den Nachlauf an.
- Ton kommt nur mit, wenn der Browser Audio freigegeben hat: einmal auf die Seite klicken, bevor der Kampf beginnt.
- Noch offen: Zeitlupe bei Kills/Boss-Tod, Duelle mit zwei Lanes übereinander. Große Boss-Sprites in der obersten Reihe werden oben etwas angeschnitten.

**Seeds finden:** `npx tsx tools/shorts/scout.ts <builder> [vs] [size] [anzahl]` spielt Bot-Partien ohne Bild durch (genau wie `?showcase`) und listet pro Seed die letzte Welle und die Builder. Bot-gegen-Bot-Partien enden oft früh; für Boss-Clips (Welle 10/20) Seeds mit „last wave“ ≥ 11 bzw. ≥ 21 nehmen. Beispiel: `clockwork`, Seed 7 → Welle 23 (Boss 10 und 20).

**Ende eines Clips:** groß über dem Feld „HELD!“ (grün) oder „N LEAKED!“ (rot) – die Antwort auf die Frage im Hook. Die Lane gilt als frei, wenn dort keine Creeps/Sends mehr sind und keine mehr spawnen (`Game.laneHasAttackers`).

**Erster Vorrat (01.11.2026):** 7 Clips, vom Owner freigegeben (`tools/shorts/schedule.json`) und per Chrome mit „Planen“ hochgeladen:

| Termin (17:30, GMT+1) | Titel | Video | Playlist |
|---|---|---|---|
| 01.11. 19:00 | Legion Pixel – free tower defense in your browser (Trailer, Grove Welle 27) | [7QaJUATmbB0](https://youtube.com/shorts/7QaJUATmbB0) | – |
| 03.11. | Can this build beat the first boss? | [EBBypkUOTyY](https://youtube.com/shorts/EBBypkUOTyY) | Boss moments |
| 04.11. | Will Frost hold the boss? | [MS5itYsEWwY](https://youtube.com/shorts/MS5itYsEWwY) | Boss moments |
| 05.11. | Three wave 20 bosses vs. Warclan | [8kySJCc3Fd4](https://youtube.com/shorts/8kySJCc3Fd4) | Boss moments |
| 06.11. | Watch the whole wave melt | [FPFfnJB2uxA](https://youtube.com/shorts/FPFfnJB2uxA) | Satisfying |
| 07.11. | Can Tidal stop the boss? | [mcVy7mjTcd8](https://youtube.com/shorts/mcVy7mjTcd8) | Boss moments |
| 08.11. | Can Canopy survive wave 20? | [UPaNG_6AAU4](https://youtube.com/shorts/UPaNG_6AAU4) | Boss moments |
| 09.11. | Clockwork vs. the first boss | [5m1iAheCQZM](https://youtube.com/shorts/5m1iAheCQZM) | Boss moments |

Seit 04.11. privat (ersetzt durch den zweiten Vorrat, alter Look). In `schedule.json` tragen diese Einträge `retired` und `videoId`.

**Zweiter Vorrat (04.11.2026, neuer Look):** 8 Clips, Rezepte in `schedule.json` (`v2-…`), MP4 per `tools/shorts/to-mp4.sh`, danach umbenannt nach `<Termin>-<trailer|short>-<builder>-<inhalt>.mp4` (Feld `clip`):

| Termin (17:30, GMT+1) | Titel | Clip | Ergebnis | Video | Playlist |
|---|---|---|---|---|---|
| 04.11. 19:00 | Legion Pixel – free tower defense in your browser (Trailer) | canopy s4 w25 | – | | – |
| 05.11. | Can Warclan beat the first boss? | warclan s3 w10 | HELD | | Boss moments |
| 06.11. | Watch the whole wave melt | abyss s4 w15 | HELD | | Satisfying |
| 07.11. | Can Clockwork survive wave 9? | clockwork s2 w9 | 27 LEAKED | | Fails (neu) |
| 08.11. | Can Canopy hold three bosses? | canopy s4 w20 | HELD | | Boss moments |
| 09.11. | Random eggs vs. the boss | chimera s15 w10 | HELD | | Boss moments |
| 10.11. | Will the boss get through? | primal s3 w10 | 1 LEAKED | | Boss moments |
| 11.11. | Will Abyss hold the boss? | abyss s4 w10 | HELD | | Boss moments |

Upload per Chrome: Das Upload-Werkzeug der Erweiterung nimmt nur Dateien bis 10 MB. Darum wandelt `sh tools/shorts/to-mp4.sh media/clips/<clip>.webm` jeden Clip in ein H.264-MP4 unter 10 MB (≤ 2,6 Mbit/s, sieht bei Pixel-Art aus wie das WebM; Ton per `loudnorm` lauter; ffmpeg per winget `Gyan.FFmpeg`, Pfad über `FFMPEG_DIR`). Das lädt Claude selbst hoch und füllt die Entwürfe aus (Titel, Text, Tags, Playlist, „nicht für Kinder“, Termin).

Stumm aufnehmen: Im Tab vor dem Klick `__phaser.sound.masterVolumeNode.disconnect(__phaser.sound.context.destination)` ausführen (Dev-Build) – die Lautsprecher sind dann still, der Abgriff des Recorders bekommt den Ton weiter.

### b) Aufnahme im Browser – gebaut (`client/src/showcase/recorder.ts`)

- `canvas.captureStream(30)` + Abgriff am Master-Gain des Phaser-WebAudio → `MediaRecorder` (VP9/Opus, 12 Mbit/s) → WebM-Download.
- Mit `?timeout` läuft das Spiel mit 30 fps, auch wenn das Chrome-Fenster im Hintergrund ist. Der Ton ist eher leise (Spitze ~0,1); bei Bedarf später normalisieren.
- YouTube nimmt WebM direkt an; ffmpeg ist auf dem Dev-Rechner nicht installiert, Nachbearbeitung erst bei Bedarf.

### c) Clip-Pipeline

- `tools/shorts/schedule.json`: pro Short Clip-Datei, Rezept (URL-Parameter), Termin, Titel, Beschreibung, Tags, Playlist. Ein Eintrag, den der Owner committet, ist die Freigabe.
- Claude nimmt Clips über Chrome auf (Seite mit Parametern öffnen, einmal klicken, Partie laufen lassen). Der Dev-Server speichert sie in `media/clips/` (gitignored; Chrome blockiert wiederholte automatische Downloads), der Owner sichtet sie.
- Zeitplan und automatischer Upload vom Heim-Laptop: [shorts-upload.md](shorts-upload.md).
- Rohclips und Exporte bleiben außerhalb von Git (gitignored `media/`).

## 5. Upload über Claude in Chrome

- Der Owner ist in YouTube Studio eingeloggt. Ablauf je Short (so lief die erste Woche):
  1. Datei hochladen: bis 10 MB per `file_upload` der Erweiterung, größere zieht der Owner in den Upload-Dialog (mehrere auf einmal; die Entwürfe bleiben privat).
  2. Claude öffnet den Entwurf („Entwurf bearbeiten“) und setzt aus `schedule.json`: Titel (endet auf `#shorts`), Beschreibung (mit `legion.schleiweb.de/?ref=yt`), Playlist, „Nein, es ist nicht speziell für Kinder“, unter „Mehr anzeigen“ die Tags.
  3. Sichtbarkeit → „Veröffentlichungszeitpunkt festlegen“: Datum + Uhrzeit, Zeitzone GMT+01:00 (Ortszeit) → „Veröffentlichungszeitpunkt festlegen“.
  4. Am Ende in der Shorts-Liste und unter Playlists prüfen, dass alles „Geplant“ ist und die Playlists stimmen.
- **Hochgeladen wird nur, was in einem committeten `schedule.json`-Eintrag steht** (die Freigabe des Owners).
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
2. ~~Showcase-Modus + Hochformat~~ (gebaut).
3. Aufnahme im Browser (gebaut), `?ref=yt`-Zählung (gebaut, `server/src/monitor.ts`, `/stats`).
4. ~~Puffer von ~7 Clips aufnehmen, Owner sichtet~~ (erledigt, geplant 3.–9.11.).
5. Wöchentlich: Clips für die nächste Woche, Freigabe per Commit, geplant hochladen, auswerten.
