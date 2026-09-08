import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['src'];
const banned = [/\bTODO\b/, /\bFIXME\b/, /:\s*any\b/, /<any>/];
let failures = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(ts|mjs)$/.test(entry.name)) {
      const text = await readFile(full, 'utf8');
      for (const pattern of banned) {
        if (pattern.test(text)) failures.push(`${full}: padrão proibido ${pattern}`);
      }
    }
  }
}
for (const root of roots) await walk(root);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Lint estrutural: OK');
