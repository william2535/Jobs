# FINDR toolbox components

This is the bounded reuse requested by the shared repository owner: four original Toolbox calculators, six additional on-site calculators and six original picture guides. The source checkout is [FINDR `8bdd8b0`](https://github.com/william2535/Findr/tree/8bdd8b03feb8babd6266b80b57dbc5d53efeadb2). `PROVENANCE.json` records every included file's path, byte count, SHA-256 and source method. The original pack manifest also pins its own earlier release and the exact pack asset hashes; Jobs bundles those assets locally and does not run the FINDR downloader.

`toolbox-calculators.mjs` and `toolbox-pack-calculators.mjs` are byte-for-byte copies. The core module's one import is satisfied by `diagnostic-calculators.mjs`, an exact extraction of original lines 4–5, 17 and 19–50: the existing caution, `blank`, `r`, `unitSets` and `parseDiagnosticQuantity`. Their statements are unchanged. The unrelated diagnostic engine, event recording, application UI, storage and network code are excluded.

The pack contains `pack.json`, six SVGs and its unchanged `toolbox-pack-manifest.mjs`. Source references and warnings remain in their original data. The pictures are original FINDR conceptual guides, not copied manufacturer artwork or customer plans. No manufacturer manual, private site record or customer data is included.

No new licence is applied. Original ownership and source publishers' rights remain intact; the source has no root licence granting a new project-wide open-source licence for these components. The production distribution includes [findr-tools-NOTICE.txt](../../public/findr-tools-NOTICE.txt). Preserve this notice and the provenance when reusing or updating these files.

`tests/toolbox-calculators.test.js` retains the original calculator test cases with import paths adapted to Jobs, adds all-tool input bounds/units checks, and verifies the copied hashes, original pack manifest, six guide references and the bounded parser dependency. Run it with `node --test tests/toolbox-calculators.test.js`.
