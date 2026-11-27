/** Screen navigation starts above the banner, without changing nested plan/timeline scroll. */
export function scrollPageToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export function initializePageScroll() {
  // Jobs owns screen navigation; browser restoration must not hide the header on reload.
  try { window.history.scrollRestoration = "manual"; } catch { /* Route resets still work. */ }
  window.addEventListener("pageshow", scrollPageToTop);
}
