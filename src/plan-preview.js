import { renderPlan } from "./plan.js";

const RENDERER_VERSION = 1;
const list = (value) => (Array.isArray(value) ? value : []);
const point = (value) =>
  value &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  value.x >= 0 &&
  value.x <= 1 &&
  value.y >= 0 &&
  value.y <= 1;
const png = (value) =>
  typeof value === "string" &&
  /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const raster = (value) =>
  typeof value === "string" &&
  /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const key = (floorId, snapshotId) => `${snapshotId || "working"}::${floorId}`;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const button = (label, callback, className) => {
  const element = node("button", label, className);
  element.type = "button";
  element.onclick = callback;
  return element;
};
function entries(drawing) {
  const records = [
    { record: drawing, snapshotId: null },
    ...list(drawing.issuedSnapshots).map((record) => ({
      record,
      snapshotId: record.id,
    })),
  ];
  return records.flatMap(({ record, snapshotId }) =>
    list(record.floors).map((floor) => ({
      record,
      snapshotId,
      floor,
      assets: list(record.assets).filter(
        (asset) =>
          asset.floorId === floor.id || asset.sourceFloorId === floor.id,
      ),
    })),
  );
}
function validPreview(preview, drawing, entry) {
  return (
    preview &&
    preview.rendererVersion === RENDERER_VERSION &&
    preview.drawingId === drawing.id &&
    preview.floorId === entry.floor.id &&
    (preview.snapshotId || null) === entry.snapshotId &&
    png(preview.image) &&
    Number.isSafeInteger(preview.width) &&
    Number.isSafeInteger(preview.height) &&
    preview.width > 0 &&
    preview.height > 0 &&
    preview.width <= 16384 &&
    preview.height <= 16384
  );
}
/** Read the PNG IHDR without decoding or fetching any external resource. */
export function pngDimensions(image) {
  if (!png(image))
    throw Error("Plan previews must contain an included PNG image.");
  let bytes;
  try {
    bytes = Uint8Array.from(
      atob(image.slice(image.indexOf(",") + 1, image.indexOf(",") + 65)),
      (c) => c.charCodeAt(0),
    );
  } catch {
    throw Error("Plan preview PNG data is malformed.");
  }
  if (
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    ) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  )
    throw Error("Plan preview is not a PNG file.");
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 64000000
  )
    throw Error("Plan preview dimensions exceed the supported limit.");
  return { width, height };
}

/** Normalize genuine engine survey sheets. Their margins mean normalized overlays are disabled. */
export function acceptZoneSketchPreviews(drawing, previews) {
  if (!Array.isArray(previews) || previews.length > 100)
    throw Error("Zone Sketch previews must be a list of working floor PNGs.");
  const seen = new Set(),
    normalized = [];
  for (const preview of previews) {
    if (
      !preview ||
      typeof preview !== "object" ||
      preview.renderer !== "ZoneSketch" ||
      (preview.kind != null && preview.kind !== "working") ||
      preview.snapshotId
    )
      throw Error(
        "Only actual working Zone Sketch floor previews can be attached here.",
      );
    if (
      typeof preview.floorId !== "string" ||
      !list(drawing.floors).some((floor) => floor.id === preview.floorId) ||
      seen.has(preview.floorId)
    )
      throw Error("Zone Sketch preview floor is missing or duplicated.");
    seen.add(preview.floorId);
    const dimensions = pngDimensions(preview.image);
    if (
      preview.width !== dimensions.width ||
      preview.height !== dimensions.height
    )
      throw Error("Zone Sketch preview dimensions do not match its PNG.");
    if (
      preview.mode !== "survey" &&
      preview.mode !== "zone" &&
      preview.mode !== "asfit"
    )
      throw Error("Unsupported Zone Sketch preview mode.");
    normalized.push({
      id: `preview:${drawing.id}:${key(preview.floorId, null)}`,
      rendererVersion: RENDERER_VERSION,
      renderer: "ZoneSketch",
      mode: preview.mode,
      overlayMode: "none",
      drawingId: drawing.id,
      floorId: preview.floorId,
      snapshotId: null,
      revision: String(preview.revision ?? drawing.revision ?? ""),
      image: preview.image,
      ...dimensions,
      generatedAt:
        typeof preview.generatedAt === "string"
          ? preview.generatedAt
          : new Date().toISOString(),
    });
  }
  const result = structuredClone(drawing);
  result.planPreviews = [
    ...list(result.planPreviews).filter(
      (preview) => preview.snapshotId || !seen.has(preview.floorId),
    ),
    ...normalized,
  ];
  result.planPreviewErrors = list(result.planPreviewErrors).filter(
    (error) => error.snapshotId || !seen.has(error.floorId),
  );
  return result;
}

/** Immutable drawing IDs make complete preview caches reusable without cloning large source data. */
export function hasPlanPreviews(drawing) {
  return entries(drawing).every(
    (entry) =>
      !hasContent(entry) ||
      list(drawing.planPreviews).some((preview) =>
        validPreview(preview, drawing, entry),
      ) ||
      (drawing.planPreviewAttemptedFor === drawing.id &&
        list(drawing.planPreviewErrors).some(
          (error) =>
            error.floorId === entry.floor.id &&
            (error.snapshotId || null) === entry.snapshotId,
        )),
  );
}
function hasContent(entry) {
  const data = entry.floor.data || {};
  return Boolean(
    data.image ||
      entry.assets.some(point) ||
      [
        "walls",
        "shapes",
        "doors",
        "windows",
        "shutters",
        "stairs",
        "labels",
        "notes",
        "pins",
        "existingCables",
        "circuits",
        "connections",
      ].some((name) => list(data[name]).length),
  );
}
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      image.naturalWidth && image.naturalHeight
        ? resolve(image)
        : reject(Error("Included image has no usable dimensions."));
    image.onerror = () =>
      reject(Error("An included image could not be decoded."));
    image.src = source;
  });
}
function waitForAspect(svg, aspect) {
  const matches = () => {
    const box = svg.viewBox.baseVal;
    return box.width > 0 && Math.abs(box.height / box.width - aspect) < 0.00001;
  };
  if (matches()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (matches()) {
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(
        Error(
          "The floor background could not be prepared for its PNG preview.",
        ),
      );
    }, 5000);
    observer.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  });
}
async function rasterizeFloor(drawing, entry) {
  let aspect = 0.625;
  if (entry.floor.data?.image) {
    if (!raster(entry.floor.data.image))
      throw Error("The floor background is not an included supported image.");
    const background = await loadImage(entry.floor.data.image);
    aspect = background.naturalHeight / background.naturalWidth;
  }
  // The existing independent SVG renderer already understands the normalized drawing data.
  // This detached view is used only to prepare an actual raster preview, never as an editor.
  const view = renderPlan(drawing, {
    floorId: entry.floor.id,
    snapshotId: entry.snapshotId || "",
  });
  const svg = view.querySelector(".plan-scroll svg");
  if (!svg) throw Error("No drawable floor was found.");
  await waitForAspect(svg, aspect);
  if (document.fonts?.ready) await document.fonts.ready;
  const copy = svg.cloneNode(true),
    box = svg.viewBox.baseVal;
  const scale = Math.min(2, 2400 / Math.max(box.width, box.height));
  const width = Math.max(1, Math.round(box.width * scale)),
    height = Math.max(1, Math.round(box.height * scale));
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.removeAttribute("style");
  // Avoid viewport-dependent fallback fonts in the cached image. All fonts are local.
  copy
    .querySelectorAll("text")
    .forEach((text) => text.setAttribute("font-family", "Arial, sans-serif"));
  copy
    .querySelectorAll("[tabindex]")
    .forEach((element) => element.removeAttribute("tabindex"));
  const source = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );
  const canvas = document.createElement("canvas");
  try {
    const image = await loadImage(url);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("This browser could not prepare a plan preview.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const imageData = canvas.toDataURL("image/png");
    if (!png(imageData))
      throw Error("The browser could not encode the PNG preview.");
    return {
      id: `preview:${drawing.id}:${key(entry.floor.id, entry.snapshotId)}`,
      rendererVersion: RENDERER_VERSION,
      renderer: "JobsPreview",
      overlayMode: "normalized",
      drawingId: drawing.id,
      floorId: entry.floor.id,
      snapshotId: entry.snapshotId,
      revision: String(entry.record.revision || ""),
      image: imageData,
      width,
      height,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Add self-contained PNG cache entries without changing source data or issued snapshots. */
export async function ensurePlanPreviews(drawing, { force = false } = {}) {
  if (!force && hasPlanPreviews(drawing)) return drawing;
  if (typeof document === "undefined")
    throw Error("PNG previews must be prepared in a browser.");
  const result = structuredClone(drawing),
    previews = [],
    errors = [];
  for (const entry of entries(result)) {
    const cached = list(drawing.planPreviews).find((preview) =>
      validPreview(preview, drawing, entry),
    );
    if (cached && (!force || cached.renderer === "ZoneSketch")) {
      previews.push(structuredClone(cached));
      continue;
    }
    if (!hasContent(entry)) continue;
    try {
      previews.push(await rasterizeFloor(result, entry));
    } catch (error) {
      errors.push({
        floorId: entry.floor.id,
        snapshotId: entry.snapshotId,
        message: error.message || "Preview generation failed.",
      });
    }
  }
  result.planPreviews = previews;
  result.planPreviewErrors = errors;
  result.planPreviewAttemptedFor = drawing.id;
  return result;
}

/** PNG viewing with working/issued selection. No plan-editing controls are exposed here. */
export function renderPlanPreview(
  drawing,
  {
    onSelectAsset = () => {},
    onPreviewsReady = async () => {},
    renderAssetCard = () => null,
    onBeforeNavigate = () => true,
    viewState,
    floorId,
    snapshotId = null,
  } = {},
) {
  const root = node("section", undefined, "plan-preview");
  root.setAttribute("aria-label", "Floor plan PNG previews");
  const boundedScroll = (value) =>
    Number.isFinite(value) ? Math.min(1000000, Math.max(0, value)) : 0;
  // View state belongs to this mounted drawing, not the persisted job package.
  const restored =
    viewState &&
    typeof viewState === "object" &&
    !Array.isArray(viewState) &&
    viewState.drawingId === drawing.id
      ? viewState
      : null;
  let current = drawing,
    selectedFloor =
      typeof restored?.floorId === "string"
        ? restored.floorId
        : floorId || drawing.floors?.[0]?.id,
    selectedSnapshot =
      restored &&
      (restored.snapshotId === null ||
        list(drawing.issuedSnapshots).some(
          (record) => record.id === restored.snapshotId,
        ))
        ? restored.snapshotId
        : snapshotId || null,
    zoom = Number.isFinite(restored?.zoom)
      ? Math.min(8, Math.max(1, restored.zoom))
      : 1,
    assetPage = Number.isSafeInteger(restored?.assetPage)
      ? Math.max(0, restored.assetPage)
      : 0,
    scrollLeft = boundedScroll(restored?.scrollLeft),
    scrollTop = boundedScroll(restored?.scrollTop),
    pendingViewport = null,
    preparing = false,
    generationError = "";
  const details = node("div", undefined, "plan-details");
  details.setAttribute("aria-live", "polite");
  const records = () => [
    { record: current, snapshotId: null },
    ...list(current.issuedSnapshots).map((record) => ({
      record,
      snapshotId: record.id,
    })),
  ];
  const selected = () =>
    records().find((item) => item.snapshotId === selectedSnapshot) ||
    records()[0];
  const showPhoto = (image, caption) => {
    if (!raster(image)) return;
    const img = node("img");
    img.src = image;
    img.alt = caption || "Included drawing photograph";
    img.className = "plan-evidence-photo";
    details.append(img);
  };
  const openAsset = (asset, issued) => {
    if (onBeforeNavigate() === false) return;
    details.replaceChildren();
    if (!issued) {
      onSelectAsset(asset.id);
      return;
    }
    details.append(
      node("strong", `${asset.reference || asset.type} · issued record`),
      node(
        "p",
        "Historical drawing evidence. Record today’s work against the working drawing’s device list.",
      ),
    );
    list(asset.photos).forEach((photo) =>
      showPhoto(photo.image, photo.caption),
    );
  };
  async function prepare(force = false) {
    if (preparing || onBeforeNavigate() === false) return;
    preparing = true;
    generationError = "";
    paint();
    try {
      current = await ensurePlanPreviews(current, { force });
      await onPreviewsReady(current);
      if (current.planPreviewErrors?.length)
        generationError =
          "Some PNG previews could not be prepared. The included drawing data and asset records are still available.";
    } catch (error) {
      generationError = error.message || "Could not prepare PNG previews.";
    } finally {
      preparing = false;
      if (root.isConnected) paint();
    }
  }
  function capturePan() {
    const viewport = root.querySelector(".plan-preview-viewport");
    if (viewport?.isConnected && viewport !== pendingViewport) {
      scrollLeft = boundedScroll(viewport.scrollLeft);
      scrollTop = boundedScroll(viewport.scrollTop);
    }
  }
  function paint({ resetPan = false } = {}) {
    if (resetPan) scrollLeft = scrollTop = 0;
    else capturePan();
    pendingViewport = null;
    const { record, snapshotId } = selected();
    if (selectedSnapshot !== snapshotId) scrollLeft = scrollTop = 0;
    selectedSnapshot = snapshotId;
    const floors = list(record.floors);
    if (!floors.some((f) => f.id === selectedFloor)) {
      selectedFloor = floors[0]?.id;
      scrollLeft = scrollTop = 0;
    }
    const floor = floors.find((f) => f.id === selectedFloor),
      issued = snapshotId !== null || current.kind === "issued";
    const entry = floor
      ? {
          record,
          snapshotId,
          floor,
          assets: list(record.assets).filter(
            (asset) =>
              asset.floorId === floor.id || asset.sourceFloorId === floor.id,
          ),
        }
      : null;
    const preview = entry
      ? list(current.planPreviews).find((preview) =>
          validPreview(preview, current, entry),
        )
      : null;
    root.replaceChildren();
    details.replaceChildren();
    const controls = node("div", undefined, "plan-preview-controls");
    const recordLabel = node("label", "Drawing record"),
      recordSelect = node("select");
    recordSelect.setAttribute("aria-label", "Drawing record");
    records().forEach((item) => {
      const option = node(
        "option",
        `${item.snapshotId || current.kind === "issued" ? "Issued record" : "Working drawing"} · ${item.record.revision || "Unspecified revision"}`,
      );
      option.value = item.snapshotId || "";
      recordSelect.append(option);
    });
    recordSelect.value = snapshotId || "";
    recordSelect.onchange = () => {
      if ((recordSelect.value || null) === selectedSnapshot) return;
      if (onBeforeNavigate() === false) {
        recordSelect.value = selectedSnapshot || "";
        return;
      }
      selectedSnapshot = recordSelect.value || null;
      zoom = 1;
      assetPage = 0;
      paint({ resetPan: true });
    };
    recordLabel.append(recordSelect);
    const floorLabel = node("label", "Plan floor"),
      floorSelect = node("select");
    floorSelect.setAttribute("aria-label", "Plan floor");
    floors.forEach((floor) => {
      const option = node("option", floor.name || floor.id);
      option.value = floor.id;
      floorSelect.append(option);
    });
    floorSelect.value = selectedFloor || "";
    floorSelect.onchange = () => {
      if (floorSelect.value === selectedFloor) return;
      if (onBeforeNavigate() === false) {
        floorSelect.value = selectedFloor || "";
        return;
      }
      selectedFloor = floorSelect.value;
      zoom = 1;
      assetPage = 0;
      paint({ resetPan: true });
    };
    floorLabel.append(floorSelect);
    controls.append(recordLabel, floorLabel);
    const zoomControls = node("div", undefined, "plan-preview-zoom");
    zoomControls.append(
      button("−", () => {
        zoom = Math.max(1, zoom / 1.5);
        paint();
      }),
      node("output", `${Math.round(zoom * 100)}%`),
      button("+", () => {
        zoom = Math.min(8, zoom * 1.5);
        paint();
      }),
      button("Fit", () => {
        zoom = 1;
        paint({ resetPan: true });
      }),
    );
    zoomControls.querySelector("button").setAttribute("aria-label", "Zoom out");
    zoomControls
      .querySelectorAll("button")[1]
      .setAttribute("aria-label", "Zoom in");
    controls.append(zoomControls);
    root.append(controls);
    const status = node(
      "p",
      issued
        ? `Issued as-fit record · ${record.revision || "Revision unspecified"}. Historical evidence; not today’s test results.`
        : `Working drawing · ${record.revision || "Revision unspecified"}. PNG preview; open Edit site to change the drawing.`,
      "plan-status",
    );
    status.setAttribute("role", "status");
    root.append(status);
    if (generationError) {
      const message = node("p", generationError, "notice error");
      message.setAttribute("role", "alert");
      root.append(message);
    }
    if (!entry) {
      assetPage = 0;
      root.append(
        node(
          "p",
          "No floor drawing is included. The asset list remains available.",
          "empty",
        ),
      );
      return;
    }
    if (preview) {
      const viewport = node("div", undefined, "plan-preview-viewport");
      const stage = node("div", undefined, "plan-preview-stage");
      // Fit both dimensions while keeping the image and normalized device overlays
      // in the same aspect-ratio box. Zoom is relative to this contained size.
      stage.style.width = `min(${zoom * 100}%, calc((var(--plan-preview-height, 65vh) - 2px) * ${(preview.width / preview.height) * zoom}))`;
      stage.style.aspectRatio = `${preview.width} / ${preview.height}`;
      const image = node("img");
      image.src = preview.image;
      image.alt = `${floor.name} ${issued ? "issued record" : "working drawing"} PNG preview`;
      image.dataset.testid = "plan-png";
      image.width = preview.width;
      image.height = preview.height;
      image.draggable = false;
      image.onerror = () => {
        image.hidden = true;
        stage
          .querySelectorAll(".plan-device-hit")
          .forEach((button) => (button.hidden = true));
        stage.append(
          node(
            "p",
            preview.renderer === "ZoneSketch"
              ? "This stored PNG could not be decoded. Use Edit site to refresh its Zone Sketch preview."
              : "This stored PNG could not be decoded. Rebuild the preview from its included drawing data.",
            "notice error",
          ),
        );
      };
      stage.append(image);
      for (const asset of preview.overlayMode === "none" ||
      preview.renderer === "ZoneSketch"
        ? []
        : entry.assets.filter(point)) {
        const hit = button(
          "",
          () => openAsset(asset, issued),
          "plan-device-hit",
        );
        hit.setAttribute("aria-label", `Open ${asset.reference || asset.type}`);
        hit.title = asset.reference || asset.type;
        hit.style.left = `${asset.x * 100}%`;
        hit.style.top = `${asset.y * 100}%`;
        stage.append(hit);
      }
      viewport.append(stage);
      root.append(viewport);
      // The returned root is mounted by the caller after paint. Restore only
      // this connected viewport after layout, never one replaced by a repaint.
      pendingViewport = viewport;
      requestAnimationFrame(() => {
        if (
          pendingViewport !== viewport ||
          !viewport.isConnected ||
          !root.contains(viewport)
        ) return;
        viewport.scrollLeft = scrollLeft;
        viewport.scrollTop = scrollTop;
        scrollLeft = boundedScroll(viewport.scrollLeft);
        scrollTop = boundedScroll(viewport.scrollTop);
        pendingViewport = null;
      });
      const actions = node("div", undefined, "plan-preview-actions");
      actions.append(
        button("Download PNG", () => {
          const link = document.createElement("a");
          link.href = preview.image;
          link.download = `${String(floor.name || "floor").replace(/[^a-z0-9_-]/gi, "-")}-${issued ? "issued" : "working"}.png`;
          link.click();
        }),
      );
      if (preview.renderer !== "ZoneSketch")
        actions.append(
          button("Rebuild PNG preview", () => prepare(true), "text-button"),
        );
      else actions.append(node("small", "Zone Sketch survey sheet", "muted"));
      root.append(actions);
    } else if (!hasContent(entry)) {
      root.append(
        node(
          "p",
          "No plan is recorded for this floor. Use Edit site to create the drawing in Zone Sketch.",
          "empty",
        ),
      );
    } else {
      const failure = list(current.planPreviewErrors).find(
        (error) =>
          error.floorId === floor.id &&
          (error.snapshotId || null) === snapshotId,
      );
      const message = node("div", undefined, "plan-preview-missing");
      message.append(
        node(
          "p",
          preparing
            ? "Preparing included floor PNG previews…"
            : failure?.message ||
                "A PNG preview has not been prepared for this drawing.",
        ),
      );
      if (!preparing)
        message.append(button("Prepare PNG previews", () => prepare()));
      root.append(message);
      // Explicit fallback still makes included data usable if this browser cannot rasterize SVG.
      const fallback = node("details", undefined, "plan-preview-fallback");
      fallback.append(node("summary", "View included drawing data"));
      let loaded = false;
      fallback.ontoggle = () => {
        if (fallback.open && !loaded) {
          loaded = true;
          fallback.append(
            renderPlan(current, {
              floorId: floor.id,
              snapshotId: snapshotId || "",
              onSelectAsset: (assetId) => {
                if (onBeforeNavigate() !== false) onSelectAsset(assetId);
              },
            }),
          );
        }
      };
      root.append(fallback);
    }
    const legend = node("div", undefined, "plan-preview-legend");
    for (const zone of list(floor.data?.zones)) {
      const text = node(
        "span",
        `Zone ${zone.number || ""}${zone.name ? ` · ${zone.name}` : ""}`,
      );
      if (/^#[\da-f]{3,8}$/i.test(zone.color || ""))
        text.style.borderLeftColor = zone.color;
      legend.append(text);
    }
    for (const circuit of list(floor.data?.circuits))
      legend.append(node("span", circuit.name || "Circuit"));
    if (legend.childNodes.length) root.append(legend);
    root.append(details);
    const heading = node("div", undefined, "section-head");
    heading.append(node("h3", `Assets on this floor · ${entry.assets.length}`));
    root.append(heading);
    const assets = node("div", undefined, "plan-asset-grid");
    const pageSize = window.matchMedia("(max-width: 700px)").matches ? 4 : 8;
    assetPage = Math.min(
      assetPage,
      Math.max(0, Math.ceil(entry.assets.length / pageSize) - 1),
    );
    for (const asset of entry.assets.slice(
      assetPage * pageSize,
      (assetPage + 1) * pageSize,
    )) {
      const custom = !issued ? renderAssetCard(asset, { issued }) : null;
      if (custom instanceof Element) {
        assets.append(custom);
        continue;
      }
      const card = button(
        "",
        () => openAsset(asset, issued),
        "plan-asset-card",
      );
      card.setAttribute("aria-label", asset.reference || asset.type);
      card.append(
        node("strong", asset.reference || asset.type),
        node(
          "small",
          `${asset.typeName || asset.type}${point(asset) ? "" : " · Position not recorded"}`,
        ),
      );
      assets.append(card);
    }
    root.append(assets);
    if (entry.assets.length > pageSize) {
      const pages = node("nav", undefined, "plan-preview-pagination");
      pages.setAttribute("aria-label", "Floor asset pages");
      const previous = button("Previous assets", () => {
        if (onBeforeNavigate() === false) return;
        assetPage -= 1;
        paint();
      });
      previous.disabled = assetPage === 0;
      const next = button("Next assets", () => {
        if (onBeforeNavigate() === false) return;
        assetPage += 1;
        paint();
      });
      next.disabled = (assetPage + 1) * pageSize >= entry.assets.length;
      pages.append(
        previous,
        node(
          "span",
          `${assetPage * pageSize + 1}–${Math.min((assetPage + 1) * pageSize, entry.assets.length)} of ${entry.assets.length}`,
        ),
        next,
      );
      root.append(pages);
    }
    if (!entry.assets.length)
      assets.append(
        node("p", "No equipment is recorded on this floor.", "muted"),
      );
    const pins = list(floor.data?.pins);
    if (pins.length) {
      const notes = node("details", undefined, "plan-preview-notes");
      notes.append(
        node("summary", `Drawing notes and photographs (${pins.length})`),
      );
      const grid = node("div", undefined, "plan-asset-grid");
      for (const pin of pins)
        grid.append(
          button(pin.text || "Drawing photograph", () => {
            details.replaceChildren(node("strong", pin.text || "Drawing note"));
            showPhoto(pin.image, pin.text);
            details.scrollIntoView({ block: "nearest" });
          }),
        );
      notes.append(grid);
      root.append(notes);
    }
  }
  root.getViewState = () => {
    capturePan();
    return {
      drawingId: current.id,
      floorId: selectedFloor || null,
      snapshotId: selectedSnapshot,
      zoom,
      assetPage,
      scrollLeft,
      scrollTop,
    };
  };
  paint();
  return root;
}
