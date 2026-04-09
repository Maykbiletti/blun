/**
 * Global Keyboard Shortcuts Handler
 * Ctrl+K: Command Palette öffnen
 * Ctrl+/: Hilfe-Modal öffnen
 * Escape: Alle Modals schließen
 */

class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.activeModals = new Set();
        this.init();
    }

    init() {
        // Global keydown listener
        document.addEventListener('keydown', (e) => this.handleKeydown(e));

        // Track modals
        this.trackModals();

        // Register shortcuts
        this.registerShortcuts();
    }

    registerShortcuts() {
        // Ctrl+K: Command Palette
        this.shortcuts.set('ctrl+k', {
            handler: () => this.openCommandPalette(),
            description: 'Command Palette öffnen'
        });

        // Ctrl+/: Hilfe-Modal
        this.shortcuts.set('ctrl+/', {
            handler: () => this.openHelpModal(),
            description: 'Hilfe-Modal öffnen'
        });

        // Escape: Alle Modals schließen
        this.shortcuts.set('escape', {
            handler: () => this.closeAllModals(),
            description: 'Alle Modals schließen'
        });
    }

    handleKeydown(e) {
        // Ignore shortcuts when typing in input fields
        if (this.isInputActive()) {
            // Nur Escape erlauben
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
            return;
        }

        const shortcutKey = this.getShortcutKey(e);
        const shortcut = this.shortcuts.get(shortcutKey);

        if (shortcut) {
            e.preventDefault();
            shortcut.handler();
        }
    }

    getShortcutKey(e) {
        const parts = [];

        if (e.ctrlKey) parts.push('ctrl');
        if (e.metaKey) parts.push('cmd');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');

        const key = e.key.toLowerCase();
        parts.push(key);

        return parts.join('+');
    }

    isInputActive() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true' ||
            activeElement.isContentEditable
        );
    }

    // Command Palette öffnen
    openCommandPalette() {
        // Check if command palette exists
        let palette = document.getElementById('command-palette');

        if (!palette) {
            palette = this.createCommandPalette();
            document.body.appendChild(palette);
        }

        palette.classList.add('active');
        this.activeModals.add('command-palette');

        // Focus search input
        const searchInput = palette.querySelector('.command-search');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    createCommandPalette() {
        const palette = document.createElement('div');
        palette.id = 'command-palette';
        palette.className = 'command-palette-overlay';

        palette.innerHTML = `
            <div class="command-palette-modal">
                <div class="command-search-container">
                    <input type="text"
                           class="command-search"
                           placeholder="Suche Commands... (Ctrl+K)"
                           autocomplete="off">
                </div>
                <div class="command-results">
                    <div class="command-item" data-action="agents">
                        <span class="command-icon">🤖</span>
                        <span class="command-text">Agents verwalten</span>
                        <span class="command-shortcut">A</span>
                    </div>
                    <div class="command-item" data-action="upload">
                        <span class="command-icon">📤</span>
                        <span class="command-text">Datei hochladen</span>
                        <span class="command-shortcut">U</span>
                    </div>
                    <div class="command-item" data-action="help">
                        <span class="command-icon">❓</span>
                        <span class="command-text">Hilfe anzeigen</span>
                        <span class="command-shortcut">?</span>
                    </div>
                </div>
            </div>
        `;

        // Event listeners für Command Palette
        const searchInput = palette.querySelector('.command-search');
        const results = palette.querySelector('.command-results');

        searchInput.addEventListener('input', (e) => this.filterCommands(e.target.value, results));
        results.addEventListener('click', (e) => this.executeCommand(e));

        return palette;
    }

    filterCommands(query, container) {
        const items = container.querySelectorAll('.command-item');
        const lowercaseQuery = query.toLowerCase();

        items.forEach(item => {
            const text = item.querySelector('.command-text').textContent.toLowerCase();
            const matches = text.includes(lowercaseQuery);
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    executeCommand(e) {
        const item = e.target.closest('.command-item');
        if (!item) return;

        const action = item.dataset.action;

        // Close command palette first
        this.closeModal('command-palette');

        // Execute command
        switch (action) {
            case 'agents':
                this.navigateToAgents();
                break;
            case 'upload':
                this.openFileUpload();
                break;
            case 'help':
                this.openHelpModal();
                break;
        }
    }

    // Hilfe-Modal öffnen
    openHelpModal() {
        let helpModal = document.getElementById('help-modal');

        if (!helpModal) {
            helpModal = this.createHelpModal();
            document.body.appendChild(helpModal);
        }

        helpModal.classList.add('active');
        this.activeModals.add('help-modal');
    }

    createHelpModal() {
        const modal = document.createElement('div');
        modal.id = 'help-modal';
        modal.className = 'help-modal-overlay';

        modal.innerHTML = `
            <div class="help-modal-content">
                <div class="help-modal-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button class="help-modal-close" aria-label="Schließen">&times;</button>
                </div>
                <div class="help-modal-body">
                    <div class="shortcut-group">
                        <h3>Navigation</h3>
                        <div class="shortcut-item">
                            <kbd>Ctrl</kbd> + <kbd>K</kbd>
                            <span>Command Palette öffnen</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>Ctrl</kbd> + <kbd>/</kbd>
                            <span>Diese Hilfe anzeigen</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>Escape</kbd>
                            <span>Modals schließen</span>
                        </div>
                    </div>
                    <div class="shortcut-group">
                        <h3>Dashboard</h3>
                        <div class="shortcut-item">
                            <kbd>A</kbd>
                            <span>Agents-Übersicht</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>U</kbd>
                            <span>Datei hochladen</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>R</kbd>
                            <span>Seite aktualisieren</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Close button event
        const closeBtn = modal.querySelector('.help-modal-close');
        closeBtn.addEventListener('click', () => this.closeModal('help-modal'));

        return modal;
    }

    // Modal tracking
    trackModals() {
        // Observer für neue Modals
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && this.isModal(node)) {
                        this.activeModals.add(node.id || node.className);
                    }
                });

                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === 1 && this.isModal(node)) {
                        this.activeModals.delete(node.id || node.className);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    isModal(element) {
        return element.classList && (
            element.classList.contains('modal') ||
            element.classList.contains('overlay') ||
            element.classList.contains('popup') ||
            element.id?.includes('modal') ||
            element.id?.includes('palette')
        );
    }

    // Alle Modals schließen
    closeAllModals() {
        // Close known modals
        this.closeModal('command-palette');
        this.closeModal('help-modal');

        // Close any other modals
        document.querySelectorAll('.modal.active, .overlay.active, .popup.active').forEach(modal => {
            modal.classList.remove('active');
        });

        this.activeModals.clear();
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            this.activeModals.delete(modalId);
        }
    }

    // Command actions
    navigateToAgents() {
        // Scroll to agents section or switch view
        const agentsSection = document.getElementById('agents-section');
        if (agentsSection) {
            agentsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    openFileUpload() {
        // Trigger file upload
        const fileInput = document.getElementById('file-upload');
        if (fileInput) {
            fileInput.click();
        }
    }

    // Public API
    addShortcut(key, handler, description) {
        this.shortcuts.set(key, { handler, description });
    }

    removeShortcut(key) {
        this.shortcuts.delete(key);
    }

    getActiveModals() {
        return Array.from(this.activeModals);
    }
}

// Initialize global keyboard shortcuts
const keyboardShortcuts = new KeyboardShortcuts();

// Export für andere Module
window.KeyboardShortcuts = KeyboardShortcuts;
window.keyboardShortcuts = keyboardShortcuts;