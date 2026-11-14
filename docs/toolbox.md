# Toolbox

Open **Toolbox** from the mobile Dashboard button or the desktop sidebar. It grows from the button into a compact deep-blue chest over the current overview, keeping the dashboard visible. Tools open inside the scrollable tray rather than replacing the page. Use the close button, press Escape or click Toolbox again to fold it away; your overview and scroll position remain in place. The opening animation respects reduced-motion preferences. The smaller FINDR logo remains a separate launcher for the FINDR website.

These tools reuse selected code and original content from FINDR commit `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`, inspected at the owner's request. The FINDR repository and its live app are unchanged. Existing ownership, source references and copy/adaptation details are retained in the [calculator/guide provenance](../vendor/findr-tools/PROVENANCE.json), [Resistor Lab/FESS provenance](../vendor/findr-extras/PROVENANCE.json) and [third-party notes](THIRD_PARTY.md); no new licence is imposed on those components.

## Included tools

| Group | Tools |
| --- | --- |
| Four core calculators | Fire alarm battery capacity; DC voltage drop; 4/5/6-band resistor colour code; conductor resistance and R1 + R2. |
| Six on-site calculators | DC current & power; two resistors in series/parallel; CCTV storage estimate; camera link bandwidth; PoE budget check; DC load total. |
| Six original picture guides | Ohm's law at a glance; series/parallel resistors; PSU reading or device reading; camera/switch/recorder fault path; PoE total versus port limit; relay click versus door operation. |
| Resistor Lab | Stock-based combination finder and editable series/parallel sandbox. |
| FESS practice | 196-question bank, 31 subject quizzes, 20 short mocks and 10 full practice papers. |

The on-site pack's JSON and six SVG guides total **16,473 bytes** in the source. FINDR offers that pack as an optional download; Jobs bundles it with the app. The Toolbox has no download requirement or simulated Download action. All calculations, guide pictures, Resistor Lab and practice content work without a connection once Jobs has prepared its offline application cache. External source and revision-resource links still need a connection.

Calculator pages retain formulas, assumptions and source links. Battery estimates support 24-hour, 72-hour or custom standby periods; cable tools can use entered manufacturer resistance data. Results are calculations from the entered values, not measured device readings or evidence of compliance. Equipment limits and installation requirements must come from the actual documentation. The tools use deterministic local calculations, without a paid API, AI model or remote inference service.

## Resistor Lab

Enter a target resistance, available values and physical quantities to find combinations. Search is bounded to **12 available pieces**, with at most **four pieces per result**. Results describe the nominal resistance, difference from target and actual series/parallel expression; entered quantities limit reuse. This is not a search over arbitrary bridge networks or every possible larger circuit.

Open a result in the sandbox to edit its topology, or build a series/parallel circuit directly. The sandbox supports zero-ohm links and open branches, selectable elements and moving components between groups, with up to 48 nodes and eight nested levels. Equivalent resistance follows the current circuit structure. Values are ideal nominal resistance; the tool does not assess power dissipation, component tolerance or a panel's required end-of-line configuration.

## FESS practice

Subject quizzes and short mocks reuse FINDR's question wording, explanations and source references. Learning feedback and recorded understanding are separate from job evidence. Corrections count towards completion while the first-attempt score remains separate. The ten full papers each contain 60 questions from the same finite 196-question bank, so practice papers repeat material rather than claim to be unseen official examinations. Full papers allow changing or revisiting answers before submission and show correctness afterwards; their saved deadline continues while away and survives reload.

Full papers retain FINDR's **60-minute practice timer**. Its source notes identify **60 questions in 75 minutes** in Highfield FESS EPA Kit v5.0; the shorter timer is deliberately labelled unofficial practice. Confirm the applicable assessment version with the training provider. The timer uses the device clock, not an external proctoring service. These papers are not copied official papers, certification or a prediction of an assessment grade.

## Local data boundary

Calculator inputs use the separate `jobs:toolbox:v1` local-storage key with `{schemaVersion: 1, drafts, packDrafts}`. Resistor Lab and FESS use the `jobs-toolbox-extras` IndexedDB database, version 1, in its `settings` store under `resistor-lab:v1` and `fess-mocks:v1`. This stores the lab's inputs/circuit and practice attempts/progress independently of saved sites, job results and quick-defect records. Toolbox actions never automatically write a passed result, confirmed reading, certificate or defect resolution into a job. These convenience drafts and learning records are not included in a job package and do not synchronize with the separate FINDR website.

Storage failures are shown by the relevant tool, with retry and unsaved-navigation protection where applicable; browser storage remains subject to clearing or eviction. Opening an external reference does not transfer job context. The later Panel Pal job adapter remains future work; the existing context export and separate FINDR launcher do not represent a live AI connection.
