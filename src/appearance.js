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
    doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.theme === "dark" ? "#07121f" : "#123763");
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

export function createAppearanceControl({ controller = initializeAppearance(), document: doc = document, compact = false } = {}) {
  const root = doc.createElement("div");
  root.className = `appearance-control${compact ? " appearance-control--compact" : ""}`;
  const label = doc.createElement("label"), caption = doc.createElement("span"), select = doc.createElement("select");
  caption.textContent = "Appearance";
  select.setAttribute("aria-label", "Appearance");
  select.title = "Choose System, Light or Dark appearance";
  for (const value of choices) {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    select.append(option);
  }
  const status = doc.createElement("span");
  status.id = `appearance-status-${++controlCount}`;
  status.className = "appearance-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  select.setAttribute("aria-describedby", status.id);
  label.append(caption, select);
  root.append(label, status);
  select.addEventListener("change", () => controller.setPreference(select.value));
  const unsubscribe = controller.subscribe(state => {
    select.value = state.preference;
    status.hidden = state.persisted;
    status.textContent = state.persisted ? "" : "Appearance applies for this session; this browser could not save the preference.";
  });
  root.dispose = unsubscribe;
  return root;
}
