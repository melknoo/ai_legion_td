// Converts object data (w3u/w3t/w3b/w3h/w3a/w3d/w3q, incl. war3mapSkin.*) to JSON,
// resolving TRIGSTR_ references via war3map.wts.
// Usage: node parse-objects.mjs <rawDir> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W3u = require('mdx-m3-viewer/dist/cjs/parsers/w3x/w3u/file').default;
const W3d = require('mdx-m3-viewer/dist/cjs/parsers/w3x/w3d/file').default;
const Wts = require('mdx-m3-viewer/dist/cjs/parsers/w3x/wts/file').default;

const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error('Usage: node parse-objects.mjs <rawDir> <outDir>');
  process.exit(1);
}

const wtsPath = path.join(rawDir, 'war3map.wts');
const wts = new Wts();
if (fs.existsSync(wtsPath)) wts.load(fs.readFileSync(wtsPath, 'utf8'));

const resolve = (v) => {
  if (typeof v !== 'string') return v;
  return v.replace(/TRIGSTR_(\d+)/g, (m, n) => wts.getString(Number(n)) ?? m);
};

const KINDS = { w3u: W3u, w3t: W3u, w3b: W3u, w3h: W3u, w3a: W3d, w3d: W3d, w3q: W3d };
// Reforged (v3) object files go through WC3MapTranslator; mdx-m3-viewer only reads v1/v2.
const { ObjectsTranslator } = require('wc3maptranslator');
const V3_TYPES = {
  w3u: 'units', w3t: 'items', w3b: 'destructables', w3h: 'buffs', w3a: 'abilities', w3d: 'doodads', w3q: 'upgrades',
};

function readV3(ext, buffer, into) {
  const { json } = ObjectsTranslator.warToJson(V3_TYPES[ext], buffer);
  for (const [key, mods] of Object.entries(json.original)) {
    const entry = into[key] ?? (into[key] = { base: key, custom: false, fields: {} });
    for (const m of mods) entry.fields[m.level ? `${m.id}:${m.level}` : m.id] = resolve(m.value);
  }
  for (const [key, mods] of Object.entries(json.custom)) {
    const [id, base] = key.split(':');
    const entry = into[id] ?? (into[id] = { base, custom: true, fields: {} });
    for (const m of mods) entry.fields[m.level ? `${m.id}:${m.level}` : m.id] = resolve(m.value);
  }
}

function readTable(table, into) {
  for (const obj of table.objects) {
    const id = obj.newId && obj.newId !== '\0\0\0\0' ? obj.newId : obj.oldId;
    const entry = into[id] ?? (into[id] = { base: obj.oldId, custom: !!obj.newId, fields: {} });
    for (const mod of obj.modifications) {
      const key = mod.levelOrVariation ? `${mod.id}:${mod.levelOrVariation}` : mod.id;
      entry.fields[key] = resolve(mod.value);
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
const summary = {};
for (const [ext, Parser] of Object.entries(KINDS)) {
  const out = {};
  for (const prefix of ['war3map', 'war3mapSkin']) {
    const file = path.join(rawDir, `${prefix}.${ext}`);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    if (bytes.readInt32LE(0) === 3) {
      try {
        readV3(ext, bytes, out);
        summary[`${prefix}.${ext}`] = 'v3';
      } catch (e) {
        summary[`${prefix}.${ext}`] = `FAILED v3: ${e.message}`;
      }
      continue;
    }
    const parser = new Parser();
    try {
      parser.load(new Uint8Array(fs.readFileSync(file)));
    } catch (e) {
      summary[`${prefix}.${ext}`] = `FAILED: ${e.message}`;
      continue;
    }
    readTable(parser.originalTable, out);
    readTable(parser.customTable, out);
    summary[`${prefix}.${ext}`] = `v${parser.version}`;
  }
  if (Object.keys(out).length) {
    fs.writeFileSync(path.join(outDir, `${ext}.json`), JSON.stringify(out, null, 1));
    summary[ext] = Object.keys(out).length;
  }
}
console.log(JSON.stringify(summary, null, 2));
