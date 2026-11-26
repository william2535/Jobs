const KEY = "jobs-appearance";
const choices = ["system", "light", "dark"];
const normalize = value => choices.includes(value) ? value : "system";
let activeWindow, activeController, controlCount = 0;

/** Appearance is a device preference; changing it never rewrites job records. */
export function createAppearanceController({ window: win = window, document: doc = win.document } = {}) {
  let storage, preference = "system", persisted = true, disposed = false;
  const subscribers = new Set();
  try {
    storage = win.localStorage;
    preference = normalize(storage.getItem(KEY));
  } catch { persisted = false; }
  let media;
  try { media = win.matchMedia?.("(prefers-color-scheme: dark)"); } catch { /* Older WebViews use light by default. */ }
  const getState = () => ({ preference, theme: preference === "system" ? (media?.matches ? "dark" : "light") : preference, persisted });
  const apply = () => {
    if (disposed) return;
    const state = getState();
    doc.documentElement.dataset.appearance = state.preference;
    doc.documentElement.dataset.theme = state.theme;
    doc.documentElement.style.colorScheme = state.theme;
    doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.theme === "dark" ? "#000000" : "#123763");
    subscribers.forEach(listener => listener(state));
  };
  const onStorage = event => {
    if (event.key !== KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== storage) return;
    preference = normalize(event.newValue);
    persisted = true;
    apply();
  };
  if (media?.addEventListener) media.addEventListener("change", apply);
  else media?.addListener?.(apply);
  win.addEventListener("storage", onStorage);
  apply();
  return {
    getState,
    setPreference(value) {
      if (disposed) return false;
      preference = normalize(value);
      try {
        if (!storage) throw Error("Storage unavailable");
        storage.setItem(KEY, preference);
        persisted = true;
      } catch { persisted = false; }
      apply();
      return persisted;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      subscribers.add(listener);
      listener(getState());
      return () => subscribers.delete(listener);
    },
    dispose() {
      disposed = true;
      if (media?.removeEventListener) media.removeEventListener("change", apply);
      else media?.removeListener?.(apply);
      win.removeEventListener("storage", onStorage);
      subscribers.clear();
    },
  };
}

export function initializeAppearance() {
  if (activeWindow !== window || !activeController) {
    activeController?.dispose();
    activeWindow = window;
    activeController = createAppearanceController();
  }
  return activeController;
}

export function createAppearanceControl({ controller = initializeAppearance(), document: doc = document, compact = false, toggle = false } = {}) {
  const root = doc.createElement("div");
  root.className = `appearance-control${compact ? " appearance-control--compact" : ""}${toggle ? " appearance-control--toggle" : ""}`;
  const input = doc.createElement(toggle ? "button" : "select");
  if (toggle) {
    input.type = "button";
    input.className = "appearance-toggle";
    input.addEventListener("click", () => controller.setPreference(controller.getState().theme === "dark" ? "light" : "dark"));
    root.append(input);
  } else {
    const label = doc.createElement("label"), caption = doc.createElement("span");
    caption.textContent = "Appearance";
    input.setAttribute("aria-label", "Appearance");
    input.title = "Choose System, Light or Dark appearance";
    for (const value of choices) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = value[0].toUpperCase() + value.slice(1);
      input.append(option);
    }
    label.append(caption, input);
    root.append(label);
    input.addEventListener("change", () => controller.setPreference(input.value));
  }
  const status = doc.createElement("span");
  status.id = `appearance-status-${++controlCount}`;
  status.className = "appearance-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  input.setAttribute("aria-describedby", status.id);
  root.append(status);
  const unsubscribe = controller.subscribe(state => {
    if (toggle) {
      const next = state.theme === "dark" ? "light" : "dark";
      input.setAttribute("aria-label", `Switch to ${next} mode`);
      input.title = `Switch to ${next} mode`;
      const shape = next === "light"
        ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
        : '<path d="M20.5 13.3A9 9 0 0 1 10.7 3.5a9 9 0 1 0 9.8 9.8Z"/>';
      input.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shape}</svg>`;
    } else input.value = state.preference;
    status.hidden = state.persisted;
    status.textContent = state.persisted ? "" : "Appearance applies for this session; this browser could not save the preference.";
  });
  root.dispose = unsubscribe;
  return root;
}
