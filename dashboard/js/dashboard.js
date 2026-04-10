/**
 * Dashboard State Management with API Response Guards
 */

class DashboardState {
    constructor() {
        this.state = {
            loading: false,
            error: null,
            data: null,
            lastUpdate: null
        };
        this.listeners = [];
        this.apiBase = '/api';
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    // State management
    setState(updates) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...updates };
        this.notifyListeners(prevState, this.state);
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notifyListeners(prevState, newState) {
        this.listeners.forEach(listener => {
            try {
                listener(newState, prevState);
            } catch (error) {
                console.error('Dashboard listener error:', error);
            }
        });
    }

    // API Response Guards
    validateApiResponse(response, expectedSchema = {}) {
        if (!response) {
            throw new Error('Empty API response');
        }

        if (response.error) {
            throw new Error(response.error);
        }

        // Basic schema validation
        for (const [key, type] of Object.entries(expectedSchema)) {
            if (response[key] === undefined) {
                throw new Error(`Missing required field: ${key}`);
            }
            if (typeof response[key] !== type) {
                throw new Error(`Invalid type for ${key}: expected ${type}, got ${typeof response[key]}`);
            }
        }

        return true;
    }

    async fetchWithRetry(url, options = {}, attempt = 1) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.validateApiResponse(data);

            return data;
        } catch (error) {
            if (attempt < this.retryAttempts) {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            throw error;
        }
    }

    // Dashboard data loading
    async loadDashboard() {
        if (this.state.loading) return;

        this.setState({
            loading: true,
            error: null
        });

        try {
            const data = await this.fetchWithRetry(`${this.apiBase}/dashboard`, {
                method: 'GET'
            });

            this.validateApiResponse(data, {
                timestamp: 'number',
                status: 'string'
            });

            this.setState({
                loading: false,
                data,
                lastUpdate: Date.now(),
                error: null
            });

            return data;
        } catch (error) {
            console.error('Dashboard load error:', error);
            this.setState({
                loading: false,
                error: error.message || 'Failed to load dashboard',
                data: null
            });
            throw error;
        }
    }

    async refresh() {
        return this.loadDashboard();
    }

    // Safe data access
    getData(path = '') {
        if (!this.state.data) return null;

        if (!path) return this.state.data;

        return path.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : null;
        }, this.state.data);
    }

    getState() {
        return { ...this.state };
    }

    isLoading() {
        return this.state.loading;
    }

    hasError() {
        return !!this.state.error;
    }

    getError() {
        return this.state.error;
    }

    // Auto-refresh functionality
    enableAutoRefresh(interval = 30000) {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.refreshInterval = setInterval(() => {
            if (!this.state.loading) {
                this.refresh().catch(error => {
                    console.warn('Auto-refresh failed:', error);
                });
            }
        }, interval);
    }

    disableAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    destroy() {
        this.disableAutoRefresh();
        this.listeners = [];
        this.setState({
            loading: false,
            error: null,
            data: null,
            lastUpdate: null
        });
    }
}

// Global dashboard instance
const dashboardState = new DashboardState();

// DOM Ready initialization
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Initialize dashboard when DOM is ready
        dashboardState.loadDashboard().catch(error => {
            console.error('Initial dashboard load failed:', error);
        });

        // Enable auto-refresh
        dashboardState.enableAutoRefresh();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            dashboardState.destroy();
        });
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DashboardState, dashboardState };
} else if (typeof window !== 'undefined') {
    window.DashboardState = DashboardState;
    window.dashboardState = dashboardState;
}