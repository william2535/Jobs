/** A non-modal tool chest: the current overview stays mounted underneath it. */
export function createToolboxChest({
  loadToolbox = () => import("./toolbox.js"),
  onClose = () => {},
} = {}) {
  let panel = null, tray = null, view = null, trigger = null;
  let generation = 0, disposed = false;

  function position() {
    if (!panel) return;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    // Keep the overview visible above and the dashboard navigation below.
    const top = Math.min(156, Math.max(viewportHeight < 480 ? 32 : 72, viewportHeight * 0.20));
    panel.style.setProperty("--chest-viewport-height", `${viewportHeight}px`);
    panel.style.setProperty("--chest-bottom", viewportHeight < 480 ? "24px" : "90px");
    panel.style.setProperty("--chest-top", `${top}px`);
    const bounds = panel.getBoundingClientRect();
    const source = trigger?.isConnected ? trigger.getBoundingClientRect() : bounds;
    panel.style.setProperty("--chest-origin-x", `${source.left + source.width / 2 - bounds.left}px`);
    panel.style.setProperty("--chest-origin-y", `${source.top + source.height / 2 - bounds.top}px`);
  }

  function markTrigger(element, expanded) {
    if (!element) return;
    element.setAttribute("aria-haspopup", "dialog");
    element.setAttribute("aria-controls", "toolbox-chest");
    element.setAttribute("aria-expanded", String(expanded));
  }

  function remove({ restoreFocus = true, notify = true } = {}) {
    if (!panel) return;
    generation++;
    const returnTo = trigger?.isConnected ? trigger : document.querySelector("[data-toolbox-trigger]");
    view?.dispose?.();
    view = null;
    panel.remove();
    panel = tray = null;
    markTrigger(trigger, false);
    trigger = null;
    document.removeEventListener("keydown", escape);
    window.removeEventListener("resize", position);
    window.visualViewport?.removeEventListener("resize", position);
    if (restoreFocus) returnTo?.focus({ preventScroll: true });
    if (notify) onClose();
  }

  function close(options = {}) {
    if (view?.confirmLeave?.() === false) return false;
    remove(options);
    return true;
  }

  function escape(event) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    close();
  }

  async function load() {
    const own = ++generation, target = tray;
    target.textContent = "Opening your tools…";
    target.setAttribute("aria-busy", "true");
    try {
      const { renderToolbox } = await loadToolbox();
      if (disposed || own !== generation || !panel || tray !== target) return;
      view = renderToolbox({ onHome: () => close(), embedded: true });
      view.addEventListener("toolboxviewchange", () => {
        if (!tray) return;
        tray.scrollTop = 0;
        const destination = view.dataset.toolboxView === "landing"
          ? view.querySelector("[data-toolbox-open]") : view.querySelector("h1");
        if (destination) {
          if (destination.tagName === "H1") destination.tabIndex = -1;
          destination.focus({ preventScroll: true });
        }
      });
      target.replaceChildren(view);
    } catch {
      if (disposed || own !== generation || !panel || tray !== target) return;
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = "Your tools could not be opened. Connect once to prepare the offline cache, then try again.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry opening toolbox";
      retry.onclick = load;
      target.replaceChildren(message, retry);
    } finally {
      if (own === generation) target.removeAttribute("aria-busy");
    }
  }

  function open(source) {
    if (disposed) return;
    if (panel) { panel.querySelector(".toolbox-chest-close")?.focus(); return; }
    trigger = source || document.activeElement;
    panel = document.createElement("section");
    panel.id = "toolbox-chest";
    panel.className = "toolbox-chest";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "toolbox-chest-title");
    panel.innerHTML = `<header class="toolbox-chest-lid"><div class="toolbox-chest-handle" aria-hidden="true"></div><div class="toolbox-chest-title-row"><span class="toolbox-chest-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 8V5h10v3M3 8h18v12H3zM3 13h18M10 11v4h4v-4z"/></svg></span><div><small>YOUR TOOLBOX</small><h2 id="toolbox-chest-title">Pick a tool</h2></div><button type="button" class="toolbox-chest-close" aria-label="Close toolbox"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header><div class="toolbox-chest-tray"></div>`;
    tray = panel.querySelector(".toolbox-chest-tray");
    panel.querySelector(".toolbox-chest-close").onclick = () => close();
    document.body.append(panel);
    markTrigger(trigger, true);
    position();
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    panel.querySelector(".toolbox-chest-close").focus({ preventScroll: true });
    load();
  }

  return {
    open, close,
    get isOpen() { return !!panel; },
    hasUnsavedChanges: () => !!view?.hasUnsavedChanges?.(),
    refreshAnchor(source) {
      if (!panel) return;
      if (source && source !== trigger) { markTrigger(trigger, false); trigger = source; markTrigger(trigger, true); }
      position();
    },
    dispose() { disposed = true; remove({ restoreFocus: false, notify: false }); },
  };
}
