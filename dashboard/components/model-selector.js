class ModelSelector {
    constructor() {
        this.models = [];
        this.activeModel = localStorage.getItem('activeModel') || null;
        this.isLoading = false;
        this.error = null;
        this.container = null;

        this.init();
    }

    init() {
        this.createUI();
        this.fetchModels();

        // Update alle 30s falls neue Modelle hinzugefügt werden
        setInterval(() => {
            if (!this.error) this.fetchModels();
        }, 30000);
    }

    async fetchModels() {
        this.isLoading = true;
        this.updateUI();

        try {
            const response = await fetch('/api/v1/models', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.models = data.models || data || [];
            this.error = null;

            // Falls aktives Model nicht mehr verfügbar, erstes nehmen
            if (this.activeModel && !this.models.find(m => m.id === this.activeModel)) {
                this.activeModel = this.models.length > 0 ? this.models[0].id : null;
                localStorage.setItem('activeModel', this.activeModel);
            }

            // Falls kein aktives Model gesetzt, erstes nehmen
            if (!this.activeModel && this.models.length > 0) {
                this.activeModel = this.models[0].id;
                localStorage.setItem('activeModel', this.activeModel);
            }

        } catch (err) {
            this.error = `llama-server offline: ${err.message}`;
            this.models = [];
            console.error('ModelSelector fetchModels error:', err);
        }

        this.isLoading = false;
        this.updateUI();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.className = 'model-selector';
        this.container.innerHTML = `
            <style>
                .model-selector {
                    position: relative;
                    min-width: 200px;
                }

                .model-dropdown {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #333;
                    background: #1a1a1a;
                    color: #ffffff;
                    border-radius: 4px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 14px;
                    cursor: pointer;
                }

                .model-dropdown:disabled {
                    background: #2a2a2a;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                .model-dropdown:focus {
                    outline: none;
                    border-color: #0066cc;
                    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
                }

                .model-status {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 12px;
                    pointer-events: none;
                }

                .model-error {
                    background: #ff4444;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 12px;
                    margin-top: 4px;
                    font-family: 'JetBrains Mono', monospace;
                }

                .loading-spinner {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border: 2px solid #666;
                    border-radius: 50%;
                    border-top-color: #0066cc;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>

            <select class="model-dropdown" disabled>
                <option>Loading models...</option>
            </select>
            <div class="model-error" style="display: none;"></div>
        `;
    }

    updateUI() {
        const select = this.container.querySelector('.model-dropdown');
        const errorDiv = this.container.querySelector('.model-error');
        const statusSpan = this.container.querySelector('.model-status');

        // Loading State
        if (this.isLoading) {
            select.disabled = true;
            select.innerHTML = '<option>🔄 Loading models...</option>';
            errorDiv.style.display = 'none';
            return;
        }

        // Error State
        if (this.error) {
            select.disabled = true;
            select.innerHTML = '<option>❌ llama-server offline</option>';
            errorDiv.textContent = this.error;
            errorDiv.style.display = 'block';
            return;
        }

        // Success State
        errorDiv.style.display = 'none';
        select.disabled = false;

        if (this.models.length === 0) {
            select.innerHTML = '<option>⚠️ No models available</option>';
            return;
        }

        // Populate Options
        select.innerHTML = this.models.map(model => {
            const selected = model.id === this.activeModel ? 'selected' : '';
            const status = model.loaded ? '🟢' : '⚫';
            return `<option value="${model.id}" ${selected}>${status} ${model.name || model.id}</option>`;
        }).join('');

        // Event Handler
        select.onchange = (e) => {
            this.activeModel = e.target.value;
            localStorage.setItem('activeModel', this.activeModel);

            // Event für andere Components
            window.dispatchEvent(new CustomEvent('modelChanged', {
                detail: {
                    modelId: this.activeModel,
                    model: this.models.find(m => m.id === this.activeModel)
                }
            }));

            console.log('Model selected:', this.activeModel);
        };
    }

    getActiveModel() {
        return this.models.find(m => m.id === this.activeModel);
    }

    render(parentElement) {
        parentElement.appendChild(this.container);
        return this;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

// Export für Module System
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelSelector;
}

// Global für Browser ohne Module System
if (typeof window !== 'undefined') {
    window.ModelSelector = ModelSelector;
}