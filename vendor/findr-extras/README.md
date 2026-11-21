# FINDR extras in Jobs

These files implement the original FINDR Resistor Lab and FESS revision flows inside Jobs. See [NOTICE.txt](NOTICE.txt) for rights and practice-only notices and [PROVENANCE.json](PROVENANCE.json) for exact source and included hashes.

The wrapper is `src/toolbox-extras.js`; styles enter through `src/toolbox-extras.css`. No iframe, remote question fetch or FINDR database is used. Source links open only when selected. Storage is a dedicated IndexedDB database `jobs-toolbox-extras`, version 1, object store `settings`, using the original `resistor-lab:v1` and `fess-mocks:v1` keys. Existing FINDR progress is not claimed or silently imported.

The resistor finder retains stock quantities, units and its bounded series/parallel search; the sandbox retains editing, regrouping, drag movement and example circuits. FESS retains all 31 subject quizzes, 20 quick mocks, 10 full papers, explanations, understanding confirmations, sound options and saved review history. Full-paper deadlines continue while away or reloading; leaving stops the screen timer and audio without resetting the recorded deadline.

Controller adaptations use an injected local route object, storage callbacks and removable event listeners. Failed saves retain a draft and Retry save. A deliberate confirmed exit may discard the unsaved change while preserving the last committed value. Pending resistor input fields remain available across internal redraws and invalid submissions. Disposing a wrapper stops its paper timer, search yield timers and generated audio and removes visibility/pagehide listeners.

The practice material does not award qualifications or change job results. The original 60-minute practice / 75-minute cited official format distinction remains visible.
