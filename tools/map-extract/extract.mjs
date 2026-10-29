// Extracts known internal files from a WC3 map (.w3x/.w3m) into a folder.
// Usage: node extract.mjs <map.w3x> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive').default;

const [mapPath, outDir] = process.argv.slice(2);
if (!mapPath || !outDir) {
  console.error('Usage: node extract.mjs <map.w3x> <outDir>');
  process.exit(1);
}

const KNOWN = [
  '(listfile)', '(attributes)', '(signature)',
  'war3map.j', 'war3map.lua', 'scripts\\war3map.j', 'Scripts\\war3map.j',
  'war3map.w3i', 'war3map.wts', 'war3map.wtg', 'war3map.wct', 'war3map.imp',
  'war3map.w3u', 'war3map.w3t', 'war3map.w3a', 'war3map.w3b', 'war3map.w3d', 'war3map.w3q', 'war3map.w3h',
  'war3mapSkin.w3u', 'war3mapSkin.w3t', 'war3mapSkin.w3a', 'war3mapSkin.w3b', 'war3mapSkin.w3d', 'war3mapSkin.w3q', 'war3mapSkin.w3h',
  'war3mapMisc.txt', 'war3mapSkin.txt', 'war3mapExtra.txt',
  'war3map.doo', 'war3mapUnits.doo', 'war3map.w3e', 'war3map.w3r', 'war3map.w3c', 'war3map.w3s',
  'war3map.mmp', 'war3map.shd', 'war3map.wpm', 'war3mapMap.blp', 'war3mapPreview.tga',
  'Units\\UnitData.slk', 'Units\\UnitBalance.slk', 'Units\\UnitWeapons.slk', 'Units\\UnitAbilities.slk',
  'Units\\AbilityData.slk', 'Units\\UpgradeData.slk', 'Units\\ItemData.slk',
  'Units\\CampaignUnitStrings.txt', 'Units\\CampaignUnitFunc.txt', 'Units\\CommonAbilityStrings.txt',
];

const buf = fs.readFileSync(mapPath);
const archive = new MpqArchive();
archive.load(new Uint8Array(buf), true);

const names = new Set(KNOWN);
const listfile = archive.get('(listfile)');
if (listfile) {
  for (const line of listfile.text().split(/\r?\n/)) if (line.trim()) names.add(line.trim());
}
archive.applyListfile(names);

fs.mkdirSync(outDir, { recursive: true });
const report = { map: path.basename(mapPath), headerOffset: archive.headerOffset, files: [], failed: [] };
for (const file of archive.files) {
  if (!file || !file.name || /^File\d+/.test(file.name)) continue;
  try {
    const bytes = file.bytes();
    const target = path.join(outDir, ...file.name.split('\\'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    report.files.push({ name: file.name, size: bytes.length });
  } catch (e) {
    report.failed.push({ name: file.name, error: String(e.message || e) });
  }
}
report.unresolved = archive.countUnresolved();
report.total = archive.files.length;
fs.writeFileSync(path.join(outDir, '_extract-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, files: report.files.length }, null, 2));
