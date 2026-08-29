# @twinanalytic/calc

The BNBC 2020 / ACI 318 calculation engines behind the TwinAnalytic
calculators, as a portable package.

23 engines. Pure functions — each takes one plain object and returns a
result envelope. No DOM, no globals, no network, no dependencies.

```js
const calc = require('@twinanalytic/calc');

const res = calc.driftCheck({
  Cd: 5.5, I: 1.0, driftLimit: 0.020,
  levels: [
    { name: 'Story1', h: 3.3528, disp: 5.566893 },
    { name: 'Story2', h: 3.048,  disp: 11.839261 }
  ]
});

res.status    // 'PASS' | 'FAIL' | 'INFO'
res.headline  // 'Peak drift ratio = 0.01319 vs limit 0.0200 | ...'
res.results   // [{ label, value, unit, flag }]
res.steps     // [{ n, title, formula, sub, res, status }]  the working
res.warnings  // []
res.table     // { title, headers, rows, foot }
res.raw       // engine internals
```

ESM works too: `import { driftCheck } from '@twinanalytic/calc'`.

## The engines

**Global / analysis** — `seismicStatic`, `windLoad`, `verticalSeismic`,
`baseShearCheck`, `driftCheck`, `pDeltaCheck`, `softStorey`,
`torsionalIrregularity`, `overturningCheck`, `loadCombinations`

**Member design** — `circularColumn`, `combinedFooting`, `shearWallDesign`,
`shearWallRebar`, `beamShearRebar`, `columnTieRebar`, `momentMagnifier`,
`stairDesign`, `cantileverSlabWSD`, `twoWaySlabCoeff`, `developmentLength`

**Estimating** — `beamEstimate`, `foundationEstimate`

Full input contract for every one, generated from the source:
[CONTRACT.md](CONTRACT.md). Machine-readable twin: `contract.json`.

Most keys have defaults, so you only supply what you care about.

## If an agent is calling this

**Call the function. Do not compute.** An LLM re-deriving ACI 318 or BNBC
2020 arithmetic at runtime is non-deterministic and unverifiable, which for
structural work is disqualifying. The agent's job is to gather inputs, call
the engine, and explain the result. Every number should come from this code.

`contract.json` is there so the agent can validate an input object before
calling, and name the missing keys rather than silently accepting a default.

Each result carries `steps` — the worked derivation with the clause each one
cites. That is what an agent should quote when asked *why*, rather than
generating an explanation of its own.

## Verification

Two layers, and they answer different questions.

**Are the numbers right?** Established against the source workbooks before
this package existed: 124 numerical checks, and about thirty places where the
workbooks were wrong and the engines follow the code instead. Documented in
`CALCULATION-NOTES.md` in the main repository.

**Have the numbers changed?** That is what `npm test` is for. Every engine
runs against a recorded golden output and any difference fails — a changed
number, a renamed field, a dropped warning.

```
npm test        # 23/23 engines match their golden output.
```

The fixtures are not invented. Each is the exact input the live calculator
passes to its engine with that page's own defaults, read out of the running
page, so the goldens are the numbers the website itself produces.

## Rebuilding

The engines live in `js/` in the main repository; this package is assembled
from them, so there is one source of truth.

```
node scripts/build-calc-package.js           # copy, re-record goldens, regenerate contract
node scripts/build-calc-package.js --check   # copy and verify, fail on any changed number
```

Use `--check` in CI. It is the guard that stops a refactor altering a result
without anyone noticing.

## Units

Engines are unit-specific and not all in the same system — several member
design engines work in inches, kips and psi while the global checks work in
metres, kN and MPa. `CONTRACT.md` lists every key; the fixtures show a
correct call for each engine and are the fastest way to see which is which.

One note for Node: `bnbc-design.js` consults a `BNBCProject` global for unit
display when one exists. Outside a browser it is absent, and the engine falls
back to its native units — which is what you want here.
