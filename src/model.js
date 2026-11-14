import { jobDefaultsFromSite } from "./site-profile.js";

export const states = [
  "Not tested",
  "Satisfactory",
  "Unsatisfactory",
  "Inaccessible",
  "Not applicable",
];
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const siteLabel = (site) => site?.name?.trim() || "Site";
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
  if (!site?.id || !site.name?.trim())
    throw Error("Create a named site before creating a job.");
  const drawing = site.drawings.at(-1);
  return {
    id: id(),
    siteId: site.id,
    drawingId: drawing.id,
    revision: 1,
    system: "",
    workType: "",
    scope: "",
    instructions: "",
    engineer: "",
    status: "Open",
    createdAt: now(),
    updatedAt: now(),
    ...jobDefaultsFromSite(site),
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
