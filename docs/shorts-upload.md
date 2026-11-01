# Shorts automatisch hochladen – Plan

Ziel: Clips und ein Zeitplan liegen auf dem Heim-Laptop (dem Rechner, auf dem auch das Spiel läuft). Ein Timer lädt jeden Short zu seiner Zeit selbst hoch, ohne dass jemand am PC sitzt. **Stand: nur Plan, noch nichts umgesetzt.** Clips entstehen wie in [shorts.md](shorts.md) beschrieben.

## Der Haken: API-Audit

Hochladen per Programm geht nur über die **YouTube Data API v3** (`videos.insert`). Claude in Chrome braucht ein Chrome-Fenster mit angemeldetem Konto; auf dem Laptop ohne Bildschirm ist das unzuverlässig.

- Videos, die ein **nicht geprüftes** API-Projekt hochlädt, bleiben **dauerhaft privat**, egal was `privacyStatus` oder `publishAt` sagt. Erst ein Audit durch YouTube („YouTube API Services – Audit and Quota Extension Form“ in der Cloud Console) hebt das auf. Das dauert erfahrungsgemäß Tage bis Wochen.
- Das Quota reicht für einen Short pro Tag locker. Google hat 2026 die Quota-Einteilung umgestellt; vor dem Start die aktuelle Grenze in der Cloud Console ablesen.

Darum zwei Stufen:

| Stufe | Wie | Wann |
|---|---|---|
| **A – sofort** | Claude lädt einen Wochen-Vorrat per Chrome in YouTube Studio hoch, jeweils mit **„Planen“** (Datum/Uhrzeit). YouTube veröffentlicht dann selbst. Kein Server nötig. | ab jetzt |
| **B – Server** | Der Laptop lädt per API zur geplanten Zeit hoch (Timer + Upload-Script). | sobald das Audit durch ist |

Beide Stufen nutzen denselben Zeitplan, sodass der Wechsel nichts am Ablauf ändert.

## Zeitplan im Repo: `tools/shorts/schedule.json`

Der Zeitplan ist öffentlich im Repo, die Videos nicht (zu groß, und sie lassen sich aus dem Rezept jederzeit neu erzeugen). **Ein Eintrag, den der Owner committet, gilt als Freigabe** für genau diesen Upload mit diesem Titel und Text.

```json
[
  {
    "id": "boss-w10-s7",
    "clip": "legion-s7-w10-l0.webm",
    "recipe": "?showcase&seed=7&wave=10&title=Can+this+build+beat+the+boss%3F&rec",
    "publishAt": "2026-11-10T17:30:00+01:00",
    "title": "Can this build beat the boss? #shorts",
    "description": "Free browser tower defense, inspired by Legion TD Mega. Play: legion.schleiweb.de/?ref=yt",
    "tags": ["tower defense", "pixel art", "indie game", "legion td"],
    "playlist": "Boss moments"
  }
]
```

- `clip` ist der Dateiname aus `media/clips/`; `recipe` erzeugt ihn neu (`http://localhost:5173/` + Rezept).
- Was hochgeladen ist, steht **nicht** im Repo, sondern in einer Statusdatei auf dem Laptop (Video-ID, Zeitpunkt). So gibt es keine Commits vom Server aus.

## Stufe B im Detail

### Auf dem Laptop

Das Spiel liegt unter `~/legion-pixel` und wird bei jedem `npm run deploy` komplett ersetzt (nur `deploy/home/.env` wird übernommen). Shorts-Daten liegen deshalb daneben, nicht darin:

```
~/legion-shorts/
  clips/          # .webm-Dateien, per Sync vom Windows-PC
  state.json      # hochgeladene IDs, schreibt nur das Upload-Script
  .env            # YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN – mode 600, nur der Owner trägt ein
```

Einen eigenen Git-Clone auf dem Laptop braucht es nicht: Der Deploy bringt `tools/shorts/` und `schedule.json` schon mit. (Ein Clone ginge auch, wäre dann aber ein zweiter Stand neben dem Deploy.)

### Bausteine (von Claude zu bauen)

1. **`tools/shorts/upload.ts`** – ohne neue npm-Pakete, nur `fetch`:
   - liest `schedule.json`, `state.json` und `.env`;
   - nimmt Einträge, deren `publishAt` in den nächsten 24 h liegt und die noch nicht in `state.json` stehen;
   - holt mit dem Refresh-Token ein Access-Token, lädt per Resumable Upload als `private` mit `publishAt` hoch (YouTube schaltet dann selbst frei), legt das Video in die Playlist und schreibt die ID in `state.json`;
   - Probelauf mit `--dry-run`, JSON-Logzeilen wie der Server (`shorts.upload`, `shorts.error`).
2. **`tools/shorts/auth.ts`** – einmalig auf dem Windows-PC: öffnet den Google-Login (Loopback-Redirect auf `localhost`) und gibt den Refresh-Token **nur im Terminal des Owners** aus. Claude sieht und speichert ihn nie.
3. **Lauf auf dem Laptop** – ein `shorts`-Dienst in `deploy/home/compose.yml` mit `profiles: [shorts]` (startet nicht mit dem Spiel): Node-Image, `~/legion-shorts` gemountet, read-only Root wie der Spiel-Container. Ein systemd-Timer (oder Cron) ruft stündlich `docker compose --profile shorts run --rm shorts` auf. Den Timer richtet der Owner ein, falls dafür sudo nötig ist.
4. **`npm run shorts:sync`** – kopiert neue Clips aus `media/clips/` per `scp` nach `legion-home:~/legion-shorts/clips/` (SSH-Alias wie beim Deploy).

### Einmalige Einrichtung (Owner)

1. Google Cloud Console: Projekt anlegen, **YouTube Data API v3** aktivieren.
2. OAuth-Zustimmungsbildschirm „Extern“, Scope `youtube.upload` (+ `youtube` für Playlists). App auf **„In Produktion“** stellen: Im Status „Testen“ laufen Refresh-Tokens nach 7 Tagen ab. Für den eigenen Kanal reicht eine nicht verifizierte App (Warnhinweis beim Login einmal wegklicken).
3. OAuth-Client vom Typ „Desktop-App“ anlegen, `auth.ts` ausführen, die drei Werte in `~/legion-shorts/.env` eintragen.
4. **Audit beantragen** (Formular „YouTube API Services – Audit and Quota Extension“). Begründung: eigener Kanal, Uploads der eigenen Gameplay-Clips, ein Video pro Tag.
5. Bis das Audit durch ist: Stufe A.

## Ablauf pro Woche

1. Claude sucht Seeds (`tools/shorts/scout.ts`), nimmt ~7 Clips auf (`media/clips/`) und schlägt Einträge für `schedule.json` vor (Titel, Text, Zeit).
2. Der Owner sieht die Clips durch, passt an und **committet den Zeitplan** (= Freigabe).
3. Stufe A: Claude lädt die freigegebenen Einträge per Chrome mit „Planen“ hoch.
   Stufe B: `npm run shorts:sync` + Deploy; der Timer erledigt den Rest.
4. Einmal pro Woche: Analytics ablesen, Tabelle in [shorts.md](shorts.md) ergänzen.

## Sicherheit

- Tokens nur in `~/legion-shorts/.env` (mode 600) und im Terminal des Owners. Nie ins Repo, nie in Logs, nie in Chat.
- Das Upload-Script lädt nur, was im committeten `schedule.json` steht; es veröffentlicht nichts Neues von sich aus und löscht nichts.
- Der Dienst läuft nur bei Bedarf und ist nicht von außen erreichbar (kein Port, kein Tunnel-Eintrag).
