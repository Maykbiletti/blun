/**
 * Generic Modal System
 * Usage: window.modalManager.open(config)
 * Features: Focus-trap, backdrop-click, ESC key, accessibility
 */

class ModalManager {
    constructor() {
        this.currentModal = null;
        this.previousFocusElement = null;
        this.focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        this.init();
    }

    init() {
        this.createContainer();
        this.bindGlobalEvents();
    }

    createContainer() {
        if (document.getElementById('modal-container')) return;

        const container = document.createElement('div');
        container.id = 'modal-container';
        container.className = 'modal-container';
        container.innerHTML = `
            <div class="modal-backdrop" data-modal-backdrop></div>
            <div class="modal-wrapper" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title" id="modal-title"></h2>
                        <button class="modal-close" data-modal-close aria-label="Modal schließen">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer"></div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        this.container = container;
        this.wrapper = container.querySelector('.modal-wrapper');
        this.backdrop = container.querySelector('.modal-backdrop');
        this.content = container.querySelector('.modal-content');
        this.title = container.querySelector('.modal-title');
        this.body = container.querySelector('.modal-body');
        this.footer = container.querySelector('.modal-footer');
    }

    bindGlobalEvents() {
        // ESC Key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.close();
            }
        });

        // Backdrop Click
        this.container.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-modal-backdrop')) {
                this.close();
            }
        });

        // Close Button Click
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('[data-modal-close]')) {
                this.close();
            }
        });

        // Focus Trap
        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && this.currentModal) {
                this.handleFocusTrap(e);
            }
        });
    }

    open(config = {}) {
        const {
            title = 'Modal',
            content = '',
            footer = '',
            size = 'medium',
            closeOnBackdrop = true,
            closeOnEsc = true,
            onOpen = null,
            onClose = null
        } = config;

        // Store previous focus
        this.previousFocusElement = document.activeElement;

        // Set content
        this.title.textContent = title;
        this.body.innerHTML = content;
        this.footer.innerHTML = footer;

        // Set size class
        this.content.className = `modal-content modal-${size}`;

        // Store config
        this.currentModal = {
            ...config,
            closeOnBackdrop,
            closeOnEsc,
            onClose
        };

        // Show modal
        this.container.classList.add('modal-active');
        this.wrapper.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Focus first focusable element
        setTimeout(() => {
            this.focusFirstElement();
        }, 100);

        // Callback
        if (onOpen) onOpen();

        return this;
    }

    close() {
        if (!this.currentModal) return;

        const { onClose } = this.currentModal;

        // Hide modal
        this.container.classList.remove('modal-active');
        this.wrapper.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // Restore focus
        if (this.previousFocusElement) {
            this.previousFocusElement.focus();
            this.previousFocusElement = null;
        }

        // Clean up
        this.currentModal = null;

        // Callback
        if (onClose) onClose();

        return this;
    }

    focusFirstElement() {
        const focusableElements = this.getFocusableElements();
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    getFocusableElements() {
        return Array.from(this.content.querySelectorAll(this.focusableSelectors))
            .filter(el => !el.disabled && el.offsetWidth > 0 && el.offsetHeight > 0);
    }

    handleFocusTrap(e) {
        const focusableElements = this.getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    // Utility methods
    confirm(message, title = 'Bestätigung') {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p class="modal-confirm-message">${message}</p>`,
                footer: `
                    <div class="modal-actions">
                        <button class="btn btn-secondary" data-modal-cancel>Abbrechen</button>
                        <button class="btn btn-primary" data-modal-confirm>Bestätigen</button>
                    </div>
                `,
                size: 'small',
                onOpen: () => {
                    this.container.querySelector('[data-modal-confirm]').addEventListener('click', () => {
                        this.close();
                        resolve(true);
                    });
                    this.container.querySelector('[data-modal-cancel]').addEventListener('click', () => {
                        this.close();
                        resolve(false);
                    });
                }
            });
        });
    }

    alert(message, title = 'Information') {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p class="modal-alert-message">${message}</p>`,
                footer: `
                    <div class="modal-actions">
                        <button class="btn btn-primary" data-modal-ok>OK</button>
                    </div>
                `,
                size: 'small',
                onOpen: () => {
                    this.container.querySelector('[data-modal-ok]').addEventListener('click', () => {
                        this.close();
                        resolve();
                    });
                }
            });
        });
    }
}

// CSS Styles
const modalStyles = `
.modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
}

.modal-container.modal-active {
    pointer-events: auto;
    opacity: 1;
}

.modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
}

.modal-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    transform: scale(0.9) translateY(-20px);
    transition: transform 0.2s ease-in-out;
}

.modal-container.modal-active .modal-wrapper {
    transform: scale(1) translateY(0);
}

.modal-content {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    max-height: calc(100vh - 40px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
}

/* Modal Sizes */
.modal-small {
    width: 100%;
    max-width: 400px;
}

.modal-medium {
    width: 100%;
    max-width: 600px;
}

.modal-large {
    width: 100%;
    max-width: 800px;
}

.modal-fullscreen {
    width: 100%;
    max-width: 95vw;
    height: 95vh;
}

.modal-header {
    padding: 24px 24px 0 24px;
    display: flex;
    align-items: center;
    justify-content: between;
    border-bottom: 1px solid #e5e7eb;
    min-height: 60px;
}

.modal-title {
    font-size: 20px;
    font-weight: 600;
    color: #111827;
    margin: 0;
    flex: 1;
}

.modal-close {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: #6b7280;
    border-radius: 6px;
    margin-left: 16px;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-close:hover {
    background: #f3f4f6;
    color: #374151;
}

.modal-close:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

.modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
}

.modal-footer {
    padding: 0 24px 24px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    min-height: 60px;
    align-items: center;
}

.modal-footer:empty {
    display: none;
}

.modal-actions {
    display: flex;
    gap: 12px;
    width: 100%;
    justify-content: flex-end;
}

.modal-confirm-message,
.modal-alert-message {
    font-size: 16px;
    line-height: 1.5;
    color: #374151;
    margin: 0;
}

/* Button Styles */
.btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.btn-primary {
    background: #3b82f6;
    color: white;
}

.btn-primary:hover {
    background: #2563eb;
}

.btn-primary:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

.btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
}

.btn-secondary:hover {
    background: #e5e7eb;
}

.btn-secondary:focus {
    outline: 2px solid #6b7280;
    outline-offset: 2px;
}

/* Mobile Responsive */
@media (max-width: 640px) {
    .modal-wrapper {
        padding: 10px;
        align-items: flex-end;
    }

    .modal-content {
        border-radius: 12px 12px 0 0;
        max-height: 90vh;
    }

    .modal-small,
    .modal-medium,
    .modal-large {
        max-width: 100%;
    }

    .modal-header,
    .modal-body,
    .modal-footer {
        padding-left: 16px;
        padding-right: 16px;
    }

    .modal-actions {
        flex-direction: column-reverse;
    }

    .btn {
        width: 100%;
    }
}

/* Animation for mobile slide-up */
@media (max-width: 640px) {
    .modal-wrapper {
        transform: translateY(100%);
    }

    .modal-container.modal-active .modal-wrapper {
        transform: translateY(0);
    }
}
`;

// Add styles to document
if (!document.getElementById('modal-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'modal-styles';
    styleSheet.textContent = modalStyles;
    document.head.appendChild(styleSheet);
}

// Create global instance
window.modalManager = new ModalManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalManager;
}