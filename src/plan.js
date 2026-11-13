/** Read-only renderer for imported Zone Sketch data. Independently implemented. */
const NS = "http://www.w3.org/2000/svg";
const safeImage = (value) =>
  typeof value === "string" &&
  /^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(value);
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const point = (value) => value && finite(value.x) && finite(value.y);
const color = (value) =>
  /^#[\da-f]{3,8}$/i.test(value || "") ? value : "#416f91";
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const svgNode = (tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
};

/** All input remains untouched. Taps call onSelectAsset only for current assets. */
export function renderPlan(
  drawing,
  { floorId, snapshotId = "", onSelectAsset = () => {} } = {},
) {
  const root = el("section", undefined, "plan-viewer");
  root.setAttribute("aria-label", "Read-only drawing viewer");
  const controls = el("div", undefined, "plan-controls");
  controls.style.cssText =
    "display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:12px";
  const record = el("select");
  record.setAttribute("aria-label", "Drawing record");
  const floor = el("select");
  floor.setAttribute("aria-label", "Plan floor");
  for (const [text, input] of [
    ["Drawing record", record],
    ["Floor", floor],
  ]) {
    const label = el("label", text);
    label.style.cssText = "display:grid;gap:5px;min-width:150px;flex:1";
    input.style.minHeight = "44px";
    label.append(input);
    controls.append(label);
  }
  const working = el(
    "option",
    `${drawing.kind === "issued" ? "Issued record" : "Working drawing"} · ${drawing.revision || "Unspecified revision"}`,
  );
  working.value = "";
  record.append(working);
  for (const snapshot of list(drawing.issuedSnapshots)) {
    const option = el(
      "option",
      `Issued record · ${snapshot.revision || snapshot.id}${snapshot.at ? ` · ${String(snapshot.at).slice(0, 10)}` : ""}`,
    );
    option.value = snapshot.id;
    record.append(option);
  }
  record.value = snapshotId;
  let zoom = 1;
  const out = el("output", "100%");
  const less = el("button", "−");
  less.type = "button";
  less.setAttribute("aria-label", "Zoom out");
  const more = el("button", "+");
  more.type = "button";
  more.setAttribute("aria-label", "Zoom in");
  const fit = el("button", "Fit");
  fit.type = "button";
  for (const button of [less, more, fit])
    button.style.minWidth = button.style.minHeight = "44px";
  controls.append(less, out, more, fit);
  const status = el("p", undefined, "plan-status");
  status.setAttribute("role", "status");
  const scroll = el("div", undefined, "plan-scroll");
  scroll.style.cssText =
    "overflow:auto;max-height:65vh;min-height:240px;border:1px solid #c9d5df;border-radius:12px;background:#f6f8fa;touch-action:pan-x pan-y";
  const legend = el("div", undefined, "plan-legend");
  legend.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin:12px 0";
  const details = el("div", undefined, "plan-details");
  details.setAttribute("aria-live", "polite");
  const deviceList = el("div", undefined, "plan-devices");
  deviceList.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  root.append(
    controls,
    status,
    scroll,
    legend,
    details,
    el(
      "p",
      "Tap a device on the plan, or choose a device below. Zoom and scroll to inspect details.",
    ),
    deviceList,
  );
  let currentSvg;
  const resize = () => {
    if (currentSvg) currentSvg.style.width = `${zoom * 100}%`;
    out.textContent = `${Math.round(zoom * 100)}%`;
  };
  less.onclick = () => {
    zoom = Math.max(1, zoom / 1.5);
    resize();
  };
  more.onclick = () => {
    zoom = Math.min(8, zoom * 1.5);
    resize();
  };
  fit.onclick = () => {
    zoom = 1;
    resize();
    scroll.scrollTo?.(0, 0);
  };
  function selectedRecord() {
    return (
      list(drawing.issuedSnapshots).find((s) => s.id === record.value) ||
      drawing
    );
  }
  function chooseFloor(preferred) {
    const selection = selectedRecord();
    floor.replaceChildren();
    for (const entry of list(selection.floors)) {
      const option = el("option", entry.name || entry.id);
      option.value = entry.id;
      floor.append(option);
    }
    if (list(selection.floors).some((f) => f.id === preferred))
      floor.value = preferred;
    paint();
  }
  function openAsset(asset, issued) {
    details.replaceChildren();
    if (!issued) {
      onSelectAsset(asset.id);
      return;
    }
    details.append(
      el("strong", `${asset.reference || asset.type} · issued record`),
      el(
        "p",
        "Historical drawing evidence. Record today’s work against the working drawing’s device list.",
      ),
    );
    for (const photo of list(asset.photos))
      if (safeImage(photo.image)) {
        const image = el("img");
        image.src = photo.image;
        image.alt =
          photo.caption || `${asset.reference || asset.type} issued photo`;
        image.style.cssText =
          "max-width:240px;max-height:180px;object-fit:contain";
        details.append(image);
      }
  }
  function paint() {
    const selection = selectedRecord(),
      issued = selection !== drawing || drawing.kind === "issued";
    const entry = list(selection.floors).find((f) => f.id === floor.value);
    status.textContent = issued
      ? `Issued as-fit record · ${selection.revision || "Revision unspecified"}. Historical evidence; not today’s test results.`
      : `Working drawing · ${drawing.revision || "Revision unspecified"}. Drawing status is separate from today’s test results.`;
    scroll.replaceChildren();
    legend.replaceChildren();
    deviceList.replaceChildren();
    details.replaceChildren();
    if (!entry) {
      scroll.append(
        el(
          "p",
          "No floor drawing is included. Devices can still be reviewed in the Devices tab.",
        ),
      );
      return;
    }
    const data = entry.data || {};
    const assets = list(selection.assets).filter(
      (asset) => asset.floorId === entry.id || asset.sourceFloorId === entry.id,
    );
    let width = 1000,
      height = 625;
    const svg = svgNode("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "group",
      "aria-label": `${entry.name} ${issued ? "issued record" : "working drawing"}`,
    });
    svg.style.cssText =
      "display:block;min-width:320px;height:auto;background:white;overflow:visible";
    currentSvg = svg;
    scroll.append(svg);
    resize();
    const build = () => {
      svg.replaceChildren();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const xy = (p) => ({ x: p.x * width, y: p.y * height });
      const path = (points, attrs = {}, close = false) => {
        const valid = list(points).filter(point);
        if (valid.length < 2) return;
        const pts = valid
          .map((p) => {
            const q = xy(p);
            return `${q.x},${q.y}`;
          })
          .join(" ");
        svg.append(
          svgNode(close ? "polygon" : "polyline", {
            points: pts,
            fill: "none",
            stroke: "#334155",
            "stroke-width": 3,
            "vector-effect": "non-scaling-stroke",
            ...attrs,
          }),
        );
      };
      const label = (p, text, attrs = {}) => {
        if (!point(p)) return;
        const q = xy(p);
        svg.append(
          svgNode(
            "text",
            {
              x: q.x,
              y: q.y,
              "font-family": "system-ui,sans-serif",
              "font-size": 14,
              "text-anchor": "middle",
              fill: "#334155",
              ...attrs,
            },
            String(text || ""),
          ),
        );
      };
      if (safeImage(data.image) && data.pictureVisible !== false)
        svg.append(
          svgNode("image", {
            href: data.image,
            x: 0,
            y: 0,
            width,
            height,
            preserveAspectRatio: "none",
            opacity: Math.max(
              0.05,
              Math.min(1, Number(data.pictureOpacity) || 1),
            ),
          }),
        );
      for (const area of list(data.shapes)) {
        const zone = list(data.zones).find((z) => z.id === area.zone);
        const ink = color(zone?.color);
        path(
          area.points,
          { fill: ink, "fill-opacity": 0.13, stroke: ink, "stroke-width": 1 },
          true,
        );
      }
      for (const wall of list(data.walls))
        path(wall.points, { "stroke-width": Number(data.wallWidth) || 3 });
      for (const cable of list(data.existingCables))
        path(cable.points, {
          stroke: "#66798a",
          "stroke-width": 2,
          "stroke-dasharray": "6 5",
        });
      for (const [kind, ink] of [
        ["windows", "#3183a5"],
        ["shutters", "#687b8e"],
        ["doors", "#334155"],
      ])
        for (const obj of list(data[kind])) {
          if (!point(obj.a) || !point(obj.b)) continue;
          path([obj.a, obj.b], {
            stroke: ink,
            "stroke-width": kind === "windows" ? 5 : 2,
          });
          if (kind === "doors") {
            const a = xy(obj.a),
              b = xy(obj.b),
              dx = b.x - a.x,
              dy = b.y - a.y,
              side = obj.side === -1 ? -1 : 1;
            const end = { x: a.x - dy * side, y: a.y + dx * side };
            svg.append(
              svgNode("path", {
                d: `M${a.x},${a.y} L${end.x},${end.y} M${b.x},${b.y} A${Math.hypot(dx, dy)},${Math.hypot(dx, dy)} 0 0 ${side > 0 ? 1 : 0} ${end.x},${end.y}`,
                fill: "none",
                stroke: ink,
                "stroke-width": 1.5,
                "vector-effect": "non-scaling-stroke",
              }),
            );
          }
        }
      for (const stair of list(data.stairs)) {
        if (!point(stair.a) || !point(stair.b)) continue;
        const a = stair.a,
          b = stair.b;
        path([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]);
        for (let i = 1; i < 8; i++)
          path(
            [
              { x: a.x, y: a.y + ((b.y - a.y) * i) / 8 },
              { x: b.x, y: a.y + ((b.y - a.y) * i) / 8 },
            ],
            { "stroke-width": 1 },
          );
      }
      for (const circuit of list(data.circuits)) {
        if (!circuit.bounds) continue;
        const b = circuit.bounds;
        const restore = (p) => ({
          x: b.x1 + ((p.x - 0.045) / 0.91) * (b.x2 - b.x1),
          y: b.y1 + ((p.y - 0.045) / 0.91) * (b.y2 - b.y1),
        });
        for (const leg of list(circuit.legs))
          path(list(leg.points).filter(point).map(restore), {
            stroke: color(circuit.color),
            "stroke-width": 2.5,
            "stroke-dasharray": circuit.complete ? "none" : "7 5",
          });
      }
      for (const connection of list(data.connections)) {
        const a =
          list(data.symbols).find((s) => s.id === connection.sourceId) ||
          list(data.doors).find((d) => d.id === connection.sourceId);
        const b =
          list(data.symbols).find((s) => s.id === connection.targetId) ||
          list(data.doors).find((d) => d.id === connection.targetId);
        const centre = (o) =>
          point(o)
            ? o
            : point(o?.a) && point(o?.b)
              ? { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }
              : null;
        const start = centre(a),
          end = centre(b);
        if (!start || !end) continue;
        const route = list(connection.route);
        path(
          [
            start,
            ...(route.length
              ? route
              : [
                  connection.metadata?.elbow === "vertical"
                    ? { x: start.x, y: end.y }
                    : { x: end.x, y: start.y },
                ]),
            end,
          ],
          { stroke: "#416f91", "stroke-width": 2 },
        );
      }
      for (const room of list(data.labels))
        label(room, room.text, {
          "font-size": Math.max(10, 16 * (Number(room.scale) || 1)),
        });
      for (const note of list(data.notes))
        label(note, note.text, { fill: "#8b5c12", "font-size": 13 });
      for (const pin of list(data.pins)) {
        if (!point(pin)) continue;
        const q = xy(pin);
        const marker = svgNode("g", {
          role: "button",
          tabindex: 0,
          "aria-label": pin.text || "Drawing note",
        });
        marker.append(
          svgNode("circle", {
            cx: q.x,
            cy: q.y,
            r: 20,
            fill: "transparent",
            "pointer-events": "all",
          }),
          svgNode("circle", { cx: q.x, cy: q.y, r: 7, fill: "#8467a4" }),
        );
        const showPin = () => {
          details.replaceChildren(el("strong", pin.text || "Drawing note"));
          if (safeImage(pin.image)) {
            const img = el("img");
            img.src = pin.image;
            img.alt = pin.text || "Drawing photograph";
            img.style.cssText =
              "display:block;max-width:100%;max-height:360px;object-fit:contain";
            details.append(img);
          }
        };
        marker.onclick = showPin;
        marker.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            showPin();
          }
        };
        svg.append(marker);
        label(
          { x: pin.x, y: pin.y + 0.025 },
          pin.text || (pin.kind === "photo" ? "Photo note" : "Note"),
          { "font-size": 11 },
        );
      }
      for (const marker of list(data.symbols).filter((s) => s.type === "you"))
        label(marker, "You are here", { fill: "#567747", "font-size": 14 });
      for (const asset of assets) {
        if (!point(asset)) continue;
        const p = xy(asset);
        const g = svgNode("g", {
          role: "button",
          tabindex: 0,
          "aria-label": `Open ${asset.reference || asset.type}`,
        });
        g.style.cursor = "pointer";
        const title = svgNode(
          "title",
          {},
          `${asset.reference || "No reference"} · ${asset.type}`,
        );
        g.append(title);
        // Transparent target enlarges device selection without changing its recorded location.
        g.append(
          svgNode("circle", {
            cx: p.x,
            cy: p.y,
            r: 25,
            fill: "transparent",
            "pointer-events": "all",
          }),
        );
        g.append(
          svgNode("circle", {
            cx: p.x,
            cy: p.y,
            r: 15,
            fill: "#fff",
            stroke: issued ? "#89662f" : "#176d7b",
            "stroke-width": 2.5,
            "vector-effect": "non-scaling-stroke",
          }),
        );
        g.append(
          svgNode(
            "text",
            {
              x: p.x,
              y: p.y + 4,
              "text-anchor": "middle",
              "font-family": "system-ui,sans-serif",
              "font-size": 10,
              "font-weight": 700,
              fill: "#163d4d",
            },
            String(asset.type || "?")
              .slice(0, 3)
              .toUpperCase(),
          ),
        );
        g.append(
          svgNode(
            "text",
            {
              x: p.x,
              y: p.y + 31,
              "text-anchor": "middle",
              "font-family": "system-ui,sans-serif",
              "font-size": 12,
              fill: "#263b4a",
              "paint-order": "stroke",
              stroke: "#fff",
              "stroke-width": 4,
            },
            asset.reference || asset.sourceId || "No reference",
          ),
        );
        if (point(asset.source?.beamEnd))
          path([asset, asset.source.beamEnd], {
            stroke: "#176d7b",
            "stroke-dasharray": "5 4",
            "stroke-width": 2,
          });
        g.onclick = () => openAsset(asset, issued);
        g.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openAsset(asset, issued);
          }
        };
        svg.append(g);
      }
    };
    build();
    if (safeImage(data.image)) {
      const image = new Image();
      image.onload = () => {
        if (currentSvg !== svg) return;
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          width = 1000;
          height = (1000 * image.naturalHeight) / image.naturalWidth;
          build();
        }
      };
      image.src = data.image;
    }
    for (const zone of list(data.zones)) {
      const item = el(
        "span",
        `● Zone ${zone.number || ""}${zone.name ? ` · ${zone.name}` : ""}`,
      );
      item.style.color = color(zone.color);
      legend.append(item);
    }
    for (const circuit of list(data.circuits)) {
      const item = el(
        "span",
        `${circuit.name || "Circuit"} · drawing ${circuit.complete ? "complete" : "in progress"}`,
      );
      item.style.color = color(circuit.color);
      legend.append(item);
    }
    if (!list(data.zones).length)
      legend.append(el("span", "No zones recorded."));
    if (data.image && !safeImage(data.image))
      legend.append(
        el(
          "span",
          "Background cannot be displayed: it is not an included supported image.",
        ),
      );
    for (const asset of assets) {
      const button = el("button", asset.reference || asset.type);
      button.type = "button";
      button.style.minHeight = "44px";
      button.onclick = () => openAsset(asset, issued);
      deviceList.append(button);
    }
    if (!assets.length)
      deviceList.append(el("p", "No equipment on this floor."));
  }
  record.onchange = () => chooseFloor(floor.value);
  floor.onchange = paint;
  chooseFloor(floorId);
  return root;
}
