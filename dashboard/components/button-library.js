/**
 * Button Component Library
 * Variants: primary, secondary, danger, success, warning, info, outline
 * Sizes: sm, md, lg, xl
 * Features: loading states, icons, disabled, custom events
 */

class Button {
  constructor(options = {}) {
    this.options = {
      text: options.text || 'Button',
      variant: options.variant || 'primary', // primary|secondary|danger|success|warning|info|outline
      size: options.size || 'md', // sm|md|lg|xl
      disabled: options.disabled || false,
      loading: options.loading || false,
      fullWidth: options.fullWidth || false,
      icon: options.icon || null, // {name, position: 'left'|'right'}
      onClick: options.onClick || null,
      className: options.className || '',
      ariaLabel: options.ariaLabel || options.text,
      title: options.title || '',
      id: options.id || null
    };

    this.element = null;
    this.isLoading = this.options.loading;
    this.isDisabled = this.options.disabled;
    this.eventListeners = {};

    this.createButton();
  }

  createButton() {
    this.element = document.createElement('button');
    this.element.className = this.getClassName();
    this.element.setAttribute('aria-label', this.options.ariaLabel);
    this.element.disabled = this.isDisabled;

    if (this.options.id) {
      this.element.id = this.options.id;
    }

    if (this.options.title) {
      this.element.title = this.options.title;
    }

    // Create button content
    const content = this.createContent();
    this.element.appendChild(content);

    // Add event listeners
    this.setupEventListeners();
  }

  getClassName() {
    const classes = [
      'btn',
      `btn-${this.options.variant}`,
      `btn-${this.options.size}`,
      this.options.fullWidth && 'btn-full-width',
      this.options.className,
      this.isLoading && 'btn-loading',
      this.isDisabled && 'btn-disabled'
    ].filter(Boolean);

    return classes.join(' ');
  }

  createContent() {
    const container = document.createElement('span');
    container.className = 'btn-content';

    // Left icon
    if (this.options.icon && this.options.icon.position !== 'right') {
      container.appendChild(this.createIcon());
    }

    // Text
    const textSpan = document.createElement('span');
    textSpan.className = 'btn-text';
    textSpan.textContent = this.options.text;
    container.appendChild(textSpan);

    // Loading spinner (hidden by default)
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    spinner.innerHTML = `
      <svg class="spinner-icon" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="31.4" stroke-dashoffset="0"/>
      </svg>
    `;
    if (!this.isLoading) {
      spinner.style.display = 'none';
    }
    container.appendChild(spinner);

    // Right icon
    if (this.options.icon && this.options.icon.position === 'right') {
      container.appendChild(this.createIcon());
    }

    return container;
  }

  createIcon() {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'btn-icon';

    if (this.options.icon.svg) {
      // Custom SVG
      iconSpan.innerHTML = this.options.icon.svg;
    } else if (this.options.icon.name) {
      // Icon name (emoji or icon class)
      iconSpan.textContent = this.getIconEmoji(this.options.icon.name);
    }

    return iconSpan;
  }

  getIconEmoji(name) {
    const icons = {
      'chevron-right': '›',
      'chevron-left': '‹',
      'arrow-right': '→',
      'arrow-left': '←',
      'check': '✓',
      'close': '✕',
      'plus': '+',
      'minus': '−',
      'trash': '🗑',
      'edit': '✎',
      'search': '🔍',
      'home': '🏠',
      'settings': '⚙',
      'bell': '🔔',
      'save': '💾',
      'upload': '⬆',
      'download': '⬇',
      'share': '↗',
      'star': '★',
      'heart': '♥',
      'lock': '🔒',
      'unlock': '🔓',
      'eye': '👁',
      'help': '?'
    };
    return icons[name] || name;
  }

  setupEventListeners() {
    this.element.addEventListener('click', (e) => {
      if (!this.isDisabled && !this.isLoading) {
        if (this.options.onClick) {
          this.options.onClick(e);
        }
        this.emit('click', e);
      }
    });

    this.element.addEventListener('mouseenter', (e) => {
      this.emit('hover', e);
    });

    this.element.addEventListener('mouseleave', (e) => {
      this.emit('unhover', e);
    });

    this.element.addEventListener('focus', (e) => {
      this.emit('focus', e);
    });

    this.element.addEventListener('blur', (e) => {
      this.emit('blur', e);
    });
  }

  setLoading(isLoading) {
    this.isLoading = isLoading;
    this.element.disabled = isLoading || this.isDisabled;

    const spinner = this.element.querySelector('.btn-spinner');
    const text = this.element.querySelector('.btn-text');
    const icon = this.element.querySelector('.btn-icon');

    if (isLoading) {
      spinner.style.display = 'inline-block';
      if (text) text.style.opacity = '0.5';
      if (icon) icon.style.opacity = '0.5';
      this.element.classList.add('btn-loading');
      this.element.setAttribute('aria-busy', 'true');
    } else {
      spinner.style.display = 'none';
      if (text) text.style.opacity = '1';
      if (icon) icon.style.opacity = '1';
      this.element.classList.remove('btn-loading');
      this.element.setAttribute('aria-busy', 'false');
    }
  }

  setDisabled(disabled) {
    this.isDisabled = disabled;
    this.element.disabled = disabled;

    if (disabled) {
      this.element.classList.add('btn-disabled');
    } else {
      this.element.classList.remove('btn-disabled');
    }
  }

  setText(text) {
    this.options.text = text;
    const textSpan = this.element.querySelector('.btn-text');
    if (textSpan) {
      textSpan.textContent = text;
    }
    this.element.setAttribute('aria-label', text);
  }

  setVariant(variant) {
    this.options.variant = variant;
    this.element.className = this.getClassName();
  }

  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  off(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  render() {
    return this.element;
  }

  focus() {
    this.element.focus();
  }

  blur() {
    this.element.blur();
  }

  remove() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

// ==================== BUTTON GROUP ====================

class ButtonGroup {
  constructor(options = {}) {
    this.options = {
      buttons: options.buttons || [],
      vertical: options.vertical || false,
      className: options.className || '',
      gap: options.gap || 'md'
    };

    this.buttons = [];
    this.element = null;

    this.createGroup();
  }

  createGroup() {
    this.element = document.createElement('div');
    this.element.className = this.getClassName();

    this.options.buttons.forEach(btnOptions => {
      const btn = new Button(btnOptions);
      this.buttons.push(btn);
      this.element.appendChild(btn.render());
    });
  }

  getClassName() {
    const classes = [
      'btn-group',
      this.options.vertical && 'btn-group-vertical',
      `btn-gap-${this.options.gap}`,
      this.options.className
    ].filter(Boolean);

    return classes.join(' ');
  }

  addButton(options) {
    const btn = new Button(options);
    this.buttons.push(btn);
    this.element.appendChild(btn.render());
    return btn;
  }

  render() {
    return this.element;
  }
}

// ==================== SPLIT BUTTON ====================

class SplitButton {
  constructor(options = {}) {
    this.options = {
      text: options.text || 'Actions',
      variant: options.variant || 'primary',
      size: options.size || 'md',
      disabled: options.disabled || false,
      menuItems: options.menuItems || [],
      onClick: options.onClick || null,
      onMenuSelect: options.onMenuSelect || null
    };

    this.element = null;
    this.menu = null;
    this.isOpen = false;

    this.create();
  }

  create() {
    this.element = document.createElement('div');
    this.element.className = 'split-button-container';

    // Main button
    const mainBtn = document.createElement('button');
    mainBtn.className = `btn btn-${this.options.variant} btn-${this.options.size}`;
    mainBtn.textContent = this.options.text;
    mainBtn.disabled = this.options.disabled;
    mainBtn.addEventListener('click', (e) => {
      if (this.options.onClick) {
        this.options.onClick(e);
      }
    });

    // Dropdown button
    const dropdownBtn = document.createElement('button');
    dropdownBtn.className = `btn btn-${this.options.variant} btn-${this.options.size} split-dropdown-btn`;
    dropdownBtn.innerHTML = '▼';
    dropdownBtn.disabled = this.options.disabled;
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    // Menu
    this.menu = document.createElement('div');
    this.menu.className = 'split-button-menu';

    this.options.menuItems.forEach(item => {
      const menuItem = document.createElement('button');
      menuItem.className = 'split-button-menu-item';
      menuItem.textContent = item.text;

      if (item.icon) {
        const icon = document.createElement('span');
        icon.className = 'split-menu-icon';
        icon.textContent = item.icon;
        menuItem.prepend(icon);
      }

      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.onClick) {
          item.onClick(e);
        }
        if (this.options.onMenuSelect) {
          this.options.onMenuSelect(item);
        }
        this.closeMenu();
      });

      this.menu.appendChild(menuItem);
    });

    this.element.appendChild(mainBtn);
    this.element.appendChild(dropdownBtn);
    this.element.appendChild(this.menu);

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target)) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.isOpen = true;
    this.menu.classList.add('open');
  }

  closeMenu() {
    this.isOpen = false;
    this.menu.classList.remove('open');
  }

  render() {
    return this.element;
  }
}

// ==================== EXPORTS ====================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Button, ButtonGroup, SplitButton };
}

if (typeof window !== 'undefined') {
  window.Button = Button;
  window.ButtonGroup = ButtonGroup;
  window.SplitButton = SplitButton;
}
