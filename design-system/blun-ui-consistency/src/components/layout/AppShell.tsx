"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BLUN_NAVIGATION,
  isNavigationPathActive,
  type BlunNavigationItem,
} from "@/src/config/navigation.config";
import { blunTokens } from "@/src/lib/design-tokens";

type AppShellProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

function SidebarItem({ item, pathname }: { item: BlunNavigationItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = isNavigationPathActive(item, pathname);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Link
        href={item.path}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: blunTokens.radius.md,
          color: isActive ? blunTokens.colors.text : blunTokens.colors.textMuted,
          background: isActive ? "rgba(239, 68, 68, 0.14)" : "transparent",
          border: `1px solid ${isActive ? "rgba(239, 68, 68, 0.34)" : "transparent"}`,
          textDecoration: "none",
          fontWeight: 600,
          transition: "all 0.15s ease",
        }}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>

      {item.children?.length ? (
        <div style={{ display: "grid", gap: 6, paddingLeft: 14 }}>
          {item.children.map((child) => {
            const ChildIcon = child.icon;
            const childActive = isNavigationPathActive(child, pathname);

            return (
              <Link
                key={child.key}
                href={child.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: blunTokens.radius.sm,
                  color: childActive ? blunTokens.colors.text : blunTokens.colors.textMuted,
                  background: childActive ? "rgba(239, 68, 68, 0.10)" : "transparent",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                <ChildIcon size={16} />
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function AppShell({ title = "BLUN", subtitle, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        background: blunTokens.colors.bg,
        color: blunTokens.colors.text,
        fontFamily: blunTokens.typography.fontFamily,
      }}
    >
      <aside
        style={{
          borderRight: `1px solid ${blunTokens.colors.border}`,
          padding: blunTokens.spacing.lg,
          background: blunTokens.colors.surfaceAlt,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 6,
            marginBottom: blunTokens.spacing.xl,
            padding: "14px 16px",
            borderRadius: blunTokens.radius.lg,
            border: `1px solid ${blunTokens.colors.border}`,
            background:
              "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(17,24,39,0.7))",
            boxShadow: blunTokens.shadow.md,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800 }}>BLUN</div>
          <div style={{ color: blunTokens.colors.textMuted, fontSize: 14 }}>
            Global UI Consistency Mode
          </div>
        </div>

        <nav style={{ display: "grid", gap: 10 }}>
          {BLUN_NAVIGATION.map((item) => (
            <SidebarItem key={item.key} item={item} pathname={pathname} />
          ))}
        </nav>
      </aside>

      <main style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
        <header
          style={{
            borderBottom: `1px solid ${blunTokens.colors.border}`,
            padding: `${blunTokens.spacing.lg} ${blunTokens.spacing.xl}`,
            background: "rgba(11, 15, 20, 0.82)",
            backdropFilter: "blur(10px)",
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{title}</h1>
            {subtitle ? (
              <p
                style={{
                  margin: 0,
                  color: blunTokens.colors.textMuted,
                  fontSize: 14,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </header>

        <section
          style={{
            padding: blunTokens.spacing.xl,
            maxWidth: 1600,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {children}
        </section>
      </main>
    </div>
  );
}
