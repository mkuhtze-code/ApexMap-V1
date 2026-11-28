# ApexMap Plan Triage Fixture Library (`R01` – `R10`)

Deterministic vector PDF test plans (`pdf-lib`, A3 landscape `420 × 297 mm`), golden `EnvelopeIntent` JSON expectations, and automated regression checks for `readVectorPdf`, `importEnvelopeIntent`, and the diagnosis layer.

All golden coordinates are in **metres** with origin `[0, 0]` at the lower-left corner of the roof body bounding box, perimeter vertices ordered **CCW** starting from the southernmost edge, and tested within **±0.05 m** tolerance.

| ID | Name | Files | What It Tests |
|---|---|---|---|
| **R01** | Simple Gable | `ApexMap_TestPlan_R01.pdf` / `.intent.json` / `generateR01FixturePdf.ts` | Baseline 12 × 7 m gable roof, 1 dashed ridge, 22.5° fall arrows, `eave`/`gable` mix, 2.7 m fascia, Wind `M`, `FD-01` cover 150 mm, missing-scale & mismatch guards. |
| **R02** | Classic L-Shape | `ApexMap_TestPlan_R02.pdf` / `.intent.json` / `generateR02FixturePdf.ts` | 6-vertex L-shape (`14 × 10 m`), ridge strictly on the main wing `(0,3)→(14,3)`, mixed `eave`/`gable` edges, `1:100`. |
| **R03** | Full Hip Roof | `ApexMap_TestPlan_R03.pdf` / `.intent.json` / `generateR03FixturePdf.ts` | `12 × 8 m` hip roof, 1 central ridge `(3,4)→(9,4)` + 4 diagonal corner hips, all 4 edges `eave`, pitch `25°`, Wind `H`. |
| **R04** | Mono-Pitch / Skillion | `ApexMap_TestPlan_R04.pdf` / `.intent.json` / `generateR04FixturePdf.ts` | `11 × 7 m` skillion `8°`, empty skeleton `[]` (fall arrow never promoted to ridge), differentiated `LOW EAVE` (`2.4 m`) and `HIGH EAVE` (`3.2 m`), Trapezoidal. |
| **R05** | Hip + Valley T-Shape | `ApexMap_TestPlan_R05.pdf` / `.intent.json` / `generateR05FixturePdf.ts` | 8-vertex `16 × 12 m` T-shape, 2 ridges, 6 hips, 2 internal `valley` lines from reflex corners, Wind `VH`, pitch `22.5°`. |
| **R06** | Real Multi-Page Set | `ApexMap_TestPlan_R06.pdf` / `.intent.json` / `generateR06FixturePdf.ts` | 5 sheets (`Site` → `Floor` → `Roof` → `Elevations` → `Details`): defaults to Roof page 3, pulls Wind `VH` from Site page 1, keeps `20°` roof pitch while ignoring HIRB `45°`, pulls `FD-01` from Details page 5. |
| **R07** | Missing / Ambiguous Scale | `ApexMap_TestPlan_R07.pdf` / `.intent.json` / `generateR07FixturePdf.ts` | Three failure modes (`omit_all`, `conflicting` 1:50 vs 1:100 bar, `scale_bar_only`): emit blockers and zero bodies until `manualScaleDenom` is supplied. |
| **R08** | Floor-Plan Proxy Only | `ApexMap_TestPlan_R08.pdf` / `.intent.json` / `generateR08FixturePdf.ts` | Single-page `PROPOSED FLOOR PLAN` (`12.5 × 6.5 m`) with long internal room partition walls: verifies critical safety rule (`skeleton: []`). |
| **R09** | Penetrations & Courtyard | `ApexMap_TestPlan_R09.pdf` / `.intent.json` / `generateR09FixturePdf.ts` | `14 × 10 m` roof body enclosing a `4 × 4 m` courtyard void hole, `SKYLIGHT 1200x800` opening, and `PENETRATION` opening. |
| **R10** | Coastal Standing Seam | `ApexMap_TestPlan_R10.pdf` / `.intent.json` / `generateR10FixturePdf.ts` | `18 × 9 m` Standing Seam @ `1:200 @ A3`, Wind `EH`, `RV10P`, `FD-02` apron `225 mm`, alternative top-left title block, rotated `45° NE` North arrow (`north: null`). |
