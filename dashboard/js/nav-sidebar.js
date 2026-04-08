/**
 * Nav-Sidebar mit Hash-basiertem Routing
 * Sections: #dashboard, #agents, #marketplace, #chat, #canvas, #affiliate, #settings
 */

class NavSidebar {
  constructor(opts = {}) {
    this.sections = {
      dashboard: { name: 'Dashboard', icon: '📊', hidden: false },
      agents: { name: 'Agents', icon: '🤖', hidden: false },
      marketplace: { name: 'Marketplace', icon: '🛍️', hidden: false },
      chat: { name: 'Chat', icon: '💬', hidden: false },
      canvas: { name: 'Canvas', icon: '🎨', hidden: false },
      affiliate: { name: 'Affiliate', icon: '💰', hidden: false },
      settings: { name: 'Einstellungen', icon: '⚙️', hidden: false }
    };

    this.activeSection = null;
    this.onNavigate = opts.onNavigate || null;
    this.init();
  }

  init() {
    // Hash-basiertes Routing
    window.addEventListener('hashchange', () => this.handleRouting());
    window.addEventListener('load', () => this.handleRouting());

    // Sidebar-Items generieren
    // this.renderSidebar();

    // Initial navigate
    this.handleRouting();
  }

  renderSidebar() {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    // Bestehende Items entfernen (falls vorhanden) oder hinzufügen
    let navSection = sidebar.querySelector('[data-nav-section="main"]');
    if (!navSection) {
      navSection = document.createElement('div');
      navSection.setAttribute('data-nav-section', 'main');
      sidebar.appendChild(navSection);
    }

    navSection.innerHTML = '';

    // Section Header
    const header = document.createElement('div');
    header.className = 'nav-section';
    header.textContent = 'HAUPTMENÜ';
    navSection.appendChild(header);

    // Nav Items
    for (const [key, config] of Object.entries(this.sections)) {
      if (config.hidden) continue;

      const item = document.createElement('div');
      item.className = 'nav-item';
      item.id = `nav-${key}`;
      item.setAttribute('data-page', key);
      item.innerHTML = `<span>${config.icon}</span><span>${config.name}</span>`;

      item.addEventListener('click', () => { showPage(key); });

      navSection.appendChild(item);
    }
  }

  handleRouting() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const section = this.sections[hash] ? hash : 'dashboard';

    if (this.activeSection === section) return;

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-page') === section);
    });

    // Update page visibility
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });

    const activePage = document.getElementById(`page-${section}`);
    if (activePage) {
      activePage.classList.add('active');
    }

    this.activeSection = section;

    // Callback
    if (this.onNavigate) {
      this.onNavigate(section);
    }

    // Event
    document.dispatchEvent(new CustomEvent('nav-changed', { detail: { section } }));
  }

  setSection(section) {
    if (this.sections[section]) {
      window.location.hash = `#${section}`;
    }
  }

  setActive(section) {
    this.handleRouting();
  }

  hideSection(section) {
    if (this.sections[section]) {
      this.sections[section].hidden = true;
      // this.renderSidebar();
    }
  }

  showSection(section) {
    if (this.sections[section]) {
      this.sections[section].hidden = false;
      // this.renderSidebar();
    }
  }

  getActiveSection() {
    return this.activeSection || 'dashboard';
  }
}


// Auto-init wenn DOM bereit
if (typeof window !== "undefined") {
  window.NavSidebar = NavSidebar;
  // auto-init disabled, handled by index.html DOMContentLoaded
}

if (typeof module !== "undefined") module.exports = { NavSidebar };
