// Lists every builder's fighters together with their ability tooltips, as input for porting.
// Usage: node dump-builder-abilities.mjs <jsonDir> <builders.json> <outMd>
import fs from 'node:fs';
import path from 'node:path';

const [jsonDir, buildersPath, outMd] = process.argv.slice(2);
if (!outMd) {
  console.error('Usage: node dump-builder-abilities.mjs <jsonDir> <builders.json> <outMd>');
  process.exit(1);
}

const units = JSON.parse(fs.readFileSync(path.join(jsonDir, 'w3u.json'), 'utf8'));
const abilities = JSON.parse(fs.readFileSync(path.join(jsonDir, 'w3a.json'), 'utf8'));
const builders = JSON.parse(fs.readFileSync(buildersPath, 'utf8'));

const clean = (s) => (typeof s === 'string' ? s.replace(/\|c[0-9a-fA-F]{8}|\|r/g, '').replace(/\|n|\r?\n/g, ' ').replace(/\s+/g, ' ').trim() : s);
const list = (s) => (typeof s === 'string' && s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
const SKIP = /^(Sell|.*SFX.*)$/;

let md = '# Builder abilities (from the 3.47 map)\n\nPer fighter: stats line, then each ability with its base and tooltip.\n';
for (const b of builders) {
  md += `\n## ${b.name} (\`${b.id}\`)\n\nBase fighters: ${b.baseFighters.join(', ')}\n\n`;
  for (const f of Object.values(b.fighters)) {
    md += `- **${f.id} ${f.name}** (${f.tier}) ${f.gold}g, food ${f.food}, ${f.hp} hp, ${f.armor} ${f.shownArmorType ?? f.armorType} armor, ` +
      `${f.shownAttackType ?? f.attackType} ${f.damage.join('-')} every ${f.cooldown}s, range ${f.range}` +
      `${f.upgradesTo.length ? `, upgrades to ${f.upgradesTo.join('/')}` : ''}\n`;
    for (const id of list(units[f.id]?.fields.uabi)) {
      const a = abilities[id];
      const name = clean(a?.fields.anam) ?? id;
      if (SKIP.test(name)) continue;
      const tip = clean(a?.fields['aub1:1']) || clean(a?.fields['atp1:1']) || '';
      md += `  - ${name} [${a?.base ?? '?'}]: ${tip}\n`;
    }
  }
}
fs.writeFileSync(outMd, md);
console.log(`wrote ${outMd}`);
