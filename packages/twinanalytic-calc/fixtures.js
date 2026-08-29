/* =====================================================================
   Representative input per engine.
   ---------------------------------------------------------------------
   GENERATED from the live calculators.

   These are not invented. Each is the exact input object the calculator
   passes to its engine with that page's own default values, read out of the
   running page. So the golden outputs they produce are the numbers the
   website itself produces — 3433.82 kN of base shear for the seismic
   default case, and so on.

   That matters because a hand-written fixture can be quietly wrong in a way
   that still looks plausible. A first attempt at these guessed key names and
   units and locked in a base shear of 307 kN and a column capacity of three
   million kips before the mistake surfaced.

   They pin the engines against drift. They do not re-derive the 124
   numerical checks in CALCULATION-NOTES.md, which pin them against the
   source workbooks.
   ===================================================================== */

'use strict';

module.exports = {
  /* base-shear-check -> Model V/W = 0.03684  vs  code V/W = 0.05850  (-58.78 % difference) */
  baseShearCheck: {"DL": 2872.069, "SDL": 2922.216, "LL": 654.454, "llFactor": 0.25, "EQ": 219.506, "Z": 0.2, "I": 1, "R": 5, "soil": "SD", "damping": 0.05, "Ct": 0.0466, "m": 0.9, "H": 38},
  /* beam-estimate -> Total 35.00 ft of 10×18 in beam:  43.75 cft concrete,  183.3 kg st */
  beamEstimate: {"spans": [{"L": 17.5, "nBot": 4, "dBot": 16, "nTop": 2, "dTop": 16, "nExtra": 2, "dExtra": 16}, {"L": 17.5, "nBot": 4, "dBot": 16, "nTop": 2, "dTop": 16, "nExtra": 2, "dExtra": 16}], "bw": 10, "bh": 18, "cover": 1.5, "hookFactor": 9, "stirrupDia": 10, "sStirrup": 6.5, "legs": 2, "mixC": 1, "mixS": 1.5, "mixK": 3, "lapPct": 3, "dryFactor": 1.5, "cftPerBag": 1.25, "pCement": 500, "pSand": 35, "pAgg": 90, "pSteel": 96000, "pShutter": 15},
  /* beam-shear-rebar -> End zone 12 mm — 2 legs @ 5.00 in c/c over 48.0 in,  middle @ 6.00 */
  beamShearRebar: {"bw": 12, "h": 24, "covEff": 3.3, "fy": 72.5, "frame": "SMF", "AvReq": 0.7, "legs": 2, "dbStirrup": 12, "dbLongMin": 16},
  /* cantilever-slab -> Cantilever 4.00 ft:  M = 2320 lb-ft/ft,  main #3.15 @ 5.50 in c/c  */
  cantileverSlabWSD: {"fc": 2800, "fy": 60000, "concUW": 150, "sdl": 115, "ll": 100, "L": 4, "t": 6, "cover": 0.75, "mainBar": 3.15, "distBar": 3.15},
  /* circular-column-design -> φPn,max = 1021.8 k,  φMn at Pu = 235.0 ft-k,  DCR = 0.851 — DESIGN */
  circularColumn: {"code": "ACI318-19", "fc": 5, "fy": 60, "tieType": "spiral", "barOrientation": "axis", "D": 20, "cover": 1.5, "nBar": 8, "bar": "#7", "spiral": "#4", "pitch": 3, "Pu": 480, "Mu": 200, "Vu": 20},
  /* column-tie-rebar -> Confined zone 10 mm — 4 legs @ 95 mm c/c over Lo = 559 mm,  middle */
  columnTieRebar: {"c1": 22, "c2": 15, "clearSpan": 8.75, "frame": "SMF", "AvReq": 0.5, "legs": 4, "dbTie": 10, "dbLongMin": 16},
  /* combined-footing -> Footing 21.00 × 9.00 × 24 in:  qmax = 3.300 ksf vs 4.00 allowable  */
  combinedFooting: {"fc": 3.5, "fy": 72.5, "Qa": 4, "bearingBasis": "gross", "ws": 0.12, "qs": 0, "c1w": 15, "c1d": 12, "c2w": 15, "c2d": 12, "P1dl": 144, "P1ll": 0, "M1": 1, "P2dl": 190, "P2ll": 0, "M2": 0, "L1": 3, "S": 15, "L2": 3, "B": 9, "Df": 6, "T": 24, "cover": 3, "bar": "#5"},
  /* development-length -> Ld/db = 40.23 for bars ≤ 20 mm and 49.70 for bars > 20 mm,  Ldc/db */
  developmentLength: {"fy": 413.89, "fc": 24, "psiT": "1", "psiE": "1", "lambda": "1"},
  /* drift-check -> Peak drift ratio = 0.01319 vs limit 0.0200  |  Top sway 56.12 mm v */
  driftCheck: {"Cd": 5.5, "I": 1, "driftLimit": 0.02, "swayDenom": 500, "levels": [{"name": "Story1", "h": 3.3528, "disp": 5.566893}, {"name": "Story2", "h": 3.048, "disp": 11.839261}, {"name": "Story3", "h": 3.048, "disp": 18.894589}, {"name": "Story4", "h": 3.048, "disp": 26.203509}, {"name": "Story5", "h": 3.048, "disp": 33.37492}, {"name": "Story6", "h": 3.048, "disp": 40.104016}, {"name": "Story7", "h": 3.048, "disp": 46.179275}, {"name": "Story8.Roof", "h": 3.048, "disp": 51.532528}, {"name": "Story9.TR", "h": 3.048, "disp": 56.115762}]},
  /* foundation-estimate -> Total foundation cost ≈ 19335.61  |  concrete 24.00 cft,  steel 12 */
  foundationEstimate: {"L": 6, "B": 4, "depth": 3, "tRCC": 12, "tCS": 3, "tBS": 3, "sideCut": 12, "sideCover": 3, "nBotL": 10, "dBotL": 16, "nBotB": 15, "dBotB": 12, "hasTop": true, "nTopL": 12, "dTopL": 16, "nTopB": 15, "dTopB": 20, "rccC": 1, "rccS": 1.5, "rccK": 3, "csC": 1, "csS": 3, "csK": 6, "bsC": 1, "bsS": 5, "aggregate": "Brick", "dryFactor": 1.5, "cftPerBag": 1.25, "bricksPerCft": 12, "pCement": 500, "pSandC": 35, "pSandL": 15, "pBrickChip": 90, "pStone": 171, "pSteel": 96000, "pBrick": 10, "pShutter": 15, "pEarth": 5},
  /* load-combinations -> Governing combination 6: (1.2 + Ev)D + ρE + f1·L  =  218.80 */
  loadCombinations: {"D": 100, "L": 50, "Lr": 0, "W": 40, "E": 60, "F": 0, "H": 0, "Ev": 0.138, "rho": 1, "f1": "0.5"},
  /* moment-magnifier -> Slender: kl/r = 47.51 > 28.67,  δ = 1.368  →  Mc = 123.14 ft-k */
  momentMagnifier: {"frame": "braced", "shape": "rect", "b": 14, "h": 14, "D": 20, "fc": 4, "fy": 60, "lu": 16, "k": 1, "Pu": 250, "betaDns": 0.6, "M1": 40, "M2": 90, "curvature": "single"},
  /* overturning-check -> FS = MR / OTM = 160911.8 / 9450.0 = 17.0277  ≥ 1.50 */
  overturningCheck: {"inputMode": "force", "levels": [{"name": "GF", "h": 3.048, "f": 4.332}, {"name": "Story1", "h": 3.048, "f": 10.692}, {"name": "Story2", "h": 3.048, "f": 18.38}, {"name": "Story3", "h": 3.048, "f": 26.993}, {"name": "Story4", "h": 3.048, "f": 36.369}, {"name": "Story5", "h": 3.048, "f": 46.399}, {"name": "Story6", "h": 3.048, "f": 57.011}, {"name": "Story7", "h": 3.048, "f": 68.144}, {"name": "Story8", "h": 3.048, "f": 79.757}, {"name": "Story9.Roof", "h": 3.048, "f": 58.031}, {"name": "Story910.TR", "h": 3.048, "f": 15.497}, {"name": "Story911.MR", "h": 2.438, "f": 3.264}], "weight": 14465.28, "dlFactor": 0.9, "arm": 12.36, "FSreq": 1.5},
  /* p-delta-check -> θmax = 0.10347 vs limit 0.0909 — UNSTABLE — REDESIGN REQUIRED */
  pDeltaCheck: {"I": 1, "Cd": 5.5, "beta": 1, "levels": [{"name": "1st", "h": 120, "P": 5006.292, "V": -212.289, "disp": 0.526508}, {"name": "2nd", "h": 120, "P": 4381.513, "V": -205.859, "disp": 1.053806}, {"name": "3rd", "h": 120, "P": 3762.178, "V": -194.198, "disp": 1.585262}, {"name": "4th", "h": 120, "P": 3142.842, "V": -176.76, "disp": 2.08194}, {"name": "5th", "h": 120, "P": 2523.507, "V": -153.148, "disp": 2.518941}, {"name": "6th", "h": 120, "P": 1904.172, "V": -123.035, "disp": 2.877319}, {"name": "7th", "h": 120, "P": 1284.836, "V": -86.138, "disp": 3.144366}]},
  /* seismic-analysis -> Design base shear V = 3433.82 kN  (Sa = 0.06429, T = 0.541 s) */
  seismicStatic: {"Z": 0.2, "I": 1, "soil": "SD", "R": 7, "damping": 0.05, "periodType": "CMRF", "H": 15.24, "storeys": [{"name": "Ground Floor", "h": 3.048, "w": 10683, "hx": 3.048, "wx": 10683, "whk": 33311.3977721401, "Vstorey": 3433.821428571429, "Fx": 223.28690212173615}, {"name": "Level 1", "h": 3.048, "w": 10683, "hx": 6.096, "wx": 10683, "whk": 67572.58856545869, "Vstorey": 3210.5345264496927, "Fx": 452.9402840533696}, {"name": "Level 2", "h": 3.048, "w": 10683, "hx": 9.144, "wx": 10683, "whk": 102201.66982207942, "Vstorey": 2757.594242396323, "Fx": 685.0596424184376}, {"name": "Level 3", "h": 3.048, "w": 10683, "hx": 12.192, "wx": 10683, "whk": 137071.84419789092, "Vstorey": 2072.534599977885, "Fx": 918.7950523246392}, {"name": "Level 4", "h": 3.048, "w": 10683, "hx": 15.24, "wx": 10683, "whk": 172122.39783045024, "Vstorey": 1153.739547653246, "Fx": 1153.739547653246}]},
  /* shear-wall-design -> φVn = 273.36 k vs Vu = 49.00 k,  φMn = 3534.8 ft-k vs Mu = 344.0 f */
  shearWallDesign: {"fc": 3.5, "fy": 60, "Pu": 1150, "Mu": 344, "Vu": 49, "L": 9, "t": 10, "B": 10, "Dbulb": 50, "hw": 10, "nBulb": 8, "bulbBar": "#6", "nHoriz": 2, "horizBar": "#4", "sHoriz": 15, "nVert": 4, "vertBar": "#6", "sVert": 8, "hoopBar": "#4", "sHoop": 2, "nHoopB": 2, "nHoopL": 2, "coverBulb": 1.5},
  /* shear-wall-rebar -> Vertical 12 mm @ 10.00 in (ρ = 0.00438),  Horizontal 10 mm @ 8.00  */
  shearWallRebar: {"unit": "FPS", "H": 10, "L": 15.833, "t": 8, "dv": 12, "Sv": 10, "rhoV": 0.0025, "AvTot": 3.82, "dh": 10, "Sh": 8, "rhoH": 0.0025, "AhRate": 0.34},
  /* soft-story-check -> No stiffness irregularity — all storeys regular */
  softStorey: {"levels": [{"name": "Story911.MR", "k": 26.1387}, {"name": "Story910.TR", "k": 119.8658}, {"name": "Story9.Roof", "k": 487.4857}, {"name": "Story8", "k": 942.6388}, {"name": "Story7", "k": 1279.8249}, {"name": "Story6", "k": 1542.5657}, {"name": "Story5", "k": 1775.842}, {"name": "Story4", "k": 2026.1596}, {"name": "Story3", "k": 2358.2119}, {"name": "Story2", "k": 2919.6923}, {"name": "Story1", "k": 4206.8859}, {"name": "GF", "k": 8881.9798}]},
  /* stair-design -> Case 1:  Mu = 8057 lb-ft,  waist 9.00 in,  main 12 mm @ 9.75 in c/ */
  stairDesign: {"caseNo": "1", "fc": 2800, "fy": 72500, "concUW": 150, "lambda": 1, "phiV": 0.75, "phiM": 0.9, "sdl": 20, "ll": 100, "tread": 10, "riser": 6, "nTread": 6, "nRiser": 7, "startLanding": 3.5, "endLanding": 3.5, "bw": 10, "bws": 10, "t": 9, "cover": 0.75, "dbMain": 12, "dbShear": 10},
  /* torsional-irregularity -> Peak Δmax/Δavg = 1.2189 — TORSIONAL IRREGULARITY */
  torsionalIrregularity: {"cases": [{"name": "Qx", "dir": "X", "dmax": 3.5, "dmin": 2.243, "dmaxV": 3.5, "dminV": 2.243, "davg": 2.8715, "ratio": 1.218875152359394, "verdict": "Irregular"}, {"name": "Qy", "dir": "Y", "dmax": 0.844, "dmin": 0.587, "dmaxV": 0.844, "dminV": 0.587, "davg": 0.7155, "ratio": 1.1795946890286513, "verdict": "Regular"}, {"name": "Wx", "dir": "X", "dmax": 2.04, "dmin": 1.66, "dmaxV": 2.04, "dminV": 1.66, "davg": 1.85, "ratio": 1.1027027027027028, "verdict": "Regular"}, {"name": "Wy", "dir": "Y", "dmax": 0.62, "dmin": 0.62, "dmaxV": 0.62, "dminV": 0.62, "davg": 0.62, "ratio": 1, "verdict": "Regular"}]},
  /* two-way-slab-coeff -> USD two-way slab, Case 4 - One long edge discontinuous:  t = 6.00  */
  twoWaySlabCoeff: {"method": "USD", "caseNo": 4, "fc": 2800, "fy": 60000, "concUW": 150, "A": 19.25, "B": 20.5, "X": 8.5, "t": 6, "bw": 10, "bh": 18, "cover": 0.75, "barNo": 3.15, "sdl": 25, "ll": 40, "wallLen": 29.83, "wallTh": 0.5, "wallHt": 9.5, "wallUW": 120},
  /* vertical-seismic -> Ev = 0.13800 D  →  combinations become (1.3380)D and (0.7620)D */
  verticalSeismic: {"mode": "BNBC", "Z": 0.36, "soil": "SC", "Fa": 0.9, "Ss": 0.5},
  /* wind-load -> qₕ = 2.2842 kN/m² at h = 33.54 m,  Gf = 0.8594 */
  windLoad: {"V": 65.7, "exposure": "A", "I": 1, "Kzt": 1, "Kd": 0.85, "damping": 0.05, "hr": 33.54, "he": 33.54, "width": 27.13, "length": 23.17, "direction": "Parallel", "roofType": "Gable", "GCpi": 0.18, "periodType": "CMRF", "levels": [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33.54]},
};
