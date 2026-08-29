/* =====================================================================
   TwinAnalytic — extract the calculation engines' input contract
   ---------------------------------------------------------------------
   Reads the engine sources and works out, per engine, which keys it reads
   off its input object and what each one defaults to. Generated rather
   than hand-written so the contract cannot drift from the code — a
   hand-maintained list of 22 engines' inputs would be wrong within a month.

   The engines are written in a consistent style that makes this reliable:
   scalars come through `num(inp.KEY, default)` and rows of a levels/cases
   array through `num(r.KEY, default)`, so both are recoverable by reading
   the source rather than by running it.

       node scripts/extract-calc-contract.js
   ===================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  'js/bnbc-calcs.js', 'js/bnbc-design.js', 'js/bnbc-design2.js', 'js/bnbc-design3.js'
];

/* Pull one function's body out by balancing braces from its opening one. */
function bodyOf(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

function uniq(arr) { return Array.from(new Set(arr)); }

/* `num(inp.Z, 0.20)` -> { key: 'Z', def: '0.20' }

   Several engines annotate each row in place — driftCheck does
   `r.hsx = num(r.h, 0)` and then hangs deltaM, ratio, drift and the rest off
   the same object. Those are results, not inputs, and listing them in the
   contract would tell a caller to supply values the engine is about to
   overwrite. So anything that gets assigned is dropped unless it is also
   read with a default. */
function withDefaults(body, holder) {
  const out = {};
  const assigned = new Set();
  const asg = new RegExp('\\b' + holder + '\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)', 'g');
  let m;
  while ((m = asg.exec(body)) !== null) assigned.add(m[1]);

  const re = new RegExp('num\\(\\s*' + holder + '\\.([A-Za-z_$][\\w$]*)\\s*,\\s*([^),]+)\\)', 'g');
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2].trim();

  /* Read but never defaulted still belongs in the contract — unless it is
     one of those write-backs. */
  const bare = new RegExp('\\b' + holder + '\\.([A-Za-z_$][\\w$]*)', 'g');
  while ((m = bare.exec(body)) !== null) {
    if (!(m[1] in out) && !assigned.has(m[1])) out[m[1]] = null;
  }
  return out;
}

function describe(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const engines = [];
  const re = /\n  function ([A-Za-z_$][\w$]*)\s*\(\s*(inp)?\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (!m[2]) continue;                       // only engines taking an input object
    const body = bodyOf(src, m.index);
    const inputs = withDefaults(body, 'inp');

    /* Row keys of an array input, read as r.KEY inside a forEach/map. */
    let rowKeys = {};
    const arrayProp = Object.keys(inputs).find(k => /levels|cases|storeys|spans|rows|members/i.test(k));
    if (arrayProp) rowKeys = withDefaults(body, 'r');

    /* Which top-level result fields the engine returns. */
    const ret = /return\s*\{([\s\S]{0,600}?)\n    \};/.exec(body);
    const fields = ret
      ? uniq((ret[1].match(/^\s{6}([A-Za-z_$][\w$]*)\s*:/gm) || [])
          .map(s => s.trim().replace(':', '')))
      : [];

    engines.push({ name, file, inputs, arrayProp: arrayProp || null, rowKeys, fields });
  }
  return engines;
}

const all = [];
SOURCES.forEach(f => all.push(...describe(f)));

/* ---- markdown ---- */
const L = [];
L.push('# Calculation engine contract');
L.push('');
L.push('GENERATED FILE — `node scripts/extract-calc-contract.js`. Do not edit by hand.');
L.push('');
L.push('Every engine takes a single plain object and returns a result envelope.');
L.push('No DOM, no globals, no I/O — they are pure functions of their input.');
L.push('');
L.push('A value shown in the Default column is what the engine uses when the key');
L.push('is absent or unparseable, so only the keys you actually care about need');
L.push('supplying. A dash means the key is read without a default.');
L.push('');
L.push(`${all.length} engines.`);
L.push('');

all.forEach(e => {
  L.push(`## \`${e.name}(input)\``);
  L.push('');
  L.push(`Source: \`${e.file}\``);
  L.push('');
  const keys = Object.keys(e.inputs).sort();
  if (keys.length) {
    L.push('| Input key | Default |');
    L.push('| --- | --- |');
    keys.forEach(k => L.push(`| \`${k}\` | ${e.inputs[k] === null ? '—' : '`' + e.inputs[k] + '`'} |`));
    L.push('');
  }
  if (e.arrayProp && Object.keys(e.rowKeys).length) {
    L.push(`\`${e.arrayProp}\` is an array of rows, each taking:`);
    L.push('');
    L.push('| Row key | Default |');
    L.push('| --- | --- |');
    Object.keys(e.rowKeys).sort().forEach(k =>
      L.push(`| \`${k}\` | ${e.rowKeys[k] === null ? '—' : '`' + e.rowKeys[k] + '`'} |`));
    L.push('');
  }
  if (e.fields.length) {
    L.push('Returns: ' + e.fields.map(f => '`' + f + '`').join(', '));
    L.push('');
  }
});

const out = path.join(ROOT, 'packages', 'twinanalytic-calc', 'CONTRACT.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, L.join('\n'), 'utf8');

/* Machine-readable twin, so the fixture harvester can strip keys an engine
   writes back onto its own input rows. */
fs.writeFileSync(path.join(path.dirname(out), 'contract.json'),
  JSON.stringify(all.reduce((o, e) => {
    o[e.name] = { inputs: Object.keys(e.inputs), arrayProp: e.arrayProp, rowKeys: Object.keys(e.rowKeys) };
    return o;
  }, {}), null, 2) + '\n', 'utf8');

console.log(`${all.length} engines documented -> ${path.relative(ROOT, out)}`);
all.forEach(e => console.log(
  `  ${e.name.padEnd(24)} ${String(Object.keys(e.inputs).length).padStart(2)} inputs` +
  (e.arrayProp ? `, rows via ${e.arrayProp}` : '')));
