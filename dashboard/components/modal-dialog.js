/**
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
