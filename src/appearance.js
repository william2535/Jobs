const KEY = "jobs-appearance";
export function initializeAppearance() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => { const choice = localStorage.getItem(KEY) || "system"; document.documentElement.dataset.theme = choice === "system" ? (media.matches ? "dark" : "light") : choice; document.documentElement.style.colorScheme = document.documentElement.dataset.theme; };
  apply();
  media.addEventListener?.("change", apply);
}
