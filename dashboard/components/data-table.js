/**
 * Data Table Component - Sortierbare Tabelle mit Pagination
 * Mobile-responsive, Accessibility-optimiert
 */

class DataTable {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.data = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.pageSize = options.pageSize || 10;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.columns = options.columns || [];
        this.emptyMessage = options.emptyMessage || 'Keine Daten verfügbar';
        this.loading = false;
        this.searchFields = options.searchFields || [];
        this.filterValue = '';

        this.init();
    }

    init() {
        this.container.className = 'data-table-container';
        this.container.innerHTML = `
            <div class="data-table-wrapper">
                <!-- Filter & Search -->
                <div class="data-table-filters">
                    <div class="data-table-search">
                        <input
                            type="text"
                            id="${this.container.id}-search"
                            class="data-table-search-input"
                            placeholder="Suchen..."
                            autocomplete="off"
                            aria-label="Tabelle durchsuchen"
                        >
                        <div class="data-table-search-icon" aria-hidden="true">🔍</div>
                    </div>
                    <div class="data-table-info">
                        <span id="${this.container.id}-info" class="data-table-result-count">
                            0 Einträge
                        </span>
                    </div>
                </div>

                <div class="data-table-scroll">
                    <table class="data-table" role="table" aria-label="Datentabelle">
                        <thead class="data-table-header">
                            ${this.renderHeader()}
                        </thead>
                        <tbody class="data-table-body">
                            ${this.renderLoadingSkeleton()}
                        </tbody>
                    </table>
                </div>
                <div class="data-table-pagination">
                    ${this.renderPagination()}
                </div>
            </div>
        `;

        this.attachEvents();
        this.addStyles();
    }

    renderHeader() {
        if (!this.columns.length) return '';

        return `
            <tr>
                ${this.columns.map(column => `
                    <th
                        class="data-table-th ${this.sortColumn === column.key ? 'sorted' : ''}"
                        data-column="${column.key}"
                        ${column.sortable !== false ? 'data-sortable="true"' : ''}
                        role="columnheader"
                        ${column.sortable !== false ? 'tabindex="0"' : ''}
                        ${column.sortable !== false ? `aria-sort="${this.getSortAriaLabel(column.key)}"` : ''}
                    >
                        <div class="data-table-th-content">
                            <span class="data-table-th-text">${column.label}</span>
                            ${column.sortable !== false ? `
                                <span class="data-table-sort-icon" aria-hidden="true">
                                    ${this.getSortIcon(column.key)}
                                </span>
                            ` : ''}
                        </div>
                    </th>
                `).join('')}
            </tr>
        `;
    }

    renderRows(data = this.getCurrentPageData()) {
        if (!data || data.length === 0) {
            return this.renderEmptyState();
        }

        return data.map((row, index) => `
            <tr class="data-table-row" data-row-index="${index}">
                ${this.columns.map(column => `
                    <td class="data-table-td" data-column="${column.key}">
                        <div class="data-table-cell">
                            ${this.formatCellValue(row[column.key], column, row)}
                        </div>
                    </td>
                `).join('')}
            </tr>
        `).join('');
    }

    renderLoadingSkeleton() {
        return Array(this.pageSize).fill(0).map((_, index) => `
            <tr class="data-table-skeleton-row" aria-hidden="true">
                ${this.columns.map(() => `
                    <td class="data-table-td">
                        <div class="data-table-skeleton-cell">
                            <div class="data-table-skeleton-line"></div>
                        </div>
                    </td>
                `).join('')}
            </tr>
        `).join('');
    }

    renderEmptyState() {
        if (this.loading) {
            return this.renderLoadingSkeleton();
        }

        const isFiltered = this.filterValue.trim() !== '';
        const message = isFiltered ? 'Keine Ergebnisse gefunden' : this.emptyMessage;
        const subtitle = isFiltered ?
            `Keine Einträge entsprechen dem Suchbegriff "${this.filterValue}"` :
            'Momentan sind keine Daten verfügbar';

        return `
            <tr class="data-table-empty">
                <td colspan="${this.columns.length}" class="data-table-empty-cell">
                    <div class="data-table-empty-content">
                        <div class="data-table-empty-icon" aria-hidden="true">${isFiltered ? '🔍' : '📊'}</div>
                        <h3 class="data-table-empty-title">${message}</h3>
                        <p class="data-table-empty-subtitle">${subtitle}</p>
                        ${isFiltered ? `
                            <button class="data-table-clear-filter" data-action="clear-filter">
                                Filter zurücksetzen
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    renderPagination() {
        const totalPages = this.getTotalPages();
        if (totalPages <= 1) return '';

        const prevDisabled = this.currentPage <= 1;
        const nextDisabled = this.currentPage >= totalPages;

        return `
            <div class="data-table-pagination-info">
                <span class="data-table-page-info">
                    Seite ${this.currentPage} von ${totalPages}
                    (${this.filteredData.length} Einträge)
                </span>
            </div>
            <div class="data-table-pagination-controls">
                <button
                    class="data-table-btn data-table-btn-prev ${prevDisabled ? 'disabled' : ''}"
                    data-action="prev"
                    ${prevDisabled ? 'disabled' : ''}
                    aria-label="Vorherige Seite"
                >
                    ← Zurück
                </button>

                ${this.renderPageNumbers()}

                <button
                    class="data-table-btn data-table-btn-next ${nextDisabled ? 'disabled' : ''}"
                    data-action="next"
                    ${nextDisabled ? 'disabled' : ''}
                    aria-label="Nächste Seite"
                >
                    Weiter →
                </button>
            </div>
        `;
    }

    renderPageNumbers() {
        const totalPages = this.getTotalPages();
        const currentPage = this.currentPage;
        let pages = [];

        // Immer erste Seite zeigen
        if (currentPage > 3) {
            pages.push(1);
            if (currentPage > 4) pages.push('...');
        }

        // Aktuelle Seite ± 1
        for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) {
            pages.push(i);
        }

        // Immer letzte Seite zeigen
        if (currentPage < totalPages - 2) {
            if (currentPage < totalPages - 3) pages.push('...');
            pages.push(totalPages);
        }

        return pages.map(page => {
            if (page === '...') {
                return `<span class="data-table-pagination-dots">...</span>`;
            }
            return `
                <button
                    class="data-table-btn data-table-btn-page ${page === currentPage ? 'active' : ''}"
                    data-action="page"
                    data-page="${page}"
                    ${page === currentPage ? 'aria-current="page"' : ''}
                >
                    ${page}
                </button>
            `;
        }).join('');
    }

    // Public Methods
    setData(data) {
        this.data = Array.isArray(data) ? data : [];
        this.applyFilter();
        this.updateResultCount();
    }

    search(searchTerm) {
        this.filterValue = searchTerm || '';
        const searchInput = this.container.querySelector(`#${this.container.id}-search`);
        if (searchInput) {
            searchInput.value = this.filterValue;
        }
        this.applyFilter();
    }

    clearFilter() {
        this.search('');
    }

    applyFilter() {
        if (!this.filterValue.trim() || this.searchFields.length === 0) {
            this.filteredData = [...this.data];
        } else {
            const searchLower = this.filterValue.toLowerCase();
            this.filteredData = this.data.filter(row => {
                return this.searchFields.some(field => {
                    const value = row[field];
                    return value != null && String(value).toLowerCase().includes(searchLower);
                });
            });
        }

        this.currentPage = 1;
        this.updateTable();
        this.updateResultCount();
    }

    updateResultCount() {
        const info = this.container.querySelector(`#${this.container.id}-info`);
        if (info) {
            const count = this.filteredData.length;
            const total = this.data.length;
            if (this.filterValue.trim() && count !== total) {
                info.textContent = `${count} von ${total} Einträgen`;
            } else {
                info.textContent = `${count} Eintrag${count !== 1 ? 'e' : ''}`;
            }
        }
    }

    sort(columnKey, direction = null) {
        const column = this.columns.find(col => col.key === columnKey);
        if (!column || column.sortable === false) return;

        // Toggle direction wenn selbe Spalte
        if (this.sortColumn === columnKey && !direction) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = columnKey;
            this.sortDirection = direction || 'asc';
        }

        this.filteredData.sort((a, b) => {
            let aVal = a[columnKey];
            let bVal = b[columnKey];

            // Null/undefined handling
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            // Custom sort function
            if (column.sortFn) {
                const result = column.sortFn(aVal, bVal);
                return this.sortDirection === 'desc' ? -result : result;
            }

            // Default sort
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                const result = aVal - bVal;
                return this.sortDirection === 'desc' ? -result : result;
            }

            const result = String(aVal).localeCompare(String(bVal));
            return this.sortDirection === 'desc' ? -result : result;
        });

        this.currentPage = 1;
        this.updateTable();
        this.updateSortUI();
    }

    paginate(page, size = null) {
        if (size) this.pageSize = size;
        this.currentPage = Math.max(1, Math.min(page, this.getTotalPages()));
        this.updateTable();
    }

    filter(filterFn) {
        this.filteredData = this.data.filter(filterFn);
        this.currentPage = 1;
        this.updateTable();
    }

    // Helper Methods
    getCurrentPageData() {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        return this.filteredData.slice(start, end);
    }

    getTotalPages() {
        return Math.ceil(this.filteredData.length / this.pageSize);
    }

    getSortIcon(columnKey) {
        if (this.sortColumn !== columnKey) {
            return '<span class="sort-default">⇅</span>';
        }
        return this.sortDirection === 'asc' ?
            '<span class="sort-asc">↑</span>' :
            '<span class="sort-desc">↓</span>';
    }

    getSortAriaLabel(columnKey) {
        if (this.sortColumn !== columnKey) return 'none';
        return this.sortDirection === 'asc' ? 'ascending' : 'descending';
    }

    formatCellValue(value, column, row) {
        if (column.render) {
            return column.render(value, row);
        }
        if (value == null) return '-';
        return String(value);
    }

    updateTable() {
        const tbody = this.container.querySelector('.data-table-body');
        const pagination = this.container.querySelector('.data-table-pagination');

        if (tbody) {
            tbody.innerHTML = this.renderRows();
        }

        if (pagination) {
            pagination.innerHTML = this.renderPagination();
        }
    }

    updateSortUI() {
        // Update header sort indicators
        const headers = this.container.querySelectorAll('.data-table-th[data-sortable="true"]');
        headers.forEach(th => {
            const column = th.dataset.column;
            const icon = th.querySelector('.data-table-sort-icon');
            const isSorted = this.sortColumn === column;

            th.classList.toggle('sorted', isSorted);
            th.setAttribute('aria-sort', this.getSortAriaLabel(column));

            if (icon) {
                icon.innerHTML = this.getSortIcon(column);
            }
        });
    }

    // Event Handlers
    attachEvents() {
        let searchTimeout;

        // Search input mit Debounce
        const searchInput = this.container.querySelector(`#${this.container.id}-search`);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.filterValue = e.target.value;
                    this.applyFilter();
                }, 300);
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.target.value = '';
                    this.clearFilter();
                    e.target.blur();
                }
            });
        }

        // Header click delegation für Sortierung
        this.container.addEventListener('click', (e) => {
            const th = e.target.closest('.data-table-th[data-sortable="true"]');
            if (th) {
                e.preventDefault();
                this.sort(th.dataset.column);
            }

            // Pagination clicks
            const btn = e.target.closest('[data-action]');
            if (btn && !btn.disabled) {
                e.preventDefault();
                const action = btn.dataset.action;

                if (action === 'prev') {
                    this.paginate(this.currentPage - 1);
                } else if (action === 'next') {
                    this.paginate(this.currentPage + 1);
                } else if (action === 'page') {
                    this.paginate(parseInt(btn.dataset.page));
                } else if (action === 'clear-filter') {
                    this.clearFilter();
                }
            }
        });

        // Keyboard navigation für sortierbare Header
        this.container.addEventListener('keydown', (e) => {
            const th = e.target.closest('.data-table-th[data-sortable="true"]');
            if (th && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this.sort(th.dataset.column);
            }
        });
    }

    setLoading(loading) {
        this.loading = loading;
        this.updateTable();
    }

    // Styles
    addStyles() {
        if (document.getElementById('data-table-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'data-table-styles';
        styles.textContent = `
            .data-table-container {
                background: white;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                overflow: hidden;
            }

            .data-table-wrapper {
                width: 100%;
            }

            .data-table-filters {
                padding: 16px 20px;
                background: #f8fafc;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                flex-wrap: wrap;
            }

            .data-table-search {
                position: relative;
                flex: 1;
                min-width: 200px;
                max-width: 400px;
            }

            .data-table-search-input {
                width: 100%;
                padding: 10px 16px 10px 40px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 14px;
                background: white;
                transition: all 0.15s ease;
                color: #374151;
            }

            .data-table-search-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .data-table-search-input::placeholder {
                color: #9ca3af;
            }

            .data-table-search-icon {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: #9ca3af;
                pointer-events: none;
                font-size: 14px;
            }

            .data-table-info {
                color: #6b7280;
                font-size: 14px;
                white-space: nowrap;
            }

            .data-table-result-count {
                font-weight: 500;
            }

            .data-table-scroll {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }

            .data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
                line-height: 1.5;
            }

            .data-table-header {
                background: #f8fafc;
                border-bottom: 2px solid #e2e8f0;
            }

            .data-table-th {
                text-align: left;
                padding: 12px 16px;
                font-weight: 600;
                color: #374151;
                white-space: nowrap;
                border-bottom: 1px solid #e5e7eb;
                position: relative;
            }

            .data-table-th[data-sortable="true"] {
                cursor: pointer;
                user-select: none;
                transition: background-color 0.15s ease;
            }

            .data-table-th[data-sortable="true"]:hover {
                background: #e2e8f0;
            }

            .data-table-th[data-sortable="true"]:focus {
                outline: 2px solid #3b82f6;
                outline-offset: -2px;
            }

            .data-table-th.sorted {
                background: #e0e7ff;
                color: #3730a3;
            }

            .data-table-th-content {
                display: flex;
                align-items: center;
                gap: 8px;
                min-height: 20px;
            }

            .data-table-th-text {
                flex: 1;
            }

            .data-table-sort-icon {
                flex-shrink: 0;
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #6b7280;
            }

            .data-table-th.sorted .data-table-sort-icon {
                color: #3730a3;
            }

            .data-table-td {
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                color: #374151;
            }

            .data-table-row:hover {
                background: #f9fafb;
            }

            .data-table-cell {
                min-height: 20px;
            }

            .data-table-empty {
                background: transparent;
            }

            .data-table-empty:hover {
                background: transparent;
            }

            .data-table-empty-cell {
                padding: 48px 24px;
                text-align: center;
                color: #6b7280;
            }

            .data-table-empty-content {
                max-width: 300px;
                margin: 0 auto;
            }

            .data-table-empty-icon {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.5;
            }

            .data-table-empty-title {
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 8px 0;
                color: #374151;
            }

            .data-table-empty-subtitle {
                margin: 0;
                font-size: 14px;
                color: #6b7280;
            }

            .data-table-clear-filter {
                margin-top: 16px;
                padding: 8px 16px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                transition: background-color 0.15s ease;
            }

            .data-table-clear-filter:hover {
                background: #2563eb;
            }

            .data-table-clear-filter:focus {
                outline: 2px solid #3b82f6;
                outline-offset: 2px;
            }

            /* Loading Skeleton */
            .data-table-skeleton-row {
                background: transparent;
            }

            .data-table-skeleton-row:hover {
                background: transparent;
            }

            .data-table-skeleton-cell {
                padding: 2px 0;
            }

            .data-table-skeleton-line {
                height: 16px;
                background: linear-gradient(
                    90deg,
                    #f3f4f6 25%,
                    #e5e7eb 50%,
                    #f3f4f6 75%
                );
                background-size: 200% 100%;
                animation: data-table-skeleton 1.5s infinite;
                border-radius: 4px;
                width: 80%;
                max-width: 200px;
            }

            @keyframes data-table-skeleton {
                0% {
                    background-position: 200% 0;
                }
                100% {
                    background-position: -200% 0;
                }
            }

            .data-table-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                font-size: 14px;
            }

            .data-table-spinner {
                width: 20px;
                height: 20px;
                border: 2px solid #e5e7eb;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: data-table-spin 1s linear infinite;
            }

            @keyframes data-table-spin {
                to { transform: rotate(360deg); }
            }

            .data-table-pagination {
                padding: 16px 24px;
                background: #f8fafc;
                border-top: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                flex-wrap: wrap;
            }

            .data-table-pagination-info {
                color: #6b7280;
                font-size: 14px;
            }

            .data-table-pagination-controls {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .data-table-btn {
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                background: white;
                color: #374151;
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.15s ease;
                min-height: 36px;
                display: flex;
                align-items: center;
                user-select: none;
            }

            .data-table-btn:hover:not(.disabled) {
                background: #f3f4f6;
                border-color: #9ca3af;
            }

            .data-table-btn:focus {
                outline: 2px solid #3b82f6;
                outline-offset: 2px;
            }

            .data-table-btn.active {
                background: #3b82f6;
                color: white;
                border-color: #3b82f6;
            }

            .data-table-btn.disabled {
                opacity: 0.5;
                cursor: not-allowed;
                pointer-events: none;
            }

            .data-table-btn-page {
                min-width: 36px;
                justify-content: center;
            }

            .data-table-pagination-dots {
                padding: 8px 4px;
                color: #9ca3af;
                font-size: 14px;
            }

            /* Mobile Responsive */
            @media (max-width: 640px) {
                .data-table-filters {
                    padding: 12px 16px;
                    flex-direction: column;
                    align-items: stretch;
                    gap: 12px;
                }

                .data-table-search {
                    min-width: unset;
                    max-width: unset;
                }

                .data-table-search-input {
                    min-height: 44px; /* Touch Target */
                    padding: 12px 16px 12px 40px;
                    font-size: 16px; /* Prevent zoom on iOS */
                }

                .data-table-info {
                    text-align: center;
                    font-size: 13px;
                }

                .data-table-th,
                .data-table-td {
                    padding: 10px 12px;
                    font-size: 13px;
                }

                .data-table-pagination {
                    padding: 12px 16px;
                    flex-direction: column;
                    align-items: stretch;
                    gap: 12px;
                }

                .data-table-pagination-info {
                    text-align: center;
                    font-size: 13px;
                }

                .data-table-pagination-controls {
                    justify-content: center;
                    flex-wrap: wrap;
                }

                .data-table-btn {
                    min-height: 44px; /* Touch-Target */
                    padding: 10px 16px;
                }

                .data-table-empty-cell {
                    padding: 32px 16px;
                }

                .data-table-empty-icon {
                    font-size: 36px;
                    margin-bottom: 12px;
                }

                .data-table-clear-filter {
                    min-height: 44px;
                    padding: 12px 20px;
                }
            }

            @media (max-width: 480px) {
                .data-table-th,
                .data-table-td {
                    padding: 8px 10px;
                    font-size: 12px;
                }

                .data-table-pagination-controls {
                    gap: 4px;
                }

                .data-table-btn {
                    padding: 8px 12px;
                    font-size: 13px;
                }

                .data-table-btn-page {
                    min-width: 40px;
                }
            }
        `;

        document.head.appendChild(styles);
    }
}

// Export für Wiederverwendung
window.DataTable = DataTable;