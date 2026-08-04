# Precision Analysis Suite — Calculation Notes

The calculators in this suite are ported from a set of 32 BNBC 2020 / ACI 318
spreadsheets. Every formula chain was read out of the workbooks cell by cell and
re-implemented in `js/bnbc-calcs.js`, `js/bnbc-design.js` and `js/bnbc-design2.js`.

Where the workbook and the code agree, the port reproduces the workbook's cached
values exactly — 124 numerical checks are pinned against them. Where the workbook
departs from the code, this file records what was found and what the port does
instead.

---

## Errors found in the source workbooks and corrected here

### A2 — Wind load

**Leeward wall Cp loses its sign for 2 < L/B < 4.**
The workbook evaluates
`IF(L/B>2, (0.3-0.05*(L/B-2)), -(0.5-0.2*(L/B-1)))`.
The first branch returns a **positive** coefficient, which turns the leeward wall
from suction into pressure. Figure 6.2.6 gives −0.3 at L/B = 2 falling to −0.2 at
L/B = 4. The port returns `-(0.3 - 0.05(L/B - 2))`.

**Kh and Kz are read two different ways in the same workbook.**
`Kh` came from a stepped `VLOOKUP` on Table 6.2.11 while the velocity pressure used
the closed-form `Kz = 2.01 (z/zg)^(2/α)`. At the example mean roof height the two
disagreed by 2.6 % (0.99 against 1.0156). The port uses the equation everywhere,
which is what note 2 of the table permits and keeps the profile self-consistent.

**A broken helper cell.** `S59` contains `=IF(O60="","",if)` and evaluates to
`#NAME?`. It feeds nothing, and has no counterpart in the port.

### A3 — Vertical earthquake effect

**Approximate-match VLOOKUP on an unsorted table.** Both the town and the site
class lookups omit the `FALSE` argument, so a value that is not an exact match
silently returns a neighbouring row's data. The port uses exact keyed lookups.

### B1 — P-Delta

**The stability limit is a MAX where the code specifies a MIN.**
The workbook computes `θmax = MAX(0.5/Cd, 0.10)`. BNBC 2020 Eq 6.2.46 gives
`θmax = 0.5/(β·Cd) ≤ 0.25`. For the example (Cd = 5.5) the correct limit is
0.0909; the workbook reports 0.100, which passes storeys the code rejects.
The port applies `min(0.5/(β·Cd), 0.25)` and exposes β as an input.

### B2 — Base shear check

**Full live load in the seismic weight.** The workbook sums DL + SDL + LL and then
applies 0.25 to a separate, empty cell. BNBC 2020 Sec 2.5.7.2 counts 25 % of the
floor live load for most occupancies. The port exposes the participation factor
with a default of 0.25.

### B3 — Storey drift limitation

**The drift allowance is taken from the total building height.**
`IF(T<0.7, 0.005*H_total, 0.004*H_total)` compares a single storey's drift against
a fraction of the whole building height — for the example that inflates the
allowance roughly tenfold. BNBC Table 6.2.21 sets the allowance as a fraction of
the **storey** height `hsx`. The port uses `ratio × hsx`, which is also what the
companion B6 workbook does correctly.

### B6 — Drift ratio

**The Y-direction ratio column errors out.** `Drift Ratio Y` divides
`'Story Drift Y'!G / ('Story Drift Y'!C × 1000)` without the blank guard its
neighbouring formula has, so every cell returns `#VALUE!` when the Y displacement
column is empty. The port guards blanks and handles both directions in one pass.

### B4 — Soft storey

**Inconsistent boundary operators.** One branch tests `> 0.7` while every other
threshold uses `>=`. Several extreme-soft cells also reference the soft-storey
column rather than their own (numerically identical here, but fragile). The port
uses `>=` consistently throughout.

### B5 — Torsional irregularity

**Redundant boundary logic.** `IF(OR(E=1.2, E<1.4), ...)` classifies a ratio of
exactly 1.4 as *extremely* irregular; BNBC Table 6.1.5 makes the extreme category
`> 1.4`. The port treats 1.4 as irregular, not extreme.

### B7 — Overturning moment

**A storey shear profile multiplied by the cumulative elevation.** The column is
labelled "Story Force/Shear (Vx/Vy)" and the data is monotonically decreasing with
height, which is a shear profile. `Σ V·h_cumulative` counts the lower storeys
repeatedly. The port asks which quantity you have and forms `Σ F·h` or `Σ V·hsx`
accordingly — both give the same correct answer.

**Full dead load resisting overturning.** The port defaults the dead load factor to
0.9, matching the governing seismic combination.

### C2 — Two-way slab, USD

**Load factors omitted from the positive moments.** Negative moments use the
factored load `W = 1.2D + 1.6L`, but the midspan moments use *service* dead and
live loads:
`MApos = Ca,LL × LL × A² + Ca,DL × DL × A²`.
This is the working-stress formula from the companion C1 workbook, carried over
without adding the factors. For the example it under-states the midspan moment by
**30 %**, and with it the bottom steel. The port applies 1.2 and 1.6 to the
respective parts under USD and leaves them unfactored under WSD.

### C9 — Cantilever slab

**The modular ratio chain returns zero for high strength concrete.** `n` is
selected by a nested `IF` ladder ending in `0`, so any f'c above about 7300 psi
produces a division by zero downstream. The port uses the ACI alternate-design
rule: nearest whole number, not less than 6.

### C10 / C11 — Isolated footings

**Punching shear uses only one of the three ACI expressions.** `Vc = 4√f'c·bo·d` is
applied unconditionally. ACI requires the minimum of `4√f'c`, `(2 + 4/βc)√f'c` and
`(2 + αs·d/bo)√f'c`; the first is unconservative for elongated columns (βc > 2).

**The one-way shear check is never completed** — `Vu2` and `Vc` are computed but no
comparison cell exists, and the short-direction bar spacing cell is empty.

**A stale stress-block depth.** `As` is computed with a hand-entered `a`, while the
sheet separately computes the true `a` in an unused helper cell and never iterates.
The port solves the flexural quadratic exactly.

**The beam minimum-steel formula applied to a footing.** `max(3√f'c/fy, 200/fy)·b·d`
is the beam rule; a footing takes the shrinkage and temperature minimum.

**A nonsense bar-area helper.** `(π/4)(db/8)²` treats a millimetre diameter as
eighths of an inch. Elsewhere in the same sheet the correct `/25.4` is used.

### D1–D6 — Stairs

**`25.5` instead of `25.4` in the bar spacing conversion**, in both the flight and
the landing formulas, in all six workbooks.

**The whole detailing sheet converts inches to millimetres with `× 25`** rather
than 25.4 — about 1.6 % low on every dimension.

**π written as 3.1416** in five of the six workbooks (D2 uses `PI()`), so the flight
angle carries a small avoidable error.

**A flat 0.85 factor on the minimum waist thickness.** ACI Table 9.5(a) modifies
L/20 by `(0.4 + fy/100000)`, which for fy = 72 500 psi is **1.125**, not 0.85. The
workbook's example waist is thinner than the code allows.

**Case 6 factors the landing dead load by 1.4** while cases 1–5 use 1.2. There is
no combination in which 1.4D pairs with 1.6L.

**The crack-control spacing has no upper bound.** ACI 318-08 10.6.4 caps
`s = 15(40000/fs) − 2.5cc` at `12(40000/fs)`.

### E1 — Beam stirrups

**Millimetre limits divided by 25 instead of 25.4.** The 300 mm, 8db and 24db caps
come out 1.6 % high. The companion column workbook (E2) uses 25.4 in the same
place, confirming the typo.

### E2 — Column ties

**Only the upper half of the `so` bound is applied, and inexactly.** ACI 318
18.7.5.3 gives `so = 100 + (350 − hx)/3` bounded to 100–150 mm. The workbook caps
at 6 in (152.4 mm) and never applies the 100 mm floor.

### E3 — Shear wall rebar

**18 in converted as `18 × 25`** rather than 25.4 in the MKS branch.

### E4 — Development lengths

**The standard hook expression carries ψt where ACI specifies ψe.** ACI 318M
25.4.3.1 uses the coating factor, not the top-bar factor.

**Missing code floors.** The 300 mm minimum on tension development and the 300 mm
minimum on compression lap splices are not applied.

**Swapped labels** on the compression splice branches (the formula selection is
nonetheless correct).

**Tension development floored at 12 in** rather than the code's 300 mm (11.81 in).

### F1 — Foundation estimating

**A hook allowance in inches added to a length in feet.** The top bar length is
`n × (L − 2c/12 + 1.5db/25.4)` — the last term is inches, added to a value in feet,
so each top bar gains about 11 inches of phantom steel. The bottom bar formula in
the same sheet divides by 12 correctly.

**Steel unit weight uses `d²/533`** where the standard `d²/162` kg/m converts to
`d²/531.5` per foot.

### C5 / C7 / C8 — Legacy `.xls` workbooks

These three were encrypted with Excel's default blank password and, once opened,
retained only cached values — no formulas were recoverable. Each has been rebuilt
from the ACI clause the workbook itself cites, and pinned against the values it had
cached:

- **C5 circular column** — `φPn,max` matches to 6 significant figures. The
  interaction diagram is integrated by strain compatibility: the concrete zone is a
  circular segment (area and centroid in closed form) and the displaced concrete is
  deducted from bars inside the stress block.

  Reconciling the diagram against the workbook's cached control points exposed the
  workbook's φ rule. ACI 318-02 carries two φ formulations, and the unified design
  provisions of Sec 9.3.2.2 transition on the **net tensile strain**, from 0.70 for
  a spiral member at εt ≤ 0.002 to 0.90 at εt ≥ 0.005. The workbook uses that one.
  With it applied, the control points line up:

  | Control point | Workbook φPn / φMn | This suite | Difference |
  |---|---|---|---|
  | εt = 0.002    | 366.10 / 226.96 | 359.59 / 223.34 | −1.8 % / −1.6 % |
  | Balanced      | 360.43 / 229.96 | 351.71 / 224.94 | −2.4 % / −2.2 % |
  | εt = 0.005    | 152.49 / 232.38 | 151.49 / 221.29 | −0.7 % / −4.8 % |
  | Pure flexure  |   0.00 / 165.14 |   0.00 / 157.74 | — / −4.5 % |

  The residual few per cent is the bar circle radius. This suite places the cage at
  `D/2 − cover − d(spiral) − db/2`; the workbook's numbers are consistent with
  `D/2 − cover`, which ignores the spiral bar and the bar radius and so pushes the
  steel further from the neutral axis. The convention used here is the more precise
  one and reads slightly lower, on the conservative side. Cage orientation is
  exposed as an input — a bar sitting on the bending axis is the conservative
  arrangement and is the default.

  Separately, the workbook does not check the ACI 25.7.3.3 spiral confinement ratio
  ρs at all. Its own example (#3 spiral at 3 in pitch) fails it: ρs = 0.0086 against
  0.0144 required.
- **C7 combined footing** — geometry and service loads reproduce. The workbook uses
  ACI 318-99 factors (1.4D + 1.7L); the port uses the current 1.2D + 1.6L. Whether
  self weight and overburden are included is exposed as a gross/net switch.
- **C8 shear wall** — `Acv`, `Acv√f'c` and both provided reinforcement ratios match
  exactly. The port reaches the same INADEQUATE verdict through the same provision
  the workbook flags (ACI 318 18.7.5.4, "Eq 21-4"), the bulb confinement hoops.

---

## Modelling choices worth knowing

- **Seismic weight distribution.** The A1 workbook divides the total weight by a
  separately typed storey count, which disagreed with the number of storey rows
  actually filled in (its example distributed 12 000 kip of a 14 400 kip total).
  The port takes each storey's weight directly, so the distribution always sums to W.

- **The minimum base shear floor** in A1 is `0.67 × 0.15 × Z · I · S²`. The soil
  factor appearing squared looks like a transcription slip, so the port reports the
  Eq 6.2.34 value and the floor separately and flags which one governs.

- **Spectrum beyond 4 s.** The workbook returns Cs = 0 for T > 4 s, silently giving
  zero base shear. The port carries the branch through and warns instead.

- **Stair support cases** are solved by a general three-segment beam solver rather
  than six hand-written reaction formulas, so the shear and moment envelope is
  exact for every configuration.
