/**
<<<<<<< Updated upstream
 * Modal Dialog Component
 * Backdrop, Close Button, Responsive, Keyboard Navigation
 * Features: Escape to close, Focus trap, ARIA-compliant
 */

// Global Modal State
let modalState = {
  isOpen: false,
  currentModal: null,
  previouslyFocused: null,
  focusableElements: []
};

/**
 * Render Modal HTML
 * @param {Object} config - Modal configuration
 * @returns {string} Modal HTML
 */
function renderModal(config = {}) {
  const {
    id = 'modal-dialog',
    title = 'Dialog',
    content = '',
    actions = [],
    size = 'md' // sm, md, lg, xl
  } = config;

  const actionButtons = actions.map(action => `
    <button
      class="modal-button modal-button--${action.variant || 'secondary'}"
      data-action="${action.id || 'dismiss'}"
      aria-label="${action.label}"
    >
      ${action.label}
    </button>
  `).join('');

  return `
    <div
      id="${id}"
      class="modal-dialog modal-dialog--${size}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${id}-title"
      aria-hidden="true"
      tabindex="-1"
    >
      <!-- Backdrop -->
      <div class="modal-backdrop" data-backdrop></div>

      <!-- Modal Container -->
      <div class="modal-content">
        <!-- Header -->
        <div class="modal-header">
          <h2 id="${id}-title" class="modal-title">${title}</h2>
          <button
            class="modal-close"
            aria-label="Close dialog"
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          ${content}
        </div>

        <!-- Footer (Actions) -->
        ${actionButtons ? `
          <div class="modal-footer">
            ${actionButtons}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Initialize Modal Component
 * @param {string} modalId - Modal element ID
 * @param {Object} handlers - Event handlers
 */
function initModal(modalId = 'modal-dialog', handlers = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // Store references
  const backdrop = modal.querySelector('[data-backdrop]');
  const closeBtn = modal.querySelector('.modal-close');
  const actionButtons = modal.querySelectorAll('.modal-button');

  // Get focusable elements
  const focusableSelectors = [
    'a[href]',
    'button:not(:disabled)',
    'textarea:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])'
  ];
  const focusableElements = modal.querySelectorAll(focusableSelectors.join(','));

  // Close Modal Function
  function closeModal() {
    modal.classList.remove('modal-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Restore focus
    if (modalState.previouslyFocused) {
      modalState.previouslyFocused.focus();
    }

    // Remove event listeners
    removeModalListeners();

    // Update state
    modalState.isOpen = false;
    modalState.currentModal = null;
    modalState.focusableElements = [];

    // Call close handler
    if (handlers.onClose) handlers.onClose();
  }

  // Open Modal Function
  function openModal() {
    // Store previously focused element
    modalState.previouslyFocused = document.activeElement;

    // Show modal
    modal.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first focusable element
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Store state
    modalState.isOpen = true;
    modalState.currentModal = modal;
    modalState.focusableElements = Array.from(focusableElements);

    // Attach event listeners
    attachModalListeners();

    // Call open handler
    if (handlers.onOpen) handlers.onOpen();
  }

  // Event Listeners
  function attachModalListeners() {
    // Close button
    closeBtn?.addEventListener('click', closeModal);

    // Backdrop click
    backdrop?.addEventListener('click', closeModal);

    // Action buttons
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.closest('.modal-button').dataset.action;
        if (handlers[`on${capitalize(action)}`]) {
          handlers[`on${capitalize(action)}`]();
        }
        closeModal();
      });
    });

    // Keyboard navigation
    modal.addEventListener('keydown', handleKeyDown);
  }

  function removeModalListeners() {
    closeBtn?.removeEventListener('click', closeModal);
    backdrop?.removeEventListener('click', closeModal);
    actionButtons.forEach(btn => {
      btn.removeEventListener('click', handleButtonClick);
    });
    modal.removeEventListener('keydown', handleKeyDown);
  }

  // Keyboard Handler
  function handleKeyDown(e) {
    // Escape to close
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }

    // Tab focus trap
    if (e.key === 'Tab') {
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      // Shift+Tab at first element → focus last
      if (e.shiftKey && activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      }

      // Tab at last element → focus first
      if (!e.shiftKey && activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  }

  function handleButtonClick(e) {
    const action = e.target.dataset.action;
    if (handlers[`on${capitalize(action)}`]) {
      handlers[`on${capitalize(action)}`]();
    }
  }

  // Public API
  return {
    open: openModal,
    close: closeModal,
    isOpen: () => modalState.isOpen,
    getModal: () => modal
  };
}

/**
 * Create and Open Modal Shortcut
 * @param {Object} config - Modal config
 * @param {Object} handlers - Event handlers
 * @returns {Object} Modal API
 */
function createModal(config = {}, handlers = {}) {
  const modalId = config.id || `modal-${Date.now()}`;
  const html = renderModal({ ...config, id: modalId });

  // Create container if doesn't exist
  let container = document.getElementById('modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'modal-container';
    document.body.appendChild(container);
  }

  // Append modal
  container.insertAdjacentHTML('beforeend', html);

  // Initialize and return API
  const api = initModal(modalId, handlers);
  api.destroy = () => document.getElementById(modalId)?.remove();

  return api;
}

/**
 * Helper: Capitalize string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderModal,
    initModal,
    createModal,
    modalState
  };
}
=======
 * BLUN Modal Dialog Component
 * Responsive Modal mit Backdrop, Close Button & Keyboard Navigation
 * @author Petra - Frontend Team
 * Features: Focus Trap, ARIA-compliant, iOS Safari optimiert, Touch-friendly
 */

// Modal State Management
let currentModal = null;
let modalStack = [];
let focusBeforeModal = null;

// Modal Configuration
const MODAL_CONFIG = {
    animation: {
        enter: 'modal-enter',
        leave: 'modal-leave',
        duration: 300
    },
    zIndex: {
        backdrop: 1000,
        modal: 1001
    },
    breakpoints: {
        mobile: 375,
        tablet: 768,
        desktop: 1024,
        large: 1280
    }
};

/**
 * Erstelle Modal Dialog
 */
function createModal(options = {}) {
    const config = {
        title: options.title || '',
        content: options.content || '',
        size: options.size || 'medium', // small, medium, large, fullscreen
        closable: options.closable !== false,
        closeOnBackdrop: options.closeOnBackdrop !== false,
        closeOnEsc: options.closeOnEsc !== false,
        buttons: options.buttons || [],
        className: options.className || '',
        onOpen: options.onOpen || null,
        onClose: options.onClose || null,
        onConfirm: options.onConfirm || null,
        onCancel: options.onCancel || null
    };

    return new Modal(config);
}

/**
 * Modal Class
 */
class Modal {
    constructor(config) {
        this.config = config;
        this.isOpen = false;
        this.element = null;
        this.backdrop = null;
        this.focusTrap = null;

        this.create();
        this.bindEvents();
    }

    create() {
        // Backdrop erstellen
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'modal-backdrop';
        this.backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: ${MODAL_CONFIG.zIndex.backdrop};
            opacity: 0;
            transition: opacity ${MODAL_CONFIG.animation.duration}ms ease;
            -webkit-overflow-scrolling: touch;
        `;

        // Modal Container erstellen
        this.element = document.createElement('div');
        this.element.className = `modal modal--${this.config.size} ${this.config.className}`;
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-modal', 'true');
        this.element.setAttribute('tabindex', '-1');

        if (this.config.title) {
            this.element.setAttribute('aria-labelledby', 'modal-title');
        }

        // Modal Styles - Mobile First & iOS optimiert
        this.element.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.9);
            z-index: ${MODAL_CONFIG.zIndex.modal};
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-height: 90vh;
            overflow: hidden;
            opacity: 0;
            transition: all ${MODAL_CONFIG.animation.duration}ms ease;
            width: 90%;
            max-width: ${this.getSizeWidth()};
            /* iOS Safari Safe Area */
            padding-bottom: env(safe-area-inset-bottom);
            /* iOS Safari Scroll Fix */
            -webkit-overflow-scrolling: touch;
        `;

        // Responsive Anpassungen
        this.applyResponsiveStyles();

        // Modal Content erstellen
        this.element.innerHTML = this.renderModal();

        // Focus Trap Setup
        this.setupFocusTrap();
    }

    getSizeWidth() {
        const sizes = {
            small: '400px',
            medium: '600px',
            large: '800px',
            fullscreen: '95vw'
        };
        return sizes[this.config.size] || sizes.medium;
    }

    applyResponsiveStyles() {
        const isMobile = window.innerWidth < MODAL_CONFIG.breakpoints.tablet;

        if (isMobile) {
            // Mobile: Fullscreen-ähnlich
            this.element.style.width = '95%';
            this.element.style.maxWidth = 'none';
            this.element.style.maxHeight = '95vh';
            this.element.style.margin = '0 auto';
        } else {
            // Desktop: Zentriert
            this.element.style.width = '90%';
            this.element.style.maxWidth = this.getSizeWidth();
            this.element.style.maxHeight = '90vh';
        }
    }

    renderModal() {
        return `
            <div class="modal__content">
                ${this.renderHeader()}
                ${this.renderBody()}
                ${this.renderFooter()}
            </div>
        `;
    }

    renderHeader() {
        if (!this.config.title && !this.config.closable) return '';

        return `
            <div class="modal__header" style="
                padding: 24px 24px 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 60px;
                flex-shrink: 0;
            ">
                ${this.config.title ? `
                    <h2 id="modal-title" class="modal__title" style="
                        margin: 0;
                        font-size: 1.5rem;
                        font-weight: 600;
                        color: #111827;
                        line-height: 1.4;
                        flex: 1;
                        padding-right: 12px;
                    ">${this.escapeHtml(this.config.title)}</h2>
                ` : '<div style="flex: 1;"></div>'}

                ${this.config.closable ? `
                    <button
                        class="modal__close"
                        type="button"
                        aria-label="Modal schließen"
                        style="
                            background: none;
                            border: none;
                            padding: 12px;
                            margin: -12px;
                            cursor: pointer;
                            color: #6b7280;
                            border-radius: 8px;
                            transition: all 0.2s ease;
                            min-width: 44px;
                            min-height: 44px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-shrink: 0;
                            /* Touch optimiert */
                            -webkit-tap-highlight-color: transparent;
                        "
                        onmouseover="this.style.backgroundColor='#f3f4f6'; this.style.color='#374151'"
                        onmouseout="this.style.backgroundColor='transparent'; this.style.color='#6b7280'"
                        onfocus="this.style.outline='2px solid #3b82f6'; this.style.outlineOffset='2px'"
                        onblur="this.style.outline='none'"
                        ontouchstart="this.style.backgroundColor='#f3f4f6'"
                        ontouchend="this.style.backgroundColor='transparent'"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;
    }

    renderBody() {
        return `
            <div class="modal__body" style="
                padding: 24px;
                flex: 1;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                max-height: calc(90vh - 160px);
                /* iOS Safari Scroll Fix */
                position: relative;
                z-index: 1;
            ">
                ${this.config.content}
            </div>
        `;
    }

    renderFooter() {
        if (!this.config.buttons || this.config.buttons.length === 0) return '';

        const isMobile = window.innerWidth < MODAL_CONFIG.breakpoints.tablet;

        const buttonsHtml = this.config.buttons.map(button => `
            <button
                type="button"
                class="modal__button modal__button--${button.variant || 'secondary'}"
                data-action="${button.action || ''}"
                style="
                    padding: 14px 24px;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    min-width: 44px;
                    min-height: 44px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 1px solid;
                    flex: ${isMobile ? '1' : 'none'};
                    /* Touch optimiert */
                    -webkit-tap-highlight-color: transparent;
                    ${button.variant === 'primary' ? `
                        background-color: #3b82f6;
                        color: white;
                        border-color: #3b82f6;
                    ` : `
                        background-color: white;
                        color: #374151;
                        border-color: #d1d5db;
                    `}
                "
                onmouseover="
                    if ('${button.variant}' !== 'primary') {
                        this.style.backgroundColor = '#f9fafb';
                        this.style.borderColor = '#9ca3af';
                    } else {
                        this.style.backgroundColor = '#2563eb';
                    }
                "
                onmouseout="
                    if ('${button.variant}' !== 'primary') {
                        this.style.backgroundColor = 'white';
                        this.style.borderColor = '#d1d5db';
                    } else {
                        this.style.backgroundColor = '#3b82f6';
                    }
                "
                onfocus="this.style.outline='2px solid #3b82f6'; this.style.outlineOffset='2px'"
                onblur="this.style.outline='none'"
                ontouchstart="
                    if ('${button.variant}' !== 'primary') {
                        this.style.backgroundColor = '#f3f4f6';
                    } else {
                        this.style.backgroundColor = '#1d4ed8';
                    }
                "
                ontouchend="
                    if ('${button.variant}' !== 'primary') {
                        this.style.backgroundColor = 'white';
                    } else {
                        this.style.backgroundColor = '#3b82f6';
                    }
                "
            >
                ${this.escapeHtml(button.text)}
            </button>
        `).join('');

        return `
            <div class="modal__footer" style="
                padding: 0 24px 24px;
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                flex-wrap: ${isMobile ? 'wrap' : 'nowrap'};
                flex-shrink: 0;
            ">
                ${buttonsHtml}
            </div>
        `;
    }

    bindEvents() {
        // Close Button Event
        this.element.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal__close') || e.target.closest('.modal__close')) {
                this.close();
            }
        });

        // Button Events
        this.element.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal__button')) {
                const action = e.target.dataset.action;
                this.handleButtonClick(action, e);
            }
        });

        // Backdrop Click
        if (this.config.closeOnBackdrop) {
            this.backdrop.addEventListener('click', () => {
                this.close();
            });
        }

        // Touch Events für bessere Mobile UX
        this.element.addEventListener('touchstart', (e) => {
            // Prevent iOS Safari bounce
            e.preventDefault();
        }, { passive: false });

        // Keyboard Events
        if (this.config.closeOnEsc) {
            this.keyHandler = this.handleKeyDown.bind(this);
            document.addEventListener('keydown', this.keyHandler);
        }

        // Responsive Events
        this.resizeHandler = this.handleResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('orientationchange', this.resizeHandler);
    }

    handleButtonClick(action, event) {
        const button = this.config.buttons.find(b => b.action === action);

        if (button && button.onClick) {
            const result = button.onClick(event, this);
            if (result !== false) {
                this.close();
            }
        } else {
            // Standard Actions
            switch(action) {
                case 'confirm':
                    if (this.config.onConfirm) {
                        const result = this.config.onConfirm(this);
                        if (result !== false) this.close();
                    } else {
                        this.close();
                    }
                    break;
                case 'cancel':
                    if (this.config.onCancel) {
                        this.config.onCancel(this);
                    }
                    this.close();
                    break;
                default:
                    this.close();
            }
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Escape' && this.isOpen) {
            event.preventDefault();
            this.close();
        }

        // Focus Trap
        if (event.key === 'Tab') {
            this.trapFocus(event);
        }
    }

    handleResize() {
        if (!this.isOpen) return;

        // Responsive Anpassungen
        this.applyResponsiveStyles();

        // iOS Safari Viewport Fix
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setupFocusTrap() {
        const focusableElements = this.element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        this.focusableElements = Array.from(focusableElements);
        this.firstFocusable = this.focusableElements[0];
        this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
    }

    trapFocus(event) {
        if (event.shiftKey) {
            if (document.activeElement === this.firstFocusable) {
                event.preventDefault();
                this.lastFocusable.focus();
            }
        } else {
            if (document.activeElement === this.lastFocusable) {
                event.preventDefault();
                this.firstFocusable.focus();
            }
        }
    }

    open() {
        if (this.isOpen) return;

        // Focus speichern
        focusBeforeModal = document.activeElement;

        // Modal Stack
        if (currentModal) {
            modalStack.push(currentModal);
        }
        currentModal = this;

        // Body Scroll verhindern (iOS Safari Fix)
        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.paddingRight = this.getScrollbarWidth() + 'px';

        // DOM hinzufügen
        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.element);

        // iOS Safari Viewport Fix
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);

        // Animation
        requestAnimationFrame(() => {
            this.backdrop.style.opacity = '1';
            this.element.style.opacity = '1';
            this.element.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        this.isOpen = true;

        // Focus setzen
        setTimeout(() => {
            if (this.firstFocusable) {
                this.firstFocusable.focus();
            } else {
                this.element.focus();
            }
        }, MODAL_CONFIG.animation.duration);

        // Callback
        if (this.config.onOpen) {
            this.config.onOpen(this);
        }

        return this;
    }

    close() {
        if (!this.isOpen) return;

        // Animation
        this.backdrop.style.opacity = '0';
        this.element.style.opacity = '0';
        this.element.style.transform = 'translate(-50%, -50%) scale(0.9)';

        setTimeout(() => {
            // DOM entfernen
            if (this.backdrop.parentNode) {
                this.backdrop.parentNode.removeChild(this.backdrop);
            }
            if (this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }

            // Modal Stack
            currentModal = modalStack.pop() || null;

            // Body Scroll wiederherstellen (iOS Safari Fix)
            if (!currentModal) {
                const scrollY = document.body.style.top;
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.width = '';
                document.body.style.paddingRight = '';
                if (scrollY) {
                    window.scrollTo(0, parseInt(scrollY || '0') * -1);
                }
            }

            // Focus wiederherstellen
            if (focusBeforeModal && !currentModal) {
                focusBeforeModal.focus();
                focusBeforeModal = null;
            }

        }, MODAL_CONFIG.animation.duration);

        this.isOpen = false;

        // Events entfernen
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('orientationchange', this.resizeHandler);
        }

        // Callback
        if (this.config.onClose) {
            this.config.onClose(this);
        }

        return this;
    }

    getScrollbarWidth() {
        const outer = document.createElement('div');
        outer.style.visibility = 'hidden';
        outer.style.width = '100px';
        outer.style.msOverflowStyle = 'scrollbar';
        document.body.appendChild(outer);

        const widthNoScroll = outer.offsetWidth;
        outer.style.overflow = 'scroll';

        const inner = document.createElement('div');
        inner.style.width = '100%';
        outer.appendChild(inner);

        const widthWithScroll = inner.offsetWidth;
        outer.parentNode.removeChild(outer);

        return widthNoScroll - widthWithScroll;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Utility Functions
const Modal = {
    /**
     * Einfacher Alert Dialog
     */
    alert(title, message, onConfirm) {
        return createModal({
            title: title,
            content: `<p style="margin: 0; color: #374151; line-height: 1.6;">${message}</p>`,
            size: 'small',
            buttons: [{
                text: 'OK',
                variant: 'primary',
                action: 'confirm',
                onClick: onConfirm
            }]
        }).open();
    },

    /**
     * Confirm Dialog
     */
    confirm(title, message, onConfirm, onCancel) {
        return createModal({
            title: title,
            content: `<p style="margin: 0; color: #374151; line-height: 1.6;">${message}</p>`,
            size: 'small',
            buttons: [
                {
                    text: 'Abbrechen',
                    variant: 'secondary',
                    action: 'cancel',
                    onClick: onCancel
                },
                {
                    text: 'Bestätigen',
                    variant: 'primary',
                    action: 'confirm',
                    onClick: onConfirm
                }
            ]
        }).open();
    },

    /**
     * Eingabe Dialog
     */
    prompt(title, placeholder = '', onConfirm, onCancel) {
        const inputId = 'modal-input-' + Date.now();

        return createModal({
            title: title,
            content: `
                <div style="margin-bottom: 16px;">
                    <input
                        id="${inputId}"
                        type="text"
                        placeholder="${placeholder}"
                        style="
                            width: 100%;
                            padding: 12px 16px;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            font-size: 14px;
                            line-height: 1.5;
                            outline: none;
                            transition: border-color 0.2s ease;
                        "
                        onfocus="this.style.borderColor='#3b82f6'"
                        onblur="this.style.borderColor='#d1d5db'"
                    />
                </div>
            `,
            size: 'small',
            buttons: [
                {
                    text: 'Abbrechen',
                    variant: 'secondary',
                    action: 'cancel',
                    onClick: onCancel
                },
                {
                    text: 'OK',
                    variant: 'primary',
                    action: 'confirm',
                    onClick: () => {
                        const input = document.getElementById(inputId);
                        const value = input ? input.value : '';
                        if (onConfirm) {
                            return onConfirm(value);
                        }
                    }
                }
            ]
        }).open();
    },

    /**
     * Custom Modal
     */
    create: createModal,

    /**
     * Alle Modals schließen
     */
    closeAll() {
        while (currentModal) {
            currentModal.close();
        }
    }
};

// Global verfügbar machen
window.Modal = Modal;
window.createModal = createModal;

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Modal, createModal };
}
>>>>>>> Stashed changes
