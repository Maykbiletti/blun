import {
  Bot,
  FolderKanban,
  Gauge,
  Globe,
  Layers3,
  Settings,
  Shield,
  Users,
  Wand2,
} from "lucide-react";

export type BlunNavigationItem = {
  key: string;
  label: string;
  path: string;
  icon: any;
  children?: BlunNavigationItem[];
};

export const BLUN_NAVIGATION: BlunNavigationItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: Gauge,
  },
  {
    key: "projects",
    label: "Projekte",
    path: "/projects",
    icon: FolderKanban,
  },
  {
    key: "agents",
    label: "Agents",
    path: "/agents",
    icon: Bot,
  },
  {
    key: "builder",
    label: "Builder",
    path: "/builder",
    icon: Wand2,
    children: [
      {
        key: "builder-websites",
        label: "Webseiten",
        path: "/builder/websites",
        icon: Globe,
      },
      {
        key: "builder-blocks",
        label: "Blocks",
        path: "/builder/blocks",
        icon: Layers3,
      },
    ],
  },
  {
    key: "teams",
    label: "Teams",
    path: "/teams",
    icon: Users,
  },
  {
    key: "admin",
    label: "Admin",
    path: "/admin",
    icon: Shield,
  },
  {
    key: "settings",
    label: "Einstellungen",
    path: "/settings",
    icon: Settings,
  },
];

export function findNavigationItemByPath(pathname: string): BlunNavigationItem | null {
  for (const item of BLUN_NAVIGATION) {
    if (item.path === pathname) return item;
    if (item.children) {
      const child = item.children.find((entry) => entry.path === pathname);
      if (child) return child;
    }
  }
  return null;
}

export function isNavigationPathActive(item: BlunNavigationItem, pathname: string): boolean {
  if (pathname === item.path) return true;
  if (pathname.startsWith(`${item.path}/`)) return true;
  return item.children?.some((child) => isNavigationPathActive(child, pathname)) ?? false;
}
