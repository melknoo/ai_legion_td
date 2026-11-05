# CAMPAIGN – Roguelike-Kampagne (Phase 2)

Design-Dokument für den neuen Modus. Kurzfassung in [roadmap.md](roadmap.md), Spielregeln in [mechanics.md](mechanics.md).

## Stand (5. Nov 2026): M0 + M1 umgesetzt

Akt 1 ist von Start bis Boss spielbar (Menü CAMPAIGN oder `?campaign`). Technik siehe `CLAUDE.md` (Abschnitt Architecture, Campaign).

Umgesetzt:
- **M0**: optionale Sim-Hooks `GameConfig.campaign` (nur Team 0, Wellen-Ausschnitt, Start-Snapshot, Elite-Affix), `game.campaignState()`, `game.pve`. Der Golden-Test (`shared/src/sim/golden.test.ts`) pinnt drei klassische Bot-Partien, eine davon durch die Arena nach Welle 10.
- **M1**: Karte (6 gemischte Zeilen, Rest-Zeile, Boss), Knoten Battle, Elite (5 Affixe), Shop, Rest, Treasure, Boss. Dazu Draft, 7 Relikte und König-HP über den Run. Ein Autosave hält den Run (Profil-Slots kommen in M2). Ein abgebrochener Kampf startet am Knotenanfang neu.

Entscheidungen beim Umsetzen (weichen teils von unten ab):
- **Start:** Man wählt 1 aus T1/T2 des Builders. Einige T1 sind reine Support-Einheiten (z. B. die Pop Mine von Tinker) und halten Welle 1 allein nicht.
- **Draft:**
  - Jeder Builder hat genau 6 Basis-Fighter. Fehlende eigene im Tier-Fenster kommen zuerst, höchstens 2 pro Draft; der Rest kommt aus anderen Buildern.
  - Tier-Fenster in Akt 1: T1–3, bei Elite und Boss +1.
  - Roster-Cap 10. Beim Ersetzen bleiben gebaute Einheiten stehen.
- **Wellen:** Battle und Elite spielen 2 Wellen. Die Wellenstufe hängt von der Zeile ab: (1,2) (2,3) (3,4) (5,6) (6,7) (8,9), der Boss spielt Welle 10.
- **Karte:** Pro Zeile gibt es höchstens 1 Elite, 1 Shop und 1 Rest.
- **Income:** `incomeAt(welle) = 4 + 2·welle` als Basis pro Knoten. König-Upgrades geben weiter +3.
- **König:** Wellen-Buffs und Grants sind aus, weil sich Wellennummern über Knoten wiederholen. Der König wächst nur über Upgrades und Relikte.
- **Preise (Lumber):** Relikt 90, Heilung 50 (+25 %), Rekrut 60. Draft überspringen: +20. Rest: +30 % HP oder +1 Wisp.

Headless-Sim (`npx tsx tools/campaign/sim.ts all 3`, Bot spielt): 16/57 Runs gewonnen (28 %). Typische Bot-Niederlagen:
- Wellen 5–6 (Gale Hawk), wenn der Bot bis dahin nur 1–2 Drafts hatte.
- Boss: Drei Leaks der Warlord-Bosse töten den König.

Für M4 mit Spielgefühl nachjustieren.

## 1. Ziel und Leitplanken

- **CAMPAIGN** ist ein zusätzlicher Solo-Modus im Hauptmenü. Ein Run dauert ~45–60 min: 3 Akte auf einer Lane gegen Wellen, mit Draft, Relikten und Events. Zwischen den Runs gibt es Meta-Progression in Profil-Slots.
- Die klassischen Modi (AP/AR/SD/All Prophet, online und solo) bleiben **unverändert**. Ein Golden-Test stellt sicher, dass klassische Partien mit festen Seeds vor und nach jeder Kampagnen-Änderung identisch ablaufen.
- Die Sim bleibt deterministisch. Ein Run hat einen Seed, jeder Knoten leitet seinen Seed daraus ab.
- Namen und Texte sind eigene Erfindungen (Englisch, wie die UI). Keine Blizzard-Inhalte.
- Koop kommt später, die Architektur soll es zulassen (Abschnitt 10).

## 2. Run-Ablauf

```
Titel → CAMPAIGN → Slot wählen → Hub (Talente, Freischaltungen)
  → Builder wählen → Akt 1: Karte → Knoten … → Boss
  → Akt 2 → Akt 3 → Sieg   (oder: König tot = Niederlage)
  → Renown-Abrechnung → Hub
```

| Akt | Wellenstufen | Boss | Dauer |
|---|---|---|---|
| 1 | 1–9 | Warlord Ignis (Welle 10) | ~15–20 min |
| 2 | 11–19 | Shell Dragon (Welle 20) | ~15–20 min |
| 3 | 21–29 | Mountain Titan (Welle 30) | ~15–20 min |
| (Finale, später) | – | Abyss Lord (Welle 31) | Freischaltung |

Die Creeps kommen aus den bestehenden `WAVES` in `shared/src/data/legion.ts`. Die Stärke richtet sich nach der **Zeile auf der Karte**, nicht nach der Zahl der schon gekämpften Wellen. Wer einen Pfad mit weniger Kämpfen nimmt, bekommt also nicht leichtere Wellen, sondern nur weniger Gold und weniger Drafts.

## 3. Karte und Knoten

Jeder Akt hat eine eigene, geseedete Karte, die von Anfang an sichtbar ist. Sie hat 8 Zeilen mit je 2–4 Knoten, verzweigte Pfade (man wählt jeweils einen der verbundenen Knoten der nächsten Zeile) und oben den Boss.

| Knoten | Inhalt | Lohn |
|---|---|---|
| **Battle** | 2 Wellen der Zeilenstufe | Gold aus den Wellen + Draft |
| **Elite** | 2 Wellen + Affix (siehe unten) | Draft + Relikt |
| **Shop** | Fighter, Relikte, König-Upgrades, Heilung, Roster-Slot entfernen; bezahlt mit Lumber | – |
| **Event** | Textszene mit 2–3 Optionen (Abschnitt 6) | je nach Wahl |
| **Rest** | entweder **Heal** (König +30 % HP) oder **Train** (ein Gratis-Upgrade bzw. +1 Worker) | – |
| **Treasure** | 1 Relikt aus 2 zur Wahl | Relikt |
| **Boss** | Aktboss-Welle | Draft (höheres Tier) + Boss-Relikt + volle Heilung beim Aktwechsel? (offen) |

Regeln für den Generator:
- Zeile 1 ist immer ein Battle.
- Direkt vor dem Boss liegt immer ein Rest.
- Es gibt mindestens einen Shop pro Akt.
- Elites kommen frühestens in Zeile 3.
- Zwei Nicht-Kampf-Knoten folgen nie direkt aufeinander.

**Elite-Affixe** sind Modifier auf den Creeps einer Welle. Technisch nutzen sie `UnitState.mods`/`granted`, die es schon gibt (heute nur für Könige):
- **Armored**: +Rüstung
- **Swift**: +Laufgeschwindigkeit
- **Regenerating**: +Regen
- **Shielded**: Nova-Schild beim Spawn
- **Thorny**: Thorns
- **Horde**: +30 % Anzahl, −20 % HP

## 4. Kampf im Run

- Es ist die bestehende Sim mit einer einzigen eigenen Lane und dem eigenen König.
- Bauen, Upgraden und Verkaufen funktionieren wie klassisch.
- Die Armee bleibt über alle Knoten eines Runs stehen.
- Gold aus den Wellen (Levelbonus) bleibt erhalten.
- Leaks laufen zum eigenen König und schaden ihm. **Die König-HP bleiben über den ganzen Run erhalten.** Heilung gibt es über Rest, Shop, Events, Relikte und König-Regen. Stirbt der König, ist der Run vorbei.
- Es gibt **keine Mercs/Sends und keine Arena**.
- **Lumber** kommt weiter von den Workern und ist die Run-Währung: Shop, Draft-Rerolls, König-Upgrades.
- Ohne Sends fehlt die klassische Income-Quelle. Kandidaten:
  - ein Basis-Income, das pro Akt steigt
  - ein Zins-Relikt
  - Train beim Rest

  Das wird per Headless-Simulation entschieden (offen).

## 5. Draft und Roster

- **Start:** Man wählt einen freigeschalteten Builder und beginnt mit **einem** Tier-1-Fighter aus dessen Pool.
- **Nach jedem Kampfknoten** wählt man 1 aus 3 Fightern. Alternativ überspringt man und bekommt dafür Lumber.
  - Herkunft: ~80 % aus dem eigenen Builder-Pool, ~20 % aus anderen *freigeschalteten* Buildern.
  - Tier-Gewichtung: Akt 1 = T1–2, Akt 2 = T2–4, Akt 3 = T4–6. Elites und Bosse liefern ein Tier höher.
  - Reroll kostet Lumber (Kosten steigen pro Akt).
- Ein gedrafteter Fighter bringt seinen **Upgrade-Baum** mit (`upgradesTo`), die Builder-Identität bleibt also erhalten.
- **Roster-Cap: 10**. Das passt in das 4×3-Build-Grid, die restlichen Slots sind für Reroll und Ähnliches. Ist das Roster voll, ersetzt man einen Fighter (bereits gebaute Einheiten bleiben stehen).
- Technisch ist das `PlayerState.fighters`, wie beim Prophet. Die Build-Prüfung `player.fighters.includes(unitId)` (`game.ts`) funktioniert unverändert.
- Chimera funktioniert wie sie ist (Morph-Eier schlüpfen über `morphPool`).

## 6. Relikte, Flüche, Events

### Relikt-Kategorien

- **Stat**: Multiplikator mit Filter (Tier, Builder, Melee/Ranged, Rüstungstyp)
- **Grant**: verleiht eine der 12 Ability-Arten (`shared/src/sim/abilities.ts`) an gefilterte Einheiten
- **Economy**: Zinsen, Lumber, Rabatte, Verkaufswert
- **King**: HP, Regen, Upgrades
- **Draft**: mehr Optionen, Rerolls, Tier
- **Risk**: starker Bonus mit eingebautem Fluch

Seltenheiten: Common, Rare, Boss (nur von Bossen).

### Beispiel-Relikte

| Name | Seltenheit | Effekt |
|---|---|---|
| Whetstone | Common | Melee +8 % Schaden |
| Fletcher's Kit | Common | Ranged +10 % Angriffstempo |
| Tin Crown | Common | König +15 % Max-HP |
| Piggy Bank | Common | Bei Wellenende +5 % Zinsen auf ungenutztes Gold (max. 25) |
| Woodsman's Axe | Common | +1 Lumber pro Worker-Tick |
| Lucky Clover | Rare | +1 Draft-Option |
| Veteran's Medal | Rare | Upgrades 15 % billiger |
| Vampire Fang | Rare | Alle Melee 8 % Lifesteal |
| Frost Charm | Rare | Ranged-Treffer verlangsamen kurz |
| Bramble Cloak | Rare | Tier-1/2-Fighter bekommen Thorns |
| Old War Banner | Boss | Aura: +2 Rüstung für alle Fighter |
| Cursed Idol | Boss/Risk | Alle Fighter +25 % Schaden, Creeps +15 % HP |

### Flüche

Flüche kommen aus Events und Risk-Relikten:
- **Leaky Roof**: König-Regen 0
- **Heavy Pockets**: −1 Draft-Option
- **Swarm**: +1 Creep pro Welle
- **Rusty Tools**: Worker sammeln 20 % weniger

### Beispiel-Events

Ton: leicht und charmant, 2–3 Optionen pro Event.

1. **The Wandering Merchant**: Tausche einen Roster-Fighter gegen einen zufälligen eine Tier-Stufe höher – oder kaufe ein Relikt für Lumber – oder geh weiter.
2. **A Goblin Asks for Directions**: Hilf ihm (−30 Gold, 50 % Chance auf ein Relikt) oder schick ihn weg.
3. **The Sleepy Dragon** (Akt 2): Schleich vorbei – oder stups ihn an (Elite-Kampf mit großer Belohnung).
4. **Training Grounds**: Eine Einheit bekommt ein Gratis-Upgrade, der König verliert 10 % HP.
5. **The Lost Recruit**: Ein Gratis-Fighter (Tier +1) kommt ins Roster, dazu ein zufälliger Fluch.
6. **The Fortune Teller**: Für Lumber werden die Affixe aller Elites des Akts aufgedeckt und der nächste Draft bekommt +1 Option.
7. **Royal Banquet**: König +30 % HP – oder dauerhaft +1 Worker-Limit.
8. **A Mysterious Egg**: Bekomme ein Morph-Ei (Chimera-Mechanik) ins Roster.
9. **Friendly Rival**: Die nächsten 2 Drafts kommen aus einem anderen Builder-Pool.
10. **Shrine of Echoes**: Opfere ein Relikt und wähle dafür eins aus 3 neuen.

## 7. Meta-Progression (pro Profil)

**Renown** (Arbeitsname) ist die Meta-Währung. Man bekommt sie nach Fortschritt, **auch bei einer Niederlage**. Vorschlag:
- 1 pro geschaffter Welle
- +5 pro Elite
- +15 pro Boss
- +25 für einen Run-Sieg

Renown fließt in drei Bereiche:

1. **Builder freischalten**
   - Man startet mit 3 Buildern. Vorschlag: die 3, die in Bot-Sims (`tools/shorts/scout.ts`) in den Wellen 1–10 am stabilsten sind.
   - Die übrigen gibt es für Renown (gestaffelt 50–150) oder über Bedingungen, z. B. „Akt 2 mit Frost schaffen“ oder „ein Run mit 3 Tidal-Fightern“.
   - Prophet folgt später als reiner Draft-Builder: Er startet ohne eigenen Pool und draftet quer durch alle Builder.
2. **Talentbaum**: ~15 kleine, dauerhafte Boni in drei Ästen. Absichtlich klein, damit Können wichtiger bleibt als Grind.
   - **Treasury**: Startgold +25 (×3), +1 Start-Worker, Shop −10 %
   - **Crown**: König +5 % HP (×3), Rest heilt +10 %, König-Regen +1
   - **Scouting**: +1 Draft-Reroll pro Akt, Elite-Affixe sichtbar, Start mit 2 statt 1 Einheit, Start-Relikt aus 3 wählen
3. **Pool-Erweiterung**: Meilensteine bringen neue Relikte, Events und Knotenvarianten in den Pool, z. B. „Akt 1 geschafft → Treasure-Knoten“, „10 Elites → Rare-Relikte im Shop“, „Akt 3 geschafft → Finale freigeschaltet“.

Bewusst nicht geplant (später vielleicht): Ascension-Stufen und Kosmetik.

## 8. Story

- **Ton:** leicht und charmant, im SNES/FF6-Stil.
- **Präsentation:** Eine Berater-Figur mit Portrait und Textbox (Ninja-Adventure-Facesets: 234 im Pack, `client/public/assets/ninja/Actor/**/Faceset.png`) kommentiert Akt-Intros und -Outros, Bosse und Events.
- **Rahmen (Vorschlag):** Das kleine Königreich des Spielers wird von Horden überrannt. Jeder Akt ist eine Region mit eigenem Bodenstil, passend zu den Creeps der Wellenstufe. Der König ist eitel, aber liebenswert, der Berater trocken.
- **Umfang MVP:** 3 Akt-Intros, 3 Boss-Sprüche, 1 Sieg- und 1 Niederlagen-Text, alles kurz.
- **Sprache:** Englisch. Der Bitmap-Font hat keine Umlaute, i18n kommt später.

## 9. Speicherstände

- **3 Profil-Slots.** Jeder Slot hat eigene Meta-Progression und höchstens einen laufenden Run.
- Slot-Inhalt:
  ```ts
  { version, name, created, playtime,
    meta: { renown, builders, talents, pool, stats },
    run?: RunState }
  ```
- **Autosave** nach jedem Knoten und nach jeder Meta-Änderung (Talent gekauft, Builder freigeschaltet). Ein manuelles Speichern gibt es nicht.
- **Abbruch mitten im Knoten** (Tab zu, Absturz): Beim Fortsetzen beginnt der Knoten von vorn, mit demselben Seed. Dieselben Wellen und Draft-Optionen verhindern Save-Scumming.
- **Run-Snapshot nur an Knotengrenzen.** Dort ist Bauphase und es sind keine Creeps unterwegs, das hält den Snapshot klein. Er enthält:
  - platzierte Einheiten (id, Position, Upgrade-Stand)
  - Gold, Lumber, Worker, Farm-Level
  - König-HP und -Level
  - Roster, Relikte, Flüche
  - Karte, Position und besuchte Knoten
  - Run-Seed und Statistik
- **Speicher-Backend** über ein kleines `SaveStore`-Interface (`list/load/save/delete`). Die erste Umsetzung nutzt localStorage, das funktioniert auch in Electron (liegt dort im userData-Ordner). Später kommen eine Datei im App-Datenordner (mit Phase 1 abstimmen) und Steam Cloud dazu. JSON-Export/-Import als Backup ist optional.
- Jedes Save trägt ein **Versionsfeld** mit Migrationsfunktionen. Ein kaputtes oder unbekanntes Save wird nie überschrieben, sondern als „beschädigt“ angezeigt.
- **Löschen** nur mit Bestätigung im Spiel (kein Browser-Dialog).

## 10. Technik

### Neue, reine Module in `shared/src/campaign/`

Sie sind deterministisch und mit Vitest testbar:
- `run.ts`: `RunState` und Übergänge (`startRun`, `enterNode`, `finishNode`, `applyReward`, …), reine Funktionen
- `map.ts`: Kartengenerator (Seed → Akt-Karte, Regeln aus Abschnitt 3)
- `relics.ts`, `curses.ts`, `events.ts`, `talents.ts`: Daten und Effekte
- `meta.ts`: Renown-Abrechnung, Freischaltungen
- `save.ts`: Schema, Version, Migration

### Relikte als GameData-Transformation

Wo möglich, kopiert ein Relikt die `GameData` und ändert sie: Stats skalieren, Abilities an Unit-Defs hängen, `rules` überschreiben. Das Muster gibt es schon (`?fast` in `client/src/scenes/BattleScene.ts:164`, `withRules` in `shared/src/sim/game.test.ts`). Stat-, Grant- und Economy-Relikte brauchen so **keine Sim-Änderung**.

### Minimale Sim-Hooks

Alle Hooks sind optional in `GameConfig`. Fehlt das Feld, läuft das Spiel klassisch:
- **PvE ohne Gegnerteam.** Heute baut der Game-Konstruktor immer zwei Könige (`game.ts:203`), und Arena und Sends setzen ein zweites Team voraus.
- **Wellenauswahl:** Liste von Wellenstufen pro Knoten, Ende nach N Wellen statt `finish()` nach Welle 30.
- **Start-Snapshot:** Einheiten, Ressourcen, König-HP und -Level.
- **Affixe:** Mods und Grants für gespawnte Creeps (`spawnAttacker`, `game.ts:998`).
- **Golden-Test** für die klassischen Modi.

### Ein Codepfad für Spielen und Laden

Jeder Knoten baut eine frische `Game` aus dem `RunState`-Snapshot. Damit wird Save/Load bei jedem Knoten mitgetestet, statt als selten genutzter Sonderweg zu verrotten.

### Client

- `CampaignSession` auf Basis von `LocalSession` (`client/src/session/LocalSession.ts`)
- neue Szenen: **Slot**, **Hub**, **RunMap**, **Reward**
- Menüpunkt CAMPAIGN in `TitleScene.show('main')`
- Draft, Relikt-Wahl und Events über die bestehenden `showBanner`/`showChoices`, wo das reicht
- Layout 480×270, touch-tauglich (Kampagne = Mobile-Modus)
- In der HUD-Topbar werden König-HP (Run), Lumber und eine Relikt-Leiste sichtbar.

### Balancing

Ein Headless-Run-Simulator `tools/campaign/sim.ts` (Muster `tools/shorts/scout.ts`): Der Bot spielt die Kämpfe (`botCommands` funktioniert für jede Seat), dazu kommen einfache Heuristiken für Pfad, Draft, Relikte und Shop. Ausgabe: Siegquote und mittlere Akt-Erreichung pro Builder über N Seeds. Daran werden Renown-Raten, Income und Elite-Stärke eingestellt.

### Koop später

`RunState` ist pro Spieler indiziert (Roster, Relikte, Lane), Karte und König sind gemeinsam. Die Sim kann schon mehrere Spieler pro Team. Online-Koop wäre dann ein `LegionRoom`-Ableger, der `RunState` statt Lobby-Modus fährt.

### Mit Phase 1 (Standalone, Cloud-Session) abstimmen

Die Kampagne lebt fast nur in neuen Dateien. Gemeinsame Berührungspunkte:
- `TitleScene` (Menüpunkt)
- `SaveStore`-Backend
- ggf. `package.json`

## 11. Meilensteine

| | Inhalt | Fertig wenn |
|---|---|---|
| **M0** | Sim-Hooks (PvE-Lane, Wellenauswahl, Snapshot, Affixe) + Golden-Test | Klassik-Seeds identisch; ein PvE-Knoten läuft headless |
| **M1** | Vertical Slice: 1 Akt, Karte, Battle/Rest/Shop/Boss, Draft, 5 Relikte, König-HP über den Run | Akt 1 im Browser von Start bis Boss spielbar |
| **M2** | 3 Profil-Slots, Autosave, Renown, Builder-Freischaltung, Hub | Run abbrechen und fortsetzen klappt; Builder-Freischaltung klappt |
| **M3** | Inhalt: 3 Akte, Elites + Affixe, ~10 Events, ~25 Relikte, Flüche, Talentbaum, Story-Szenen | kompletter Run 45–60 min |
| **M4** | Balance per Headless-Sim, Polish (SFX, Übergänge, Tooltips), Mobile-Check | Siegquoten im Zielkorridor, keine Console-Fehler |
| Später | Incremental-Schicht („Festung“, produziert Renown zwischen Runs), Ascension, Finale, Prophet-Draft-Builder, Daily-Seed-Run, Koop, Steam-Achievements | – |

## 12. Offene Entscheidungen

- Welche 3 Starter-Builder (M2; bis dahin sind alle wählbar)
- ~~Roster-Cap / Ersetzen~~ → Cap 10, gebaute Einheiten bleiben
- ~~Wellen pro Knoten~~ → Battle 2, Elite 2 + Affix
- Volle Heilung beim Aktwechsel, oder nur über Rest? (erst mit Akt 2 relevant)
- ~~Income-Quelle ohne Sends~~ → steigendes Basis-Income, Werte per Sim/Spielgefühl justieren
- Boss-Härte: 3 Leaks = König tot, ok so?
- Renown-Raten und Freischaltkosten
- endgültige Talentliste
- Story: Namen des Königs und des Beraters, Akt-Regionen
- Incremental-Schicht: ja oder nein, Entscheidung nach M3
