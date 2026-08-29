# Calculation engine contract

GENERATED FILE — `node scripts/extract-calc-contract.js`. Do not edit by hand.

Every engine takes a single plain object and returns a result envelope.
No DOM, no globals, no I/O — they are pure functions of their input.

A value shown in the Default column is what the engine uses when the key
is absent or unparseable, so only the keys you actually care about need
supplying. A dash means the key is read without a default.

23 engines.

## `seismicStatic(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `H` | `30` |
| `I` | `1.0` |
| `R` | `7` |
| `Z` | `0.20` |
| `damping` | `0.05` |
| `n` | `6` |
| `periodType` | — |
| `soil` | — |
| `storeyHeight` | `3` |
| `storeys` | — |
| `wFloor` | `0` |

## `windLoad(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `GCpi` | `0.18` |
| `I` | `1.0` |
| `Kd` | `0.85` |
| `Kzt` | `1.0` |
| `V` | `65.7` |
| `damping` | `0.05` |
| `direction` | — |
| `exposure` | — |
| `he` | `33.53` |
| `hr` | `33.53` |
| `length` | `23.17` |
| `levels` | — |
| `periodType` | — |
| `roofType` | — |
| `width` | `27.13` |

## `verticalSeismic(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `Fa` | `0.9` |
| `Ss` | `0.5` |
| `Z` | `0.36` |
| `mode` | — |
| `soil` | — |

Returns: `status`, `headline`, `raw`

## `pDeltaCheck(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `Cd` | `5.5` |
| `I` | `1.0` |
| `beta` | `1.0` |
| `levels` | — |

`levels` is an array of rows, each taking:

| Row key | Default |
| --- | --- |
| `P` | `0` |
| `V` | `0` |
| `disp` | `0` |
| `h` | `0` |
| `name` | — |

## `baseShearCheck(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `Ct` | `0.0466` |
| `DL` | `0` |
| `EQ` | `0` |
| `H` | `38` |
| `I` | `1.0` |
| `LL` | `0` |
| `R` | `5` |
| `SDL` | `0` |
| `Z` | `0.20` |
| `damping` | `0.05` |
| `llFactor` | `0.25` |
| `m` | `0.9` |
| `soil` | — |

## `driftCheck(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `Cd` | `5.5` |
| `I` | `1.0` |
| `driftLimit` | `0.020` |
| `levels` | — |
| `swayDenom` | `500` |

`levels` is an array of rows, each taking:

| Row key | Default |
| --- | --- |
| `disp` | `0` |
| `h` | `0` |
| `name` | — |

## `softStorey(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `levels` | — |

`levels` is an array of rows, each taking:

| Row key | Default |
| --- | --- |
| `k` | `0` |
| `name` | — |

## `torsionalIrregularity(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `cases` | — |

## `overturningCheck(input)`

Source: `js/bnbc-calcs.js`

| Input key | Default |
| --- | --- |
| `FSreq` | `1.5` |
| `arm` | `0` |
| `dlFactor` | `0.9` |
| `inputMode` | — |
| `levels` | — |
| `weight` | `0` |

`levels` is an array of rows, each taking:

| Row key | Default |
| --- | --- |
| `f` | `0` |
| `h` | `0` |
| `name` | — |

## `stairDesign(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `bw` | `10` |
| `bws` | `10` |
| `caseNo` | — |
| `concUW` | `150` |
| `cover` | `0.75` |
| `dbMain` | `12` |
| `dbShear` | `10` |
| `endLanding` | `3.5` |
| `fc` | `2800` |
| `fy` | `72500` |
| `lambda` | `1.0` |
| `ll` | `100` |
| `nRiser` | `7` |
| `nTread` | `6` |
| `phiM` | `0.90` |
| `phiV` | `0.75` |
| `riser` | `6` |
| `sdl` | `20` |
| `startLanding` | `3.5` |
| `t` | `6.5` |
| `tread` | `10` |

## `cantileverSlabWSD(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `L` | `4` |
| `concUW` | `150` |
| `cover` | `0.75` |
| `distBar` | `3.15` |
| `fc` | `2800` |
| `fy` | `60000` |
| `ll` | `100` |
| `mainBar` | `3.15` |
| `sdl` | `115` |
| `t` | `6` |

## `beamShearRebar(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `AvReq` | `0.7` |
| `bw` | `12` |
| `covEff` | `3.3` |
| `dbLongMin` | `16` |
| `dbStirrup` | `12` |
| `frame` | — |
| `fy` | `72.5` |
| `h` | `24` |
| `legs` | `2` |

## `columnTieRebar(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `AvReq` | `0.5` |
| `c1` | `22` |
| `c2` | `15` |
| `clearSpan` | `8.75` |
| `dbLongMin` | `16` |
| `dbTie` | `10` |
| `frame` | — |
| `legs` | `4` |

## `shearWallRebar(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `AhRate` | `0` |
| `AvTot` | `0` |
| `H` | `10` |
| `L` | `15.833` |
| `Sh` | `8` |
| `Sv` | `10` |
| `dh` | `10` |
| `dv` | `12` |
| `rhoH` | `0.0025` |
| `rhoV` | `0.0025` |
| `t` | `8` |
| `unit` | — |

## `developmentLength(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `bars` | — |
| `fc` | `24` |
| `fy` | `413.89` |
| `lambda` | `1.0` |
| `psiE` | `1.0` |
| `psiT` | `1.0` |

## `foundationEstimate(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `B` | `4` |
| `L` | `6` |
| `aggregate` | — |
| `bricksPerCft` | `12` |
| `bsC` | `1` |
| `bsS` | `5` |
| `cftPerBag` | `1.25` |
| `csC` | `1` |
| `csK` | `6` |
| `csS` | `3` |
| `dBotB` | `12` |
| `dBotL` | `16` |
| `dTopB` | `20` |
| `dTopL` | `16` |
| `depth` | `3` |
| `dryFactor` | `1.5` |
| `hasTop` | — |
| `nBotB` | `15` |
| `nBotL` | `10` |
| `nTopB` | `15` |
| `nTopL` | `12` |
| `pBrick` | `10` |
| `pBrickChip` | `90` |
| `pCement` | `500` |
| `pEarth` | `5` |
| `pSandC` | `35` |
| `pSandL` | `15` |
| `pShutter` | `15` |
| `pSteel` | `96000` |
| `pStone` | `171` |
| `rccC` | `1` |
| `rccK` | `3` |
| `rccS` | `1.5` |
| `sideCover` | `3` |
| `sideCut` | `12` |
| `tBS` | `3` |
| `tCS` | `3` |
| `tRCC` | `12` |

## `twoWaySlabCoeff(input)`

Source: `js/bnbc-design.js`

| Input key | Default |
| --- | --- |
| `A` | `19.25` |
| `B` | `20.5` |
| `X` | `8.5` |
| `barNo` | `3.15` |
| `bh` | `18` |
| `bw` | `10` |
| `caseNo` | `4` |
| `concUW` | `150` |
| `cover` | `0.75` |
| `fc` | `2800` |
| `fy` | `60000` |
| `ll` | `40` |
| `method` | — |
| `sdl` | `25` |
| `t` | `6` |
| `wallHt` | `9.5` |
| `wallLen` | `29.83` |
| `wallTh` | `0.5` |
| `wallUW` | `120` |

## `circularColumn(input)`

Source: `js/bnbc-design2.js`

| Input key | Default |
| --- | --- |
| `D` | `20` |
| `Mu` | `200` |
| `Pu` | `480` |
| `Vu` | `20` |
| `bar` | — |
| `barOrientation` | — |
| `code` | — |
| `cover` | `1.5` |
| `fc` | `5` |
| `fy` | `60` |
| `nBar` | `8` |
| `pitch` | `3` |
| `spiral` | — |
| `tieType` | — |

## `combinedFooting(input)`

Source: `js/bnbc-design2.js`

| Input key | Default |
| --- | --- |
| `B` | `9` |
| `Df` | `6` |
| `L1` | `3` |
| `L2` | `3` |
| `M1` | `1` |
| `M2` | `0` |
| `P1dl` | `144` |
| `P1ll` | `0` |
| `P2dl` | `190` |
| `P2ll` | `0` |
| `Qa` | `4` |
| `S` | `15` |
| `T` | `24` |
| `bar` | — |
| `bearingBasis` | — |
| `c1d` | `12` |
| `c1w` | `15` |
| `c2d` | `12` |
| `c2w` | `15` |
| `cover` | `3` |
| `fc` | `3.5` |
| `fy` | `72.5` |
| `qs` | `0` |
| `ws` | `0.12` |

## `shearWallDesign(input)`

Source: `js/bnbc-design2.js`

| Input key | Default |
| --- | --- |
| `B` | `10` |
| `Dbulb` | `50` |
| `L` | `9` |
| `Mu` | `344` |
| `Pu` | `1150` |
| `Vu` | `49` |
| `bulbBar` | — |
| `coverBulb` | `1.5` |
| `fc` | `3.5` |
| `fy` | `60` |
| `hoopBar` | — |
| `horizBar` | — |
| `hw` | `10` |
| `nBulb` | `8` |
| `nHoopB` | `2` |
| `nHoopL` | `2` |
| `nHoriz` | `2` |
| `nVert` | `4` |
| `sHoop` | `2` |
| `sHoriz` | `15` |
| `sVert` | `8` |
| `t` | `10` |
| `vertBar` | — |

## `beamEstimate(input)`

Source: `js/bnbc-design2.js`

| Input key | Default |
| --- | --- |
| `bh` | `18` |
| `bw` | `10` |
| `cftPerBag` | `1.25` |
| `cover` | `1.5` |
| `dryFactor` | `1.5` |
| `hookFactor` | `9` |
| `lapFactor` | `50` |
| `lapPct` | `3` |
| `legs` | `2` |
| `mixC` | `1` |
| `mixK` | `3` |
| `mixS` | `1.5` |
| `pAgg` | `90` |
| `pCement` | `500` |
| `pSand` | `35` |
| `pShutter` | `15` |
| `pSteel` | `96000` |
| `sStirrup` | `6.5` |
| `spans` | — |
| `stirrupDia` | `10` |

## `momentMagnifier(input)`

Source: `js/bnbc-design3.js`

| Input key | Default |
| --- | --- |
| `D` | `20` |
| `Ec` | `0` |
| `M1` | `60` |
| `M2` | `100` |
| `Pu` | `400` |
| `b` | `18` |
| `betaDns` | `0.6` |
| `curvature` | — |
| `fc` | `4` |
| `frame` | — |
| `fy` | `60` |
| `h` | `18` |
| `k` | `1.0` |
| `lu` | `12` |
| `shape` | — |

## `loadCombinations(input)`

Source: `js/bnbc-design3.js`

| Input key | Default |
| --- | --- |
| `D` | `100` |
| `E` | `60` |
| `Ev` | `0` |
| `F` | `0` |
| `H` | `0` |
| `L` | `50` |
| `Lr` | `0` |
| `W` | `40` |
| `f1` | `0.5` |
| `rho` | `1.0` |
