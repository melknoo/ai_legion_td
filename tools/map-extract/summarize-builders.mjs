// Builds a per-builder fighter roster (with upgrade trees) from parsed object data.
// Usage: node summarize-builders.mjs <jsonDir> <outJson> <outMd> [slkDir]
// slkDir: folder with UnitBalance.slk/UnitWeapons.slk supplying base-object defaults.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SlkFile = require('mdx-m3-viewer/dist/cjs/parsers/slk/file').default;

const [jsonDir, outJson, outMd, slkDir] = process.argv.slice(2);
if (!jsonDir || !outJson || !outMd) {
  console.error('Usage: node summarize-builders.mjs <jsonDir> <outJson> <outMd> [slkDir]');
  process.exit(1);
}

const units = JSON.parse(fs.readFileSync(path.join(jsonDir, 'w3u.json'), 'utf8'));
const abilities = JSON.parse(fs.readFileSync(path.join(jsonDir, 'w3a.json'), 'utf8'));

// SLK column -> w3u field id, for the fields we fall back on.
const SLK_FIELDS = {
  'UnitBalance.slk': { HP: 'uhpm', def: 'udef', defType: 'udty', goldcost: 'ugol', lumbercost: 'ulum', fused: 'ufoo' },
  'UnitWeapons.slk': {
    atkType1: 'ua1t', cool1: 'ua1c', dice1: 'ua1d', sides1: 'ua1s', dmgplus1: 'ua1b', rangeN1: 'ua1r', targs1: 'ua1g', weapTp1: 'ua1w',
  },
};
const baseDefaults = {};
if (slkDir) {
  for (const [file, cols] of Object.entries(SLK_FIELDS)) {
    const slk = new SlkFile();
    slk.load(fs.readFileSync(path.join(slkDir, file), 'utf8'));
    const header = slk.rows[0];
    for (const row of slk.rows.slice(1)) {
      if (!row?.[0]) continue;
      const d = baseDefaults[row[0]] ?? (baseDefaults[row[0]] = {});
      header.forEach((col, i) => {
        const v = row[i];
        if (cols[col] && v !== undefined && v !== '' && v !== '_' && v !== '-') d[cols[col]] = isNaN(v) ? v : Number(v);
      });
    }
  }
}
const withDefaults = (u) => ({ ...(baseDefaults[u.base] ?? {}), ...u.fields });

const clean = (s) => (typeof s === 'string' ? s.replace(/\|c[0-9a-fA-F]{8}|\|r/g, '').replace(/\|n|\r?\n/g, ' ').trim() : s);
const list = (s) => (typeof s === 'string' && s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
const abilityName = (id) => clean(abilities[id]?.fields.anam) || id;

// Tooltips state the displayed types, e.g. "Attack Type: Siege Defense Type: Heavy".
const tooltipType = (tip, label) => tip?.match(new RegExp(`${label} Type:\\s*([A-Za-z]+)`))?.[1];

function fighter(id) {
  if (!units[id]) return { id, missing: true };
  const f = withDefaults(units[id]);
  const base = f.ua1b ?? 0;
  const dice = f.ua1d ?? 1;
  const sides = f.ua1s ?? 1;
  const tooltip = clean(f.utub);
  return {
    shownAttackType: tooltipType(tooltip, 'Attack'),
    shownArmorType: tooltipType(tooltip, 'Defense'),
    id,
    name: clean(f.unam),
    tier: clean(f.unsf),
    gold: f.ugol,
    lumber: f.ulum,
    food: f.ufoo,
    hp: f.uhpm,
    armor: f.udef,
    armorType: f.udty,
    attackType: f.ua1t,
    damage: [base + dice, base + dice * sides],
    cooldown: f.ua1c,
    range: f.ua1r,
    targets: f.ua1g,
    weapon: f.ua1w,
    abilities: list(f.uabi).map(abilityName),
    upgradesTo: list(f.uupt),
    model: f.umdl,
    tooltip,
  };
}

const builders = [];
for (const [id, u] of Object.entries(units)) {
  const builds = list(u.fields.ubui);
  // Skip the random "Prophet" builders (they list every fighter) and the worker.
  if (!builds.length || builds.length > 10 || id === 'h025' || id === 'ewsp') continue;
  const tree = {};
  const walk = (fid) => {
    if (tree[fid]) return;
    tree[fid] = fighter(fid);
    for (const next of tree[fid].upgradesTo ?? []) walk(next);
  };
  builds.forEach(walk);
  builders.push({ id, name: clean(u.fields.unam), baseFighters: builds, fighters: tree });
}

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(builders, null, 1));

const fmt = (v) => (v === undefined || v === null || v === '' ? '–' : v);
let md = '# Builder & Kämpfer (Legion TD Mega 3.47lHf3, Rohdaten)\n\n';
md += 'Quelle: war3map.w3u. Nicht gesetzte Felder (–) erben vom WC3-Basisobjekt.\n\n';
for (const b of builders) {
  md += `## ${b.name} (\`${b.id}\`)\n\n`;
  md += '| ID | Name | Stufe | Gold | HP | Rüstung | Rüst.-Typ | Angr.-Typ | Schaden | CD | Reichw. | Fähigkeiten | Upgrade → |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const f of Object.values(b.fighters)) {
    if (f.missing) { md += `| ${f.id} | (fehlt) |||||||||||\n`; continue; }
    md += `| ${f.id} | ${fmt(f.name)} | ${fmt(f.tier)} | ${fmt(f.gold)} | ${fmt(f.hp)} | ${fmt(f.armor)} | ${fmt(f.shownArmorType ?? f.armorType)} | ${fmt(f.shownAttackType ?? f.attackType)} | ${f.damage.join('–')} | ${fmt(f.cooldown)} | ${fmt(f.range)} | ${f.abilities.join(', ') || '–'} | ${f.upgradesTo.join(', ') || '–'} |\n`;
  }
  md += '\n';
}
// Internal type id -> displayed name, as evidenced by tooltips.
const typeMap = { attack: {}, armor: {} };
for (const f of builders.flatMap((b) => Object.values(b.fighters))) {
  if (f.missing) continue;
  const add = (m, k, v) => { if (k && v) (m[k] ??= {})[v] = (m[k][v] ?? 0) + 1; };
  add(typeMap.attack, f.attackType, f.shownAttackType);
  add(typeMap.armor, f.armorType, f.shownArmorType);
}
md += '## Typ-Zuordnung (intern → Tooltip, Häufigkeit)\n\n```json\n' + JSON.stringify(typeMap, null, 1) + '\n```\n';
fs.writeFileSync(outMd, md);
const total = builders.reduce((n, b) => n + Object.keys(b.fighters).length, 0);
console.log(`builders: ${builders.length}, fighters incl. upgrades: ${total}`);
console.log(JSON.stringify(typeMap));
