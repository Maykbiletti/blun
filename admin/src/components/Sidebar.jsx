import { NavLink } from 'react-router-dom';

const nav = [
  { label: 'Dashboard',    path: '/',            icon: '▦' },
  { label: 'Users',        path: '/users',       icon: '👤' },
  { label: 'Companies',    path: '/companies',   icon: '🏢' },
  { label: 'Conversations',path: '/conversations',icon: '💬' },
  { label: 'Affiliates',   path: '/affiliates',  icon: '🔗' },
  { label: 'Billing',      path: '/billing',     icon: '💳' },
  { label: 'System',       path: '/system',      icon: '⚙️' },
];

export default function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-blun-card border-r border-blun-border flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-blun-border">
        <span className="text-lg font-bold tracking-tight">
          BLUN<span className="text-blun-blue">.admin</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {nav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="w-5 text-center text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-blun-border">
        <p className="text-xs text-blun-fg3">admin.blun.ai</p>
        <p className="text-[10px] text-blun-fg3 mt-0.5">v1.0.0</p>
      </div>
    </aside>
  );
}
