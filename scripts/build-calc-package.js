/* =====================================================================
   TwinAnalytic — assemble the portable calculation package
   ---------------------------------------------------------------------
       node scripts/build-calc-package.js            build + refresh goldens
       node scripts/build-calc-package.js --check    build + verify, no rewrite

   The engines stay where they are, in js/. This copies them into the
   package so there is exactly one source of truth and no chance of the
   two drifting: edit js/, re-run this, done.

   The golden file is the point of the exercise. It records what every
   engine returns for a fixed input, so moving the code into a package —
   or any later refactor — can be shown not to have changed a number.
   ===================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'packages', 'twinanalytic-calc');
const SRC = path.join(PKG, 'src');
const CHECK = process.argv.includes('--check');

const ENGINE_FILES = [
  /* bnbc-data.js first: it is the code tables (soil parameters, period
     coefficients, exposure constants) that all three engines resolve via
     require('./bnbc-data.js') when the BNBC global is absent. It has no
     dependencies of its own. */
  ['js/bnbc-data.js', 'bnbc-data.js', null],
  ['js/bnbc-calcs.js', 'bnbc-calcs.js', 'BNBCCalc'],
  ['js/bnbc-design.js', 'bnbc-design.js', 'BNBCDesign'],
  ['js/bnbc-design2.js', 'bnbc-design2.js', 'BNBCDesign2'],
  ['js/bnbc-design3.js', 'bnbc-design3.js', 'BNBCDesign3']
];

fs.mkdirSync(SRC, { recursive: true });

/* ---- 1. copy the engines verbatim ---- */
ENGINE_FILES.forEach(([from, to]) => {
  fs.copyFileSync(path.join(ROOT, from), path.join(SRC, to));
});
console.log(`copied ${ENGINE_FILES.length} engine files -> packages/twinanalytic-calc/src/`);

/* ---- 2. entry points ---- */
const NAMES = ENGINE_FILES.filter(([, , g]) => g).map(([, f, g]) => ({ file: f, global: g }));

fs.writeFileSync(path.join(SRC, 'index.cjs'), `/* GENERATED — node scripts/build-calc-package.js */
'use strict';
${NAMES.map(n => `const ${n.global} = require('./${n.file}');`).join('\n')}

/* Flattened: callers should not have to know which file an engine lives in. */
module.exports = Object.assign({}, ${NAMES.map(n => n.global).join(', ')}, {
  ${NAMES.map(n => n.global).join(',\n  ')}
});
`, 'utf8');

fs.writeFileSync(path.join(SRC, 'index.mjs'), `/* GENERATED — node scripts/build-calc-package.js */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const api = require('./index.cjs');

export const {
${Object.keys(require(path.join(SRC, 'index.cjs'))).filter(k => !NAMES.some(n => n.global === k)).sort().map(k => '  ' + k).join(',\n')}
} = api;
export default api;
`, 'utf8');
console.log('wrote index.cjs and index.mjs');

/* ---- 3. golden outputs ---- */
delete require.cache[require.resolve(path.join(SRC, 'index.cjs'))];
const api = require(path.join(SRC, 'index.cjs'));
const fixtures = require(path.join(PKG, 'fixtures.js'));

/* Results carry an engine-annotated copy of the input rows; the shape is
   what matters here, and JSON round-tripping keeps it comparable. */
const golden = {};
const failures = [];
Object.keys(fixtures).sort().forEach(name => {
  if (typeof api[name] !== 'function') { failures.push(`${name}: not exported`); return; }
  try {
    golden[name] = JSON.parse(JSON.stringify(api[name](fixtures[name])));
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
});

const goldenPath = path.join(PKG, 'test', 'golden.json');
fs.mkdirSync(path.dirname(goldenPath), { recursive: true });

if (CHECK && fs.existsSync(goldenPath)) {
  const prev = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const drift = Object.keys(golden).filter(
    k => JSON.stringify(prev[k]) !== JSON.stringify(golden[k]));
  if (drift.length) {
    console.error('\nNUMBERS CHANGED in: ' + drift.join(', '));
    process.exit(1);
  }
  console.log(`golden: ${Object.keys(golden).length} engines unchanged`);
} else {
  fs.writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + '\n', 'utf8');
  console.log(`golden: captured ${Object.keys(golden).length} engines -> test/golden.json`);
}

if (failures.length) {
  console.error('\nengines that did not run:');
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}

/* ---- 4. contract ---- */
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'extract-calc-contract.js')],
  { stdio: 'inherit' });
