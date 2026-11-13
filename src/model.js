export const states = [
  "Not tested",
  "Satisfactory",
  "Unsatisfactory",
  "Inaccessible",
  "Not applicable",
];
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function newSite(name, address = "") {
  const siteId = id(),
    drawingId = id(),
    floorId = id();
  return {
    id: siteId,
    name,
    address,
    sourceKeys: [],
    drawings: [
      {
        id: drawingId,
        revision: "Manual 1",
        kind: "working",
        floors: [
          {
            id: floorId,
            name: "Ground floor",
            data: { symbols: [], building: [], zones: [] },
          },
        ],
        assets: [],
        source: null,
        issuedSnapshots: [],
      },
    ],
  };
}
export function newJob(site, values = {}) {
  const drawing = site.drawings.at(-1);
  return {
    id: id(),
    siteId: site.id,
    drawingId: drawing.id,
    revision: 1,
    system: "Fire alarm",
    workType: "Fire alarm maintenance",
    scope: "",
    instructions: "",
    engineer: "",
    status: "Open",
    createdAt: now(),
    updatedAt: now(),
    ...values,
    results: drawing.assets.map((a) => ({
      id: id(),
      assetId: a.id,
      state: "Not tested",
      observations: "",
      readings: [],
      notes: "",
      defects: "",
      photos: [],
    })),
    aiProposals: [],
  };
}
