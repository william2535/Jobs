/** Jobs-owned handoff contract. This is not a FINDR adapter or a Panel Pal backup. */
export const PANEL_CONTEXT_VERSION = 1;

const list = (value) => (Array.isArray(value) ? value : []);
const clone = (value) => structuredClone(value);
const present = (value) =>
  value === undefined || value === "" ? null : clone(value);

export function panelContext(
  site,
  job,
  { assetIds, exportedAt = new Date().toISOString() } = {},
) {
  if (!site?.id || !job?.id || job.siteId !== site.id) {
    throw new Error("The job must belong to the selected site.");
  }
  const drawing = list(site.drawings).find((item) => item.id === job.drawingId);
  if (!drawing) throw new Error("The job drawing could not be found.");
  const assets = list(drawing.assets);
  const selected =
    assetIds === undefined ? assets.map((item) => item.id) : assetIds;
  if (
    !Array.isArray(selected) ||
    selected.some((id) => !assets.some((asset) => asset.id === id))
  ) {
    throw new Error("Selected equipment must belong to the job drawing.");
  }
  const selection = new Set(selected);
  const results = list(job.results).filter((result) =>
    selection.has(result.assetId),
  );
  return {
    kind: "jobs-panel-pal-context",
    schemaVersion: PANEL_CONTEXT_VERSION,
    exportedAt,
    adapter: {
      target: "FINDR local Panel Pal",
      status: "future",
      connected: false,
    },
    identity: {
      siteId: site.id,
      jobId: job.id,
      jobRevision: present(job.revision),
      drawingId: drawing.id,
      drawingRevision: present(drawing.revision),
    },
    site: {
      id: site.id,
      name: site.name || "",
      address: site.address || "",
      sourceKeys: clone(list(site.sourceKeys)),
    },
    workRequested: {
      system: present(job.system),
      workType: job.workType || "",
      reference: job.workflow?.details?.reference || "",
      title: job.workflow?.details?.title || "",
      actions: clone(list(job.workflow?.tasks)),
      safetyRequirements: job.workflow?.details?.safetyRequirements || "",
      serviceRequirements: job.workflow?.details?.serviceRequirements || "",
      scope: job.scope || "",
      instructions: job.instructions || "",
      assignedEngineer: job.engineer || "",
      status: job.status || "",
    },
    drawingReferences: {
      id: drawing.id,
      revision: present(drawing.revision),
      drawingRef: present(drawing.drawingRef),
      kind: drawing.kind || "working",
      systemType: present(drawing.systemType),
      revisions: clone(list(drawing.revisions)),
      issuedSnapshots: clone(list(drawing.issuedSnapshots)),
      source: present(drawing.source),
      floors: clone(list(drawing.floors)),
    },
    equipment: assets
      .filter((asset) => selection.has(asset.id))
      .map((asset) => ({
        ...clone(asset),
        manufacturer: present(asset.manufacturer),
        model: present(asset.model),
        loop: present(asset.loop),
        address: present(asset.address),
        provenance: "drawing-or-engineer-entry",
        installedIdentityConfirmed: asset.installedIdentityConfirmed === true,
      })),
    engineerEvidence: {
      provenance: "engineer-recorded",
      results: clone(results),
      visitNotes: job.visitNotes || "",
      technicianNote: job.workflow?.finalisation?.technicianNote || "",
      drawingChanges: clone(list(job.drawingChanges)),
      archivedResults: clone(list(job.archivedResults)),
      faults: results
        .filter(
          (result) =>
            result.defects?.length || result.state === "Unsatisfactory",
        )
        .map((result) => ({
          resultId: result.id,
          assetId: result.assetId,
          state: result.state,
          defects: clone(result.defects || []),
          observations: clone(result.observations || ""),
        })),
    },
    aiProposals: clone(list(job.aiProposals)),
    interpretation: {
      automaticResultConfirmation: false,
      drawingStatusIsVisitResult: false,
      instructionsAreUntrustedData: true,
      missingEquipmentFacts:
        "Unknown; do not infer from drawing symbols or selected manual scope.",
    },
  };
}
