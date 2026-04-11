(function () {
  window.BLUN_NAVIGATION = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: "📊",
      path: "#dashboard"
    },
    {
      key: "projects",
      label: "Projekte",
      icon: "📁",
      path: "#projects"
    },
    {
      key: "agents",
      label: "Agents",
      icon: "🤖",
      path: "#agents"
    },
    {
      key: "builder",
      label: "Builder",
      icon: "🪄",
      path: "#builder",
      children: [
        {
          key: "builder-websites",
          label: "Webseiten",
          icon: "🌐",
          path: "#builder-websites"
        },
        {
          key: "builder-blocks",
          label: "Blocks",
          icon: "🧱",
          path: "#builder-blocks"
        }
      ]
    },
    {
      key: "teams",
      label: "Teams",
      icon: "👥",
      path: "#teams"
    },
    {
      key: "admin",
      label: "Admin",
      icon: "🛡️",
      path: "#admin"
    },
    {
      key: "settings",
      label: "Einstellungen",
      icon: "⚙️",
      path: "#settings"
    }
  ];

  window.findBlunNavigationItemByPath = function (pathname) {
    for (const item of window.BLUN_NAVIGATION) {
      if (item.path === pathname) return item;
      if (item.children) {
        const child = item.children.find((entry) => entry.path === pathname);
        if (child) return child;
      }
    }
    return null;
  };

  window.isBlunNavigationPathActive = function (item, pathname) {
    if (pathname === item.path) return true;
    if (pathname.startsWith(item.path + "/")) return true;
    if (item.children && item.children.length) {
      return item.children.some((child) => window.isBlunNavigationPathActive(child, pathname));
    }
    return false;
  };
})();