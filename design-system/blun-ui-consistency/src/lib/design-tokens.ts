export const blunTokens = {
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
    danger: "#F43F5E",
  },
  radius: {
    xs: "6px",
    sm: "10px",
    md: "14px",
    lg: "20px",
    xl: "28px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
  },
  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.2)",
    md: "0 10px 25px rgba(0, 0, 0, 0.22)",
    lg: "0 18px 50px rgba(0, 0, 0, 0.35)",
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    titleWeight: 700,
    bodyWeight: 400,
  },
} as const;

export type BlunTokens = typeof blunTokens;
