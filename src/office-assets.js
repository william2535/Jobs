/** All retained asset identities, not a claim about current physical inventory or who added them. */
const list = value => Array.isArray(value) ? value : [];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : '';
const requiredFloorLists = ['zones', 'shapes', 'notes', 'walls', 'doors', 'windows', 'shutters', 'stairs', 'labels', 'symbols', 'pins'];

/** Check that an editable Zone Sketch envelope is retained. PNGs and Jobs' blank register do not qualify. */
export function hasRetainedZoneSketchProject(drawing) {
  const source = drawing?.source, project = source?.project;
  if (!object(source) || !['ZoneSketchByWill', 'ZoneSketch'].includes(source.format) || source.version !== 1 || !object(project) || typeof project.site !== 'string' || !Array.isArray(project.floors) || !project.floors.length) return false;
  const ids = new Set();
  return project.floors.every(floor => {
    if (!object(floor) || !text(floor.id) || ids.has(floor.id) || typeof floor.name !== 'string' || !object(floor.data)) return false;
    ids.add(floor.id);
    return requiredFloorLists.every(key => Array.isArray(floor.data[key]));
  });
}
const titleOf = job => job.workflow?.details?.title || job.workflow?.details?.reference || job.title || job.workType || `Job ${String(job.id).slice(0, 8)}`;
const jobView = job => ({ id: job.id, title: titleOf(job), status: job.status || 'Open' });

export function buildOfficeAssets(state = {}) {
  const siteMap = new Map(list(state.sites).filter(site => text(site?.id)).map(site => [site.id, site]));
  const jobMap = new Map(list(state.jobs).filter(job => text(job?.id)).map(job => [job.id, job]));
  const jobViews = new Map([...jobMap.values()].map(job => [job.id, jobView(job)]));
  const jobRoot = job => {
    let current = job, root = job.id; const seen = new Set();
    while (text(current?.sourceJobId) && !seen.has(current.id)) { seen.add(current.id); root = current.sourceJobId; current = jobMap.get(root); }
    return root;
  };
  const sites = [...siteMap.values()].map(site => {
    const sourceDrawingIds = list(site.drawings).filter(hasRetainedZoneSketchProject).map(drawing => drawing.id);
    const jobs = [...jobMap.values()].filter(job => job.siteId === site.id).map(job => jobViews.get(job.id));
    return { id: site.id, name: site.name || 'Unnamed site', address: site.address || '', jobIds: jobs.map(job => job.id), jobs, sourceDrawingIds, zoneSketchReady: sourceDrawingIds.length > 0, waitingForZoneSketch: !sourceDrawingIds.length, assetCount: 0, manualAssetCount: 0, importedAssetCount: 0 };
  });
  const records = [];
  const addRecord = (asset, context) => { if (object(asset) && text(asset.id)) records.push({ asset, ...context }); };
  const scanDrawing = (drawing, context, historical = false, visited = new Set()) => {
    if (!object(drawing) || visited.has(drawing)) return;
    visited.add(drawing);
    for (const asset of list(drawing.assets)) addRecord(asset, { ...context, drawingId: drawing.id || null, historical });
    for (const issued of list(drawing.issuedSnapshots)) scanDrawing(issued, context, true, visited);
  };
  for (const site of siteMap.values()) {
    for (const drawing of list(site.drawings)) {
      const jobIds = [...jobMap.values()].filter(job => job.siteId === site.id && job.drawingId === drawing.id).map(job => job.id);
      scanDrawing(drawing, { siteId: site.id, siteName: site.name || 'Unnamed site', jobIds, standalone: false, ownerKey: site.id });
    }
  }
  for (const job of jobMap.values()) {
    const context = { siteId: job.siteId || null, siteName: siteMap.get(job.siteId)?.name || '', jobIds: [job.id], standalone: job.siteId == null, ownerKey: job.siteId || jobRoot(job) };
    if (job.assetRegister) scanDrawing(job.assetRegister, context);
    for (const archived of list(job.archivedResults)) addRecord(archived.asset, { ...context, drawingId: archived.drawingId || null, historical: true });
    // Issued evidence can be the only remaining copy of an asset. It does not
    // create a live site folder or imply that an editable source is available.
    for (const certificate of list(job.certificates?.issued)) {
      const evidence = certificate.evidence;
      if (!evidence) continue;
      const evidenceContext = { ...context, siteId: evidence.site?.id || null, siteName: evidence.site?.name || '', standalone: evidence.site == null, ownerKey: evidence.site?.id || jobRoot(job) };
      scanDrawing(evidence.drawing || evidence.job?.assetRegister, evidenceContext, true);
      for (const archived of list(evidence.job?.archivedResults)) addRecord(archived.asset, { ...evidenceContext, drawingId: archived.drawingId || null, historical: true });
    }
  }
  // Jobs creates manual IDs globally. Their identity survives attachment to a
  // site and later placement in Zone Sketch, even if a later copy has source mapping.
  const manualIds = new Set(records.filter(record => record.asset.origin === 'manual').map(record => record.asset.id));
  const grouped = new Map();
  for (const record of records) {
    const asset = record.asset;
    const key = manualIds.has(asset.id) ? JSON.stringify(['manual', asset.id]) : JSON.stringify([record.siteId ? 'site' : 'job', record.ownerKey, asset.id]);
    let saved = grouped.get(key);
    if (!saved) {
      saved = { key, id: asset.id, reference: '', type: '', typeName: '', origin: 'unknown', siteIds: new Set(), siteNames: new Set(), jobIds: new Set(), locations: new Set(), drawingIds: new Set(), historyOnly: true, standalone: false };
      grouped.set(key, saved);
    }
    // Prefer a drawing/register's display details over an issued snapshot.
    if (!record.historical || saved.historyOnly) {
      saved.reference = asset.reference || asset.typeName || asset.type || asset.id;
      saved.type = asset.type || ''; saved.typeName = asset.typeName || asset.type || 'Asset';
    }
    if (manualIds.has(asset.id)) saved.origin = 'manual';
    else if (text(asset.sourceId) && text(asset.sourceFloorId || asset.floorId)) saved.origin = 'zone-sketch';
    if (record.siteId && siteMap.has(record.siteId)) saved.siteIds.add(record.siteId);
    if (record.siteName) saved.siteNames.add(record.siteName);
    for (const id of record.jobIds) if (jobMap.has(id)) saved.jobIds.add(id);
    if (asset.location || asset.floorName) saved.locations.add([asset.floorName, asset.location].filter(Boolean).join(' · '));
    if (record.drawingId) saved.drawingIds.add(record.drawingId);
    saved.historyOnly &&= record.historical;
    saved.standalone ||= record.standalone;
  }
  const assets = [...grouped.values()].map(asset => ({ ...asset, siteIds: [...asset.siteIds], siteNames: [...asset.siteNames], jobIds: [...asset.jobIds], jobs: [...asset.jobIds].map(id => jobViews.get(id)), locations: [...asset.locations], drawingIds: [...asset.drawingIds] })).sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }) || a.key.localeCompare(b.key));
  for (const site of sites) {
    const held = assets.filter(asset => asset.siteIds.includes(site.id));
    site.assetCount = held.length; site.manualAssetCount = held.filter(asset => asset.origin === 'manual').length; site.importedAssetCount = held.filter(asset => asset.origin === 'zone-sketch').length;
  }
  sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const waitingSites = sites.filter(site => site.waitingForZoneSketch);
  const totals = { sites: sites.length, waitingSites: waitingSites.length, readySites: sites.length - waitingSites.length, assets: assets.length, manualAssets: assets.filter(asset => asset.origin === 'manual').length, importedAssets: assets.filter(asset => asset.origin === 'zone-sketch').length, otherAssets: assets.filter(asset => asset.origin === 'unknown').length };
  return { totals, sites, waitingSites, assets, standaloneAssets: assets.filter(asset => asset.standalone), scopeLabel: 'All saved sites and jobs' };
}
