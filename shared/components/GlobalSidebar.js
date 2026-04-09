/**
 * GlobalSidebar - Einheitliche Sidebar für alle BLUN-Unterseiten
 * Features: Collapse/Expand, Mobile Drawer, localStorage Persistence
 */

class GlobalSidebar {
  constructor(opts = {}) {
    this.container = opts.container || document.body;
    this.isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    this.isMobile = window.innerWidth < 768;

    this.sections = {
      dashboard: { name: 'Dashboard', icon: '📊', url: '/dashboard/index.html' },
      agents: { name: 'Agents', icon: '🤖', url: '/dashboard/index.html#agents' },
      marketplace: { name: 'Marketplace', icon: '🛍️', url: '/dashboard/index.html#marketplace' },
      chat: { name: 'Chat', icon: '💬', url: '/dashboard/index.html#chat' },
      canvas: { name: 'Canvas', icon: '🎨', url: '/dashboard/index.html#canvas' },
      billing: { name: 'Billing', icon: '💳', url: '/dashboard/billing.html' },
      models: { name: 'Models', icon: '🧠', url: '/dashboard/models.html' },
      websites: { name: 'Websites', icon: '🌐', url: '/dashboard/websites.html' },
      software: { name: 'Software', icon: '⚙️', url: '/dashboard/software.html' },
      affiliate: { name: 'Affiliate', icon: '💰', url: '/dashboard/index.html#affiliate' },
      settings: { name: 'Einstellungen', icon: '⚙️', url: '/dashboard/index.html#settings' }
    };

    this.onNavigate = opts.onNavigate || null;
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();
    this.handleResponsive();
    window.addEventListener('resize', () => this.handleResponsive());
  }

  render() {
    // Sidebar Container
    const sidebar = document.createElement('nav');
    sidebar.className = `global-sidebar ${this.isCollapsed ? 'collapsed' : 'expanded'}`;
    sidebar.id = 'global-sidebar';

    // Header mit Toggle-Button
    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.innerHTML = `
      <div class="sidebar-logo">
        <span class="logo-icon">🚀</span>
        <span class="logo-text">BLUN</span>
      </div>
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle Sidebar">
        <span class="toggle-icon">≡</span>
      </button>
    `;
    sidebar.appendChild(header);

    // Nav Sections
    const navContainer = document.createElement('div');
    navContainer.className = 'sidebar-nav';

    // HAUPTMENÜ
    const mainSection = document.createElement('div');
    mainSection.className = 'nav-section';
    mainSection.innerHTML = '<div class="section-label">HAUPTMENÜ</div>';

    const mainItems = ['dashboard', 'agents', 'marketplace', 'chat', 'canvas'];
    mainItems.forEach(key => {
      const item = this.createNavItem(key, this.sections[key]);
      mainSection.appendChild(item);
    });
    navContainer.appendChild(mainSection);

    // VERWALTUNG
    const adminSection = document.createElement('div');
    adminSection.className = 'nav-section';
    adminSection.innerHTML = '<div class="section-label">VERWALTUNG</div>';

    const adminItems = ['billing', 'models', 'websites', 'software'];
    adminItems.forEach(key => {
      const item = this.createNavItem(key, this.sections[key]);
      adminSection.appendChild(item);
    });
    navContainer.appendChild(adminSection);

    // WEITERE
    const otherSection = document.createElement('div');
    otherSection.className = 'nav-section';
    otherSection.innerHTML = '<div class="section-label">WEITERE</div>';

    const otherItems = ['affiliate', 'settings'];
    otherItems.forEach(key => {
      const item = this.createNavItem(key, this.sections[key]);
      otherSection.appendChild(item);
    });
    navContainer.appendChild(otherSection);

    sidebar.appendChild(navContainer);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'sidebar-footer';
    footer.innerHTML = `
      <div class="user-info">
        <span class="user-icon">👤</span>
        <span class="user-name">Profile</span>
      </div>
    `;
    sidebar.appendChild(footer);

    // Insert into container
    const existing = document.getElementById('global-sidebar');
    if (existing) existing.remove();
    this.container.insertBefore(sidebar, this.container.firstChild);
  }

  createNavItem(key, config) {
    const item = document.createElement('a');
    item.className = 'nav-item';
    item.href = config.url;
    item.setAttribute('data-page', key);
    item.innerHTML = `
      <span class="nav-icon">${config.icon}</span>
      <span class="nav-label">${config.name}</span>
    `;

    item.addEventListener('click', (e) => {
      if (this.isMobile) {
        this.toggleSidebar(true); // Auto-close on mobile
      }
      if (this.onNavigate) {
        e.preventDefault();
        this.onNavigate(key);
        window.location.href = config.url;
      }
    });

    return item;
  }

  attachEventListeners() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleSidebar());
    }

    // Mobile drawer overlay close
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.toggleSidebar(true));
    }

    // Mark current page as active
    this.updateActiveItem();
  }

  toggleSidebar(close = false) {
    const sidebar = document.getElementById('global-sidebar');
    if (!sidebar) return;

    if (close) {
      this.isCollapsed = true;
    } else {
      this.isCollapsed = !this.isCollapsed;
    }

    localStorage.setItem('sidebar-collapsed', this.isCollapsed);
    sidebar.classList.toggle('collapsed', this.isCollapsed);
    sidebar.classList.toggle('expanded', !this.isCollapsed);
  }

  handleResponsive() {
    const newIsMobile = window.innerWidth < 768;
    if (newIsMobile !== this.isMobile) {
      this.isMobile = newIsMobile;
      this.render();
      this.attachEventListeners();
    }
  }

  updateActiveItem() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item[data-page]');

    navItems.forEach(item => {
      const url = item.getAttribute('href');
      const isActive = currentPath.includes(url.split('/').pop().split('.')[0]);
      item.classList.toggle('active', isActive);
    });
  }

  setActive(key) {
    const item = document.querySelector(`.nav-item[data-page="${key}"]`);
    if (item) {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    }
  }

  getActiveSection() {
    const active = document.querySelector('.nav-item.active');
    return active ? active.getAttribute('data-page') : 'dashboard';
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GlobalSidebar = GlobalSidebar;
}

if (typeof module !== 'undefined') {
  module.exports = { GlobalSidebar };
}
