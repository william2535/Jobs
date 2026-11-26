/* Apply the saved appearance before the stylesheet paints. No job data is read. */
(() => {
  let preference = "system";
  try {
    const stored = localStorage.getItem("jobs-appearance");
    if (["system", "light", "dark"].includes(stored)) preference = stored;
  } catch { /* Restricted storage must never prevent Jobs from opening. */ }
  let systemDark = false;
  try { systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches || false; } catch { /* Light fallback. */ }
  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  document.documentElement.dataset.appearance = preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#123763");
})();
