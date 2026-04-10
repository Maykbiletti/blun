class SearchBar extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.debounceTimer = null;
        this.isOpen = false;
        this.results = [];
        this.selectedIndex = -1;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    position: relative;
                    display: block;
                    width: 100%;
                    max-width: 400px;
                }

                .search-container {
                    position: relative;
                }

                .search-input {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 14px;
                    background: white;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }

                .search-input:focus {
                    outline: none;
                    border-color: #2563eb;
                }

                .search-input::placeholder {
                    color: #6b7280;
                }

                .results-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: white;
                    border: 1px solid #e1e5e9;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    max-height: 300px;
                    overflow-y: auto;
                    z-index: 1000;
                    margin-top: 4px;
                    display: none;
                }

                .results-dropdown.open {
                    display: block;
                }

                .result-item {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f3f4f6;
                    cursor: pointer;
                    transition: background-color 0.15s;
                }

                .result-item:last-child {
                    border-bottom: none;
                }

                .result-item:hover,
                .result-item.selected {
                    background-color: #f8fafc;
                }

                .result-item.selected {
                    background-color: #eff6ff;
                }

                .result-title {
                    font-weight: 500;
                    color: #1f2937;
                    margin-bottom: 4px;
                }

                .result-description {
                    font-size: 12px;
                    color: #6b7280;
                }

                .no-results {
                    padding: 16px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 14px;
                }

                .loading {
                    padding: 16px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 14px;
                }
            </style>

            <div class="search-container">
                <input
                    type="text"
                    class="search-input"
                    placeholder="Search..."
                    autocomplete="off"
                >
                <div class="results-dropdown">
                    <div class="loading">Searching...</div>
                </div>
            </div>
        `;

        this.input = this.shadowRoot.querySelector('.search-input');
        this.dropdown = this.shadowRoot.querySelector('.results-dropdown');

        this.bindEvents();
    }

    bindEvents() {
        this.input.addEventListener('input', this.handleInput.bind(this));
        this.input.addEventListener('keydown', this.handleKeydown.bind(this));
        this.input.addEventListener('focus', this.handleFocus.bind(this));
        document.addEventListener('click', this.handleDocumentClick.bind(this));
        this.dropdown.addEventListener('click', this.handleResultClick.bind(this));
    }

    handleInput(e) {
        const query = e.target.value.trim();

        clearTimeout(this.debounceTimer);

        if (query.length === 0) {
            this.closeDropdown();
            return;
        }

        this.showLoading();

        this.debounceTimer = setTimeout(() => {
            this.search(query);
        }, 300);
    }

    handleKeydown(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateResults(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateResults(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectResult(this.results[this.selectedIndex]);
                }
                break;
            case 'Escape':
                this.closeDropdown();
                break;
        }
    }

    handleFocus() {
        if (this.results.length > 0) {
            this.openDropdown();
        }
    }

    handleDocumentClick(e) {
        if (!this.contains(e.target)) {
            this.closeDropdown();
        }
    }

    handleResultClick(e) {
        const resultItem = e.target.closest('.result-item');
        if (resultItem) {
            const index = parseInt(resultItem.dataset.index);
            this.selectResult(this.results[index]);
        }
    }

    async search(query) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            this.results = data.results || [];
            this.selectedIndex = -1;
            this.renderResults();
            this.openDropdown();

            this.dispatchEvent(new CustomEvent('search', {
                detail: { query, results: this.results }
            }));

        } catch (error) {
            console.error('Search error:', error);
            this.showError();
        }
    }

    showLoading() {
        this.dropdown.innerHTML = '<div class="loading">Searching...</div>';
        this.openDropdown();
    }

    showError() {
        this.dropdown.innerHTML = '<div class="no-results">Search error. Please try again.</div>';
        this.openDropdown();
    }

    renderResults() {
        if (this.results.length === 0) {
            this.dropdown.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }

        const html = this.results.map((result, index) => `
            <div class="result-item" data-index="${index}">
                <div class="result-title">${this.escapeHtml(result.title)}</div>
                <div class="result-description">${this.escapeHtml(result.description || '')}</div>
            </div>
        `).join('');

        this.dropdown.innerHTML = html;
    }

    navigateResults(direction) {
        const newIndex = this.selectedIndex + direction;

        if (newIndex >= 0 && newIndex < this.results.length) {
            this.selectedIndex = newIndex;
        } else if (newIndex < 0) {
            this.selectedIndex = this.results.length - 1;
        } else {
            this.selectedIndex = 0;
        }

        this.updateSelection();
    }

    updateSelection() {
        const items = this.dropdown.querySelectorAll('.result-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
    }

    selectResult(result) {
        this.input.value = result.title;
        this.closeDropdown();

        this.dispatchEvent(new CustomEvent('select', {
            detail: { result }
        }));
    }

    openDropdown() {
        this.isOpen = true;
        this.dropdown.classList.add('open');
    }

    closeDropdown() {
        this.isOpen = false;
        this.dropdown.classList.remove('open');
        this.selectedIndex = -1;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    get value() {
        return this.input.value;
    }

    set value(val) {
        this.input.value = val;
    }

    clear() {
        this.input.value = '';
        this.closeDropdown();
        this.results = [];
    }

    focus() {
        this.input.focus();
    }
}

customElements.define('search-bar', SearchBar);