(function () {
  window.BLUN_TOKENS = {
    colors: {
      bg: "#0B0F14",
      surface: "#111827",
      surfaceAlt: "#0F172A",
      border: "#1F2937",
      text: "#F3F4F6",
      textMuted: "#9CA3AF",
      primary: "#EF4444",
      primaryHover: "#DC2626",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#F43F5E"
    },
    radius: {
      xs: "6px",
      sm: "10px",
      md: "14px",
      lg: "20px",
      xl: "28px"
    },
    spacing: {
      xs: "4px",
      sm: "8px",
      md: "16px",
      lg: "24px",
      xl: "32px",
      xxl: "48px"
    },
    shadow: {
      sm: "0 1px 2px rgba(0, 0, 0, 0.2)",
      md: "0 10px 25px rgba(0, 0, 0, 0.22)",
      lg: "0 18px 50px rgba(0, 0, 0, 0.35)"
    },
    typography: {
      fontFamily: "Inter, 'Segoe UI', sans-serif",
      titleWeight: 700,
      bodyWeight: 400
    }
  };

  window.applyBlunTokens = function () {
    const t = window.BLUN_TOKENS;
    const root = document.documentElement;

    root.style.setProperty("--blun-color-bg", t.colors.bg);
    root.style.setProperty("--blun-color-surface", t.colors.surface);
    root.style.setProperty("--blun-color-surface-alt", t.colors.surfaceAlt);
    root.style.setProperty("--blun-color-border", t.colors.border);
    root.style.setProperty("--blun-color-text", t.colors.text);
    root.style.setProperty("--blun-color-text-muted", t.colors.textMuted);
    root.style.setProperty("--blun-color-primary", t.colors.primary);
    root.style.setProperty("--blun-color-primary-hover", t.colors.primaryHover);
    root.style.setProperty("--blun-color-success", t.colors.success);
    root.style.setProperty("--blun-color-warning", t.colors.warning);
    root.style.setProperty("--blun-color-danger", t.colors.danger);

    root.style.setProperty("--blun-radius-xs", t.radius.xs);
    root.style.setProperty("--blun-radius-sm", t.radius.sm);
    root.style.setProperty("--blun-radius-md", t.radius.md);
    root.style.setProperty("--blun-radius-lg", t.radius.lg);
    root.style.setProperty("--blun-radius-xl", t.radius.xl);

    root.style.setProperty("--blun-spacing-xs", t.spacing.xs);
    root.style.setProperty("--blun-spacing-sm", t.spacing.sm);
    root.style.setProperty("--blun-spacing-md", t.spacing.md);
    root.style.setProperty("--blun-spacing-lg", t.spacing.lg);
    root.style.setProperty("--blun-spacing-xl", t.spacing.xl);
    root.style.setProperty("--blun-spacing-xxl", t.spacing.xxl);

    root.style.setProperty("--blun-shadow-sm", t.shadow.sm);
    root.style.setProperty("--blun-shadow-md", t.shadow.md);
    root.style.setProperty("--blun-shadow-lg", t.shadow.lg);

    root.style.setProperty("--blun-font-family", t.typography.fontFamily);
    root.style.setProperty("--blun-font-title-weight", String(t.typography.titleWeight));
    root.style.setProperty("--blun-font-body-weight", String(t.typography.bodyWeight));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.applyBlunTokens);
  } else {
    window.applyBlunTokens();
  }
})();