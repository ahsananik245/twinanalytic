/* =====================================================================
   Golden-output test.
   ---------------------------------------------------------------------
       npm test

   Runs every engine against the fixture it was captured with and compares
   the whole result envelope against test/golden.json. Any difference — a
   changed number, a renamed field, a dropped warning — fails.

   What this proves and what it does not: it proves the engines still return
   what they returned when the golden file was written. It does not prove
   they are right. Correctness was established separately, against the
   source workbooks, and is documented in CALCULATION-NOTES.md — 124
   numerical checks, with about thirty corrections where the workbooks
   themselves were wrong. This test exists so that work cannot be quietly
   undone by a refactor, a move, or a packaging change.
   ===================================================================== */

'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const api = require('../src/index.cjs');
const fixtures = require('../fixtures.js');
const goldenPath = path.join(__dirname, 'golden.json');

if (!fs.existsSync(goldenPath)) {
  console.error('golden.json is missing. Run: node scripts/build-calc-package.js');
  process.exit(1);
}
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

let pass = 0;
const failures = [];

Object.keys(fixtures).sort().forEach(name => {
  if (typeof api[name] !== 'function') {
    failures.push([name, 'not exported by the package']);
    return;
  }
  if (!(name in golden)) {
    failures.push([name, 'no golden recorded']);
    return;
  }
  let actual;
  try {
    actual = JSON.parse(JSON.stringify(api[name](fixtures[name])));
  } catch (e) {
    failures.push([name, 'threw: ' + e.message]);
    return;
  }
  try {
    assert.deepStrictEqual(actual, golden[name]);
    pass++;
  } catch (e) {
    /* Point at the first field that moved rather than dumping both trees. */
    const diff = Object.keys(golden[name] || {}).find(
      k => JSON.stringify(actual[k]) !== JSON.stringify(golden[name][k]));
    failures.push([name, diff
      ? `field "${diff}" changed\n      was: ${JSON.stringify(golden[name][diff]).slice(0, 160)}` +
        `\n      now: ${JSON.stringify(actual[diff]).slice(0, 160)}`
      : 'output differs from golden']);
  }
});

const total = Object.keys(fixtures).length;
if (failures.length) {
  console.error(`\n${failures.length} of ${total} engines changed:\n`);
  failures.forEach(([n, why]) => console.error(`  ${n}\n      ${why}\n`));
  console.error('If the change is intended, re-record with:');
  console.error('  node scripts/build-calc-package.js\n');
  process.exit(1);
}

console.log(`${pass}/${total} engines match their golden output.`);
