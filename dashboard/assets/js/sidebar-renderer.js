(function () {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildChildItem(item, currentPath) {
    const active = window.isBlunNavigationPathActive(item, currentPath);
    return `
      <a
        href="${escapeHtml(item.path)}"
        class="blun-nav-child ${active ? "is-active" : ""}"
        data-nav-key="${escapeHtml(item.key)}"
      >
        <span class="blun-nav-icon">${escapeHtml(item.icon || "•")}</span>
        <span>${escapeHtml(item.label)}</span>
      </a>
    `;
  }

  function buildItem(item, currentPath) {
    const active = window.isBlunNavigationPathActive(item, currentPath);
    const childrenHtml = item.children && item.children.length
      ? `<div class="blun-nav-children">${item.children.map((child) => buildChildItem(child, currentPath)).join("")}</div>`
      : "";

    return `
      <div class="blun-nav-group">
        <a
          href="${escapeHtml(item.path)}"
          class="blun-nav-item ${active ? "is-active" : ""}"
          data-nav-key="${escapeHtml(item.key)}"
        >
          <span class="blun-nav-icon">${escapeHtml(item.icon || "•")}</span>
          <span>${escapeHtml(item.label)}</span>
        </a>
        ${childrenHtml}
      </div>
    `;
  }

  function defaultPath() {
    const hash = window.location.hash || "#dashboard";
    return hash;
  }

  function injectDefaultStyles() {
    if (document.getElementById("blun-nav-styles")) return;

    const style = document.createElement("style");
    style.id = "blun-nav-styles";
    style.textContent = `
      .blun-nav-root {
        display: grid;
        gap: 10px;
      }

      .blun-nav-group {
        display: grid;
        gap: 6px;
      }

      .blun-nav-item,
      .blun-nav-child {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: var(--blun-color-text-muted, #9CA3AF);
        border-radius: var(--blun-radius-md, 14px);
        transition: all 0.15s ease;
      }

      .blun-nav-item {
        padding: 12px 14px;
        font-weight: 600;
      }

      .blun-nav-child {
        padding: 10px 12px;
        margin-left: 14px;
        font-size: 14px;
        border-radius: var(--blun-radius-sm, 10px);
      }

      .blun-nav-item.is-active,
      .blun-nav-child.is-active {
        color: var(--blun-color-text, #F3F4F6);
        background: rgba(239, 68, 68, 0.14);
        border: 1px solid rgba(239, 68, 68, 0.34);
      }

      .blun-nav-item:hover,
      .blun-nav-child:hover {
        color: var(--blun-color-text, #F3F4F6);
        background: rgba(255, 255, 255, 0.05);
      }

      .blun-nav-children {
        display: grid;
        gap: 6px;
      }

      .blun-nav-icon {
        width: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);
  }

  window.renderBlunSidebar = function (targetSelector, currentPath) {
    const target = typeof targetSelector === "string"
      ? document.querySelector(targetSelector)
      : targetSelector;

    if (!target) {
      console.warn("BLUN sidebar target not found:", targetSelector);
      return;
    }

    if (!window.BLUN_NAVIGATION || !Array.isArray(window.BLUN_NAVIGATION)) {
      console.error("BLUN_NAVIGATION missing. Make sure navigation.config.js is loaded first.");
      return;
    }

    injectDefaultStyles();

    const path = currentPath || defaultPath();
    target.innerHTML = `
      <nav class="blun-nav-root" data-blun-nav="true">
        ${window.BLUN_NAVIGATION.map((item) => buildItem(item, path)).join("")}
      </nav>
    `;
  };

  function autoRenderIfRequested() {
    const autoTarget = document.querySelector("[data-blun-sidebar]");
    if (!autoTarget) return;
    window.renderBlunSidebar(autoTarget, defaultPath());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoRenderIfRequested);
  } else {
    autoRenderIfRequested();
  }

  window.addEventListener("hashchange", function () {
    const autoTarget = document.querySelector("[data-blun-sidebar]");
    if (!autoTarget) return;
    window.renderBlunSidebar(autoTarget, defaultPath());
  });
})();