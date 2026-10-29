# Legion TD Mega – Mechanik-Spezifikation

Arbeitsgrundlage für den Nachbau. Abgeleitet aus Legion TD Mega **3.47lHf3** (Object-Data, aktuelle Balance) und **3.44** (lesbare Trigger-Logik).
Rohdaten und Detail-Tabellen liegen lokal (gitignored) unter `reference/`:

- `reference/analysis/builders.md` / `.json` – alle 242 Kämpfer mit Werten und Upgrade-Bäumen
- `reference/analysis/jass-mechanics.md` – Script-Analyse (Wellen, Wirtschaft, Söldner, King)
- Pipeline: `tools/map-extract/` (`extract.mjs` → `parse-objects.mjs` → `summarize-builders.mjs`)

> Namen und Werte sind die des Originals. Im Spiel (`shared/data/`) werden Builder und Einheiten umbenannt, und die Werte werden angepasst.

## 1. Builder

19 spielbare Rassen plus „Prophet“ (zufällige Auswahl). Jede Rasse hat 6 Basis-Kämpfer (T1–T6) mit 1–2 Upgrade-Stufen, teils verzweigt.
Kämpfer werden als Gebäude platziert (Basisobjekt Guard Tower `hgtw`) und kämpfen erst in der Wellenphase.

| Builder | Einheiten inkl. Upgrades | Basis-Kämpfer (Gold) |
|---|---|---|
| Mech | 13 | Peewee (25), Infantry (60), Captain (110), Tempest (140), Cyborg (200), Neotank (360) |
| Beast | 12 | Gnoll Warrior (10), Ogre Basher (30), Harpy (70), Troll Fighter (105), Grizzly (180), Spawn of Dragon (265) |
| Shadow | 14 | Bone Warrior (15), Carrion Spitter (35), Gateguard (90), Overseer (130), Nightmare (215), Lord of Death (300) |
| Nature | 13 | Ent (20), Ranger (40), Sprite (80), Tree of Travel (130), Halfbreed (195), Yggdrasil (290) |
| Element | 12 | Proton (20), Aqua Spirit (50), Watcher (65), Mudman (130), Disciple (200), Seer of Darkness (320) |
| Ghost | 14 | Specter (25), Wanderer (50), Phantom (125), Outcast (200), Apparition (250), Dark Priest (300) |
| Demi-Human | 13 | Goblin Scientist (20), Servant (40), Tribesman (80), Medicine Man (110), Harlot (180), Minotaur (275) |
| Hybrid | 6 | Morph Tier 1–6 (18 / 45 / 85 / 135 / 200 / 305) |
| Marine | 14 | Hatchling (10), Egg Sack (50), Bottom Feeder (85), Mermaid (130), Komodo (180), Sea Giant (280) |
| Arctic | 12 | Tuskarr (20), Frost Wolf (35), Ice Troll (80), Polar Bear (130), Wandigoo (180), Young Frost Dragon (285) |
| Elf | 17 | Colt (10), Novice (40), Sentry (80), Prisoner (125), Druid (200), Moon Guard (280) |
| Goblin | 13 | Small Land Mine (20), Geomancer (40), Machine Turret (90), Flying Machine (130), Goblin Alchemist (170), Steamroller (305) |
| Paladin | 12 | Peasant (15), Archer (55), Footman (80), Priest (130), Knight (200), Dragon Hawk (320) |
| Orc | 13 | Orc Warrior (20), Orc Warlock (60), Raider (90), Young Witch Doctor (100), Wyvern (180), Orc Warchief (300) |
| Undead | 13 | Acolyte (20), Ghoul (60), Meat Wagon (70), Necromancer (130), Zombie (180), Guardian of Death (320) |
| Darkness | 11 | Parasite (20), Corrupted Ent (40), Malformation (95), Void Dragon (150), Time Stealer (220), Ambassador of Darkness (340) |
| Pirate | 13 | Parrot (20), Landlubber (40), Cannon (105), Drunk Pirate (140), Frigate (200), Flamebeard (250) |
| Dwarf | 11 | Rat (30), Dwarf Fighter (60), Dwarf Rifleman (115), Dwarf Apprentice (150), Dwarf Monk (200), Dwarf King (315) |
| Jungle | 12 | Serpent (20), Rough Terrain (45), Monkey (110), Giant Tick (150), Mystic (220), Panther (300) |
| Pharaoh (Sonderfall) | 4 | Scarab (25), Mummy (25), Sand Elemental (195), Sand Worm (195) |

Beispiel Mech: T1 Peewee (25 Gold, 145 HP, 17–19 Normal-Schaden, CD 1.4, Nahkampf, Medium-Rüstung) → Upgrade Veteran (+125 Gold, 730 HP, 83–94).

## 2. Kampftypen

Interne WC3-Typen → im Spiel angezeigte Namen (aus Tooltips belegt):

| Rüstung intern | Anzeige | | Angriff intern | Anzeige |
|---|---|---|---|---|
| none | Unarmored | | normal | Normal |
| small | Light | | pierce | Pierce |
| medium | Medium | | siege | Siege |
| large | Heavy | | magic | Magic |
| normal | Fortified | | chaos | Chaos |

Schadensmatrix Angriff × Rüstung: siehe Abschnitt 5.

## 3. Fähigkeiten

Die Kämpfer nutzen etwa 240 verschiedene Fähigkeiten, die meisten per Trigger umgesetzt. Ansatz für den Nachbau: ein datengetriebenes Effektsystem aus wenigen Bausteinen:

- **Passiv/Stats:** Aura (Team-Buff/Gegner-Debuff), Rüstung/Angriffstempo/Schaden-Bonus, Krit, Ausweichen, Lebensraub, Dornen
- **On-Hit:** Splash/Cleave, Multishot, Kettenangriff, Gift/DoT, Slow, Stun-Chance, Mana-Burn
- **Aktiv (Autocast):** Heilung, Beschwörung, Flächenschaden, Buff auf Verbündete, Verwandlung
- **Trigger:** bei Tod, bei Wellenstart, bei Kill (Stapel-Effekte wie „Killing Spree“)

Fürs MVP werden 3–4 Builder komplett umgesetzt. Die übrigen Rassen kommen in Phase 5.

## 4. Spielablauf

- 2 Teams (West/Ost) mit je 1–4 Spielern. Jeder Spieler hat eine eigene Lane, jedes Team einen King.
- **Build-Phase:** 80 s vor Welle 1, danach `40 + ⌊n/2⌋` s vor Welle n. Bauen, Upgraden und Verkaufen geht nur hier.
- **Kampfphase:** Gebaute Kämpfer werden zu Einheiten (KI-gesteuert, nicht kontrollierbar), die Welle spawnt pro Lane.
  - Ohne Zeitlimit: Sie endet erst, wenn auf **beiden** Seiten alle Creeps und Sends tot sind.
  - Am Ende kommen alle Kämpfer unbeschädigt an ihren Bauplatz zurück. Verluste während der Welle haben keine Folgen.
  - Ist die eigene Lane leer, laufen die Kämpfer zum Lane-Ende und werden zum King gewarpt, um ihn zu verteidigen.
  - Hat eine Lane keine Kämpfer mehr, laufen ihre Creeps direkt zum King.
- **Verkaufen:** 100 %, wenn der Kämpfer in dieser Build-Phase gebaut wurde, sonst 50 % des investierten Golds.
- **Arena** nach Welle 10 und 20: Die Armeen beider Teams kämpfen gegeneinander, das Siegerteam bekommt `Welle·10` Gold pro Spieler. Kein Einfluss auf King-HP. *(Später, nicht im MVP.)*
- **Welle 31 (Finale):** endlose „Legion Lords“, das Intervall schrumpft, bis ein King fällt.
- **Sieg:** Einzige Bedingung ist der Tod des gegnerischen Kings.

## 5. Wellen

31 Wellen. Bosswellen sind 10, 20 und 30 (je 3 Einheiten), Welle 31 ist das endlose Finale.
Creeps bekommen +15 % HP (globales Upgrade). Gespawnt wird 1 Creep pro Lane alle 0,1 s.
Die vollständige Tabelle steht in `reference/analysis/jass-mechanics.md` §2.1: ID, Anzahl pro Lane, HP, Rüstungs- und Angriffstyp, Schaden, Bounty, empfohlener Value, Level-Bonus.
Typen-Rhythmus: Fernkampf in 4/8/12/16/20/24/28/29, Luft in 5/13/21/29.

## 6. Wirtschaft

- **Start:** 300 Gold, 97 Holz, 15 Food. Income startet bei **0**.
- **Gold pro Kill:** die Wellen-Bounty. Ein getöteter Send gibt sein Level als Bounty.
- **Leaks:** Tötet jemand einen geleakten Creep, gibt es nur `Bounty · Faktor`. Der Faktor sinkt mit wenig Value und vielen Leaks.
- **Rundenende:** Anteil an den King-Kills + Level-Bonus (11 … 200, doppelt in 10/20) + volles Income. Kein Zins.
- **Income** steigt nur durch:
  - Sends (+Punktwert, etwa 5 % der Holzkosten)
  - King-Upgrades (+3 pro Kauf)
- **Holz:**
  - Wisps kosten 50 Gold, maximal 7.
  - Jeder Wisp sammelt 2 Holz pro 10 s.
  - Lumberjack-Upgrades geben +1 pro Stufe (8 Stufen, 60–200 Gold+Holz, danach 7 × 200).
- **Food:** Kämpfer kosten 1–5 Food. Farm-Upgrades bringen +8 Food für 24 Gold + 80 Holz, später +20 Food für 60 Gold + 200 Holz. Obergrenze 200.

## 7. Sends (Söldner an den Gegner)

- Gekauft mit Holz, **nur während einer laufenden Welle**, mit begrenztem Lagerbestand.
- Sie warten und werden beim **nächsten** Wellenstart reihum auf die aktiven gegnerischen Lanes verteilt.
- 24 Einheiten in 3 Stufen: Barracks, dann ab Welle 10 und ab Welle 15 erweiterte Barracks.
- Beispiele:
  - Militia: 20 Holz, +1 Income
  - Whelp: 100 Holz, +5
  - Chariot: 200 Holz, +10, doppelter Schaden gegen den King
  - Demon: 1500 Holz, +70
- Vollständige Liste: Analyse §4.2.

## 8. King

- **Basiswerte:** 2600 HP, 3 HP/s Regeneration, 5 Rüstung, 31–41 Schaden, Cooldown 0,9 s, Reichweite 715, unbeweglich.
- **Upgrades** je 80 Holz und +3 Income:
  - HP: +(425 + 25·k), maximal 20 Mal
  - Angriff: +10, maximal 30 Mal
  - Regeneration: +5/s, maximal 20 Mal
- **Automatisch:**
  - Alle 4 Wellen +2 Rüstung und +10 % Angriffstempo.
  - Nach Welle 4, 13, 19 und 23 je eine Fähigkeit bzw. Aura: Stomp/Immolation/Shockwave, Command Aura, Devotion Aura, Endurance Aura.
- **Teamgröße:** Der gegnerische King eines größeren Teams bekommt Bonus-HP und -Schaden.

## 9. Schadensmatrix

| Angriff \ Rüstung | Light | Medium | Heavy | Fortified | Unarmored |
|---|---|---|---|---|---|
| Pierce | 130 % | 90 % | 80 % | 70 % | 100 % |
| Normal | 90 % | 120 % | 90 % | 80 % | 100 % |
| Magic | 110 % | 80 % | 120 % | 70 % | 100 % |
| Siege | 90 % | 90 % | 90 % | 125 % | 100 % |
| Chaos | 100 % | 100 % | 100 % | 100 % | 100 % |

Rüstungsformel: WC3-Standard, Faktor 0,06. Der King (Rüstungstyp „Hero“) nimmt von allem 100 %.

## 10. MVP-Umfang und Abweichungen

- **Umgesetzt:** alle Builder (umbenannt), Wellen 1–30 plus Finale, Wisps/Holz, Sends aller Stufen (auch in der Build-Phase), King-Upgrades und -Fähigkeiten, Leaks, Arena, Food/Farmen, Fähigkeiten (12 Effekt-Bausteine, Werte angenähert).
- **Chimera (Hybrid):** sechs Eier (Tier 1–6, Originalpreise), jedes schlüpft beim Bauen zu einem zufälligen Kämpfer gleicher Stufe eines anderen Builders.
- **Bosse (Welle 10/20/30):** Stuns und Slows halten nur ¼ so lang („reduced greatly on bosses“). Torrent (W20) und Shockwave (W30, 100 Schaden wie im Original) als Nova.
- **Prophet:** baut aus allen Rassen, bekommt aber pro Spieler je Tier T1–T6 einen zufälligen Basis-Kämpfer (wie im Original 3.47). Bis zu 7 Rerolls des ganzen Rosters; der n-te kostet n × 40 Gold und Holz (Original n × 50). In AP wählbar, nicht in AR/SD.
- **Modi:** All Pick, All Random, Single Draft und All Prophet (alle spielen Prophet; Original `-ph`). „Prophet Randomize“ (jede Runde neue Türme) fehlt noch.
- **Später:** Leak-Bounty-Faktor, Teamgrößen-Ausgleich. Der Builder „Pharaoh“ ist im Original unfertig (4 Einheiten ohne Fähigkeiten) und fehlt bewusst.
- **Bewusst ignoriert:** Die 3.44-Map von Epicwar enthält eingeschleusten Cheat-Code (`hke_*`, `SaiYaren`/`Tuan_kaiQi`). Der ist nicht Teil des Spiels.
