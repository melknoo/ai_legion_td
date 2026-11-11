# Reichweite: Stand und Post-Entwürfe

Stand 10.11.2026. Ziel: Playtester und Reichweite für https://legion.schleiweb.de. Nichts hiervon ist gepostet; jeder Text braucht die Freigabe des Owners.

## Zahlen (abgelesen 10.11.)

| Quelle | Wert |
|---|---|
| itch.io (30 Tage) | 27 Views, 10 Browser-Plays, 0 Kommentare, 0 Ratings; 130 Impressions in 7 Tagen, CTR 0,77 % |
| itch.io Herkunft | itch-Listen „newest tower defense / multiplayer“ 9, Reddit 5, Google 1 |
| YouTube @LegionPixel67 (28 Tage) | 635 Views, 2 Abos, 85 % weggewischt (Details in [shorts.md](shorts.md)) |
| `/stats` | `?ref=yt` 2 Besuche, `?ref=itch` 1–3 pro Tag, keine Online-Partie |

## Wer kann was

| Ort | Claude per Chrome-Extension | Owner |
|---|---|---|
| YouTube Studio | lesen und hochladen geht (Konto eingeloggt) | Clips per Commit in `tools/shorts/schedule.json` freigeben |
| itch.io | Spielseite und Analytics gehen; Devlog nach Freigabe des Textes | – |
| Discord | Server und Kanäle anlegen, sobald eingeloggt | einloggen (Passwort gibt Claude nie ein) |
| Reddit | gesperrt (die Extension lässt die Seite nicht zu) | selbst posten, Texte unten |
| Hacker News | nur mit eingeloggtem Konto | Konto, einloggen |

## Erledigt (10.11.)

- itch.io-Devlog veröffentlicht: https://melleeee.itch.io/legion-pixel/devlog/1767908/roguelike-campaign-preview-pause-menu-and-a-feedback-link
- itch.io-Seite: Absatz zur Kampagne, Discord-Link, Tag `roguelike`.
- Discord-Server „Legion Pixel“ mit `#announcements`, `#feedback`, `#bugs`, `#find-a-game`, `#campaign`; Einladung ohne Ablauf: https://discord.gg/UXxjjqBTjC (steht als `FEEDBACK_URL` in `client/src/links.ts`).
- YouTube-Kanal: Link „Discord“ im Profil.

## Entwürfe

Tracking: jeder Link bekommt ein eigenes `?ref=` (wird auf `/stats` gezählt).

### 1. itch.io Devlog (veröffentlicht 10.11.)

Titel: **Roguelike campaign preview, pause menu and a feedback link**

> Legion Pixel got its first single-player mode this week.
>
> **Campaign (preview, act 1 of 3).** One lane, the waves, no way back. Pick a builder, start with a single fighter and walk a branching map: battles, elites with a twist (armored, frenzied, thorny…), shops, rest sites and treasure. Every won fight lets you draft a new fighter, also from other builders, so each run ends with a different army. The act ends with the wave 10 boss. The run saves itself, so you can stop any time.
>
> **Also new**
> - Solo and campaign games can be paused (P or Esc) and keep running when the tab is in the background.
> - Elite fights tell you what makes their waves special before they start.
> - The title screen shows the build version and a feedback link.
>
> **I'm looking for playtesters.** What I'd love to hear: which builder felt too weak or too strong in the campaign, where a run ended and why, and anything that was confusing in the first five minutes. Leave a comment here.
>
> Play in the browser, free, no account: https://legion.schleiweb.de/?ref=itch

### 2. r/playmygame (Owner postet; vorher die Regeln in der Sidebar lesen, Flair setzen)

Titel: **Legion Pixel – free browser tower defense with a new roguelike campaign (looking for feedback on balance)**

> I'm building a pixel-art tower defense in the browser: you build fighters on your lane, they fight the waves on their own, and whatever leaks runs to your king. There's solo vs. bots, online 1v1 up to 4v4, and since this week a roguelike campaign (act 1): branching map, draft a new fighter after every fight, elites, shops, a boss at the end.
>
> Free, no account, no download: https://legion.schleiweb.de/?ref=reddit
>
> What I'd like to know:
> - Did you understand what to do in the first two minutes?
> - Which builder did you pick in the campaign, and where did the run end?
> - Anything that felt unfair or boring?
>
> It's inspired by the WC3 custom map Legion TD (fan project, not affiliated). Art is the CC0 Ninja Adventure pack. Thanks for trying it!

### 3. r/WebGames (Owner postet; dort zählt ein direkter Link zum Spiel, Titel = Spielname + ein Satz)

Titel: **Legion Pixel – pixel tower defense with a roguelike campaign, solo or online up to 4v4**

Link: `https://legion.schleiweb.de/?ref=webgames`

### 4. Show HN (später, wenn Feedback aus 1–3 eingearbeitet ist)

Titel: **Show HN: Legion Pixel – a multiplayer tower defense in the browser (Phaser, Colyseus)**

> A deterministic simulation in TypeScript runs on the server (Colyseus) for online games and in the browser for solo games and the roguelike campaign; the client is Phaser 4. Hosted on a laptop at home behind a Cloudflare Tunnel. Happy to answer questions about the netcode (patches plus per-tick event batches, played back 100+ ms behind the server) and about keeping a 4v4 fight at ~13 draw calls on phones.
>
> https://legion.schleiweb.de/?ref=hn

Hinweis: Vor Show HN muss der Server mehr als 40 Räume / einen Besucheransturm aushalten oder es klar sagen.

### 5. Discord-Server „Legion Pixel“

Kanäle: `#announcements` (nur Owner schreibt), `#general`, `#feedback`, `#bugs`, `#find-a-game`, `#campaign`. Einladung ohne Ablauf; der Link kommt in `client/src/links.ts` (`FEEDBACK_URL`), auf die itch-Seite und in die YouTube-Kanalbeschreibung.
