# Third-party and reference notes

Jobs' importer and read-only renderer are independent implementations of the observed data contract. The full Zone Sketch application and proprietary symbol artwork are not included. At the owner's explicit request, eight original geometry routines are reused from the common engine under the unchanged proprietary licence in `vendor/zonesketch/LICENSE`; they are not relicensed by Jobs. Commit/line provenance and exact-source integrity tests are provided in that directory. The production build includes `zonesketch-LICENSE.txt` and `zonesketch-NOTICE.txt`. Reference commit and exact schema sources are documented in `zone-sketch.md`. FINDR implementation and instructions were read at the commit documented in `panel-pal-context.md`; no FINDR application code is included.

Production application modules have no npm runtime dependencies. Build/test dependencies are Vite (MIT), Playwright (Apache-2.0), and fake-indexeddb (Apache-2.0), plus their locked transitive dependencies. Their original licences and notices remain in installed packages; no licence files were modified. The committed icon is an original simple geometric clipboard/check drawing. No remote fonts or assets are required.

The repository owner's pre-existing files and instructions are retained. The supplied real customer drawing is not included in the generated static build or automated fixtures. Do not add customer saves, manuals or photographs to `public/` or test fixtures.


## FINDR launcher artwork

The owner-requested mobile launcher uses `public/findr-logo.png`, copied unchanged from FINDR `public/app/icons/icon-192.png` at commit `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`. SHA-256: `b42a020989445ecabf16bd74d431c866353c28da60b3cc6351a12214a6f23dbb`. This is the owner's FINDR branding, not a newly open-source-licensed component; no licence is changed or granted by its inclusion. It is cached with the Jobs shell for offline display. The shortcut opens the existing FINDR app at `https://findr-fault-finder.floodyyy21.chatgpt.site/app/` in a separate tab; it does not transfer job data or implement the future Panel Pal adapter. No FINDR application code is bundled.

## Zone Sketch launcher artwork

The mobile Zone Sketch button uses `public/zone-sketch-logo.png`, copied unchanged from `assets/zone-sketch-complete-house-v2.png` at Zone Sketch commit `dca2eff063f52a9980c2aed255879a65cc579379`. This is the original coloured house-and-flame logo already used by that app, included at the owner's explicit request. SHA-256: `330941de836307d0b0f47d3e9ea49b43805677626110f5d774f7912ea4b782d1`. The existing proprietary licence remains intact; the artwork is not relicensed. The source/hash is also retained in `vendor/zonesketch/PROVENANCE.json` and the distributed notice. The logo is cached locally with the app shell.
