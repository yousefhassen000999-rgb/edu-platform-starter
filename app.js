(() => {
  const root = document.documentElement;
  const key = "edu-theme";
  const saved = localStorage.getItem(key);
  if (saved === "dark" || saved === "light") root.dataset.theme = saved;
  const button = document.getElementById("themeToggle");
  const update = () => {
    if (!button) return;
    const dark = root.dataset.theme === "dark";
    button.innerHTML = `${dark ? "☀" : "☾"} <span>${dark ? "فاتح" : "داكن"}</span>`;
    button.setAttribute("aria-label", dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
  };
  update();
  button?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(key, root.dataset.theme);
    update();
  });
  document.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const old = btn.textContent; btn.textContent = "تم النسخ ✓";
      setTimeout(() => btn.textContent = old, 1300);
    } catch { window.prompt("انسخ الرقم:", btn.dataset.copy); }
  }));
})();