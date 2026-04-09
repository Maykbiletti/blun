/**
 * BLUN Agent Configurator
 * Agent Settings Panel - Model/Memory/Skill Selection
 */

class AgentConfigurator {
    constructor() {
        this.selectedAgent = null;
        this.models = [
            'claude-sonnet-4-6',
            'claude-opus-4-6',
            'claude-haiku-4-5',
            'gpt-4o',
            'gpt-4-turbo'
        ];
        this.memoryTypes = ['short', 'long', 'persistent', 'contextual'];
        this.availableSkills = [];
        this.init();
    }

    init() {
        this.loadAvailableSkills();
        this.setupEventListeners();
    }

    async loadAvailableSkills() {
        try {
            const response = await fetch('/api/skills');
            this.availableSkills = await response.json();
        } catch (error) {
            console.error('Failed to load skills:', error);
            this.availableSkills = [
                { id: 'auto_memory', name: 'Auto Memory', description: 'Automatic context preservation' },
                { id: 'prompt_engineering', name: 'Prompt Engineering', description: 'Optimized prompting' },
                { id: 'code_review', name: 'Code Review', description: 'Code analysis and review' },
                { id: 'changelog_gen', name: 'Changelog Generator', description: 'Automatic changelog creation' },
                { id: 'subagent_dispatch', name: 'Subagent Dispatch', description: 'Task delegation to specialized agents' }
            ];
        }
    }

    render() {
        return `
            <div class="agent-configurator">
                <div class="config-header">
                    <h2>Agent Konfiguration</h2>
                    <button class="btn-save" onclick="agentConfigurator.saveConfig()">Speichern</button>
                </div>

                <div class="config-tabs">
                    <button class="tab active" data-tab="basic">Basis</button>
                    <button class="tab" data-tab="model">Model</button>
                    <button class="tab" data-tab="memory">Memory</button>
                    <button class="tab" data-tab="skills">Skills</button>
                    <button class="tab" data-tab="advanced">Erweitert</button>
                </div>

                <div class="config-content">
                    ${this.renderBasicTab()}
                    ${this.renderModelTab()}
                    ${this.renderMemoryTab()}
                    ${this.renderSkillsTab()}
                    ${this.renderAdvancedTab()}
                </div>
            </div>
        `;
    }

    renderBasicTab() {
        return `
            <div class="tab-content active" data-tab="basic">
                <div class="config-section">
                    <h3>Agent Grundeinstellungen</h3>

                    <div class="form-group">
                        <label for="agent-name">Agent Name</label>
                        <input type="text" id="agent-name" placeholder="z.B. CodeReviewer" />
                    </div>

                    <div class="form-group">
                        <label for="agent-role">Rolle</label>
                        <select id="agent-role">
                            <option value="developer">Developer</option>
                            <option value="reviewer">Code Reviewer</option>
                            <option value="architect">System Architect</option>
                            <option value="tester">Test Engineer</option>
                            <option value="devops">DevOps Engineer</option>
                            <option value="analyst">Business Analyst</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="agent-description">Beschreibung</label>
                        <textarea id="agent-description" rows="3" placeholder="Was ist die Hauptaufgabe dieses Agents?"></textarea>
                    </div>

                    <div class="form-group">
                        <label for="agent-language">Sprache</label>
                        <select id="agent-language">
                            <option value="deutsch">Deutsch</option>
                            <option value="english">English</option>
                            <option value="auto">Automatisch</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    renderModelTab() {
        return `
            <div class="tab-content" data-tab="model">
                <div class="config-section">
                    <h3>Model Auswahl</h3>

                    <div class="model-grid">
                        ${this.models.map(model => `
                            <div class="model-card" data-model="${model}">
                                <div class="model-header">
                                    <h4>${model}</h4>
                                    <span class="model-badge">${this.getModelBadge(model)}</span>
                                </div>
                                <div class="model-specs">
                                    <span>Tokens: ${this.getModelTokens(model)}</span>
                                    <span>Geschwindigkeit: ${this.getModelSpeed(model)}</span>
                                    <span>Kosten: ${this.getModelCost(model)}</span>
                                </div>
                                <div class="model-description">
                                    ${this.getModelDescription(model)}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="form-group">
                        <label for="temperature">Temperatur (Kreativität)</label>
                        <input type="range" id="temperature" min="0" max="1" step="0.1" value="0.7" />
                        <span class="range-value">0.7</span>
                    </div>

                    <div class="form-group">
                        <label for="max-tokens">Max Tokens</label>
                        <input type="number" id="max-tokens" value="4096" min="100" max="8192" />
                    </div>
                </div>
            </div>
        `;
    }

    renderMemoryTab() {
        return `
            <div class="tab-content" data-tab="memory">
                <div class="config-section">
                    <h3>Memory Konfiguration</h3>

                    <div class="memory-types">
                        ${this.memoryTypes.map(type => `
                            <div class="memory-type" data-type="${type}">
                                <div class="memory-header">
                                    <input type="checkbox" id="memory-${type}" />
                                    <label for="memory-${type}">${this.getMemoryLabel(type)}</label>
                                </div>
                                <div class="memory-config">
                                    <div class="form-group">
                                        <label>Speicherdauer</label>
                                        <select>
                                            <option value="session">Session</option>
                                            <option value="day">1 Tag</option>
                                            <option value="week">1 Woche</option>
                                            <option value="month">1 Monat</option>
                                            <option value="permanent">Permanent</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>Max Einträge</label>
                                        <input type="number" value="100" min="10" max="1000" />
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="form-group">
                        <label for="context-window">Context Window</label>
                        <select id="context-window">
                            <option value="small">Klein (2K Tokens)</option>
                            <option value="medium" selected>Mittel (8K Tokens)</option>
                            <option value="large">Groß (32K Tokens)</option>
                            <option value="xlarge">XL (128K Tokens)</option>
                        </select>
                    </div>

                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="auto-summarize" />
                            Automatische Zusammenfassung alter Conversations
                        </label>
                        <label>
                            <input type="checkbox" id="memory-compression" />
                            Memory Kompression aktivieren
                        </label>
                        <label>
                            <input type="checkbox" id="cross-session" />
                            Session-übergreifende Memory
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    renderSkillsTab() {
        return `
            <div class="tab-content" data-tab="skills">
                <div class="config-section">
                    <h3>Skills & Fähigkeiten</h3>

                    <div class="skills-search">
                        <input type="text" id="skills-search" placeholder="Skills suchen..." />
                        <button class="btn-filter">Filter</button>
                    </div>

                    <div class="skills-categories">
                        <button class="category-tab active" data-category="all">Alle</button>
                        <button class="category-tab" data-category="code">Code</button>
                        <button class="category-tab" data-category="analysis">Analyse</button>
                        <button class="category-tab" data-category="automation">Automation</button>
                        <button class="category-tab" data-category="communication">Communication</button>
                    </div>

                    <div class="skills-grid">
                        ${this.availableSkills.map(skill => `
                            <div class="skill-card" data-skill="${skill.id}" data-category="${skill.category || 'general'}">
                                <div class="skill-header">
                                    <input type="checkbox" id="skill-${skill.id}" />
                                    <h4>${skill.name}</h4>
                                    <span class="skill-status ${skill.status || 'stable'}">${skill.status || 'stable'}</span>
                                </div>
                                <div class="skill-description">
                                    ${skill.description}
                                </div>
                                <div class="skill-config">
                                    <button class="btn-configure" data-skill="${skill.id}">Konfigurieren</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="skills-custom">
                        <h4>Custom Skills</h4>
                        <button class="btn-add-skill">+ Neuer Skill</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderAdvancedTab() {
        return `
            <div class="tab-content" data-tab="advanced">
                <div class="config-section">
                    <h3>Erweiterte Einstellungen</h3>

                    <div class="form-group">
                        <label for="execution-mode">Ausführungsmodus</label>
                        <select id="execution-mode">
                            <option value="interactive">Interaktiv</option>
                            <option value="autonomous">Autonom</option>
                            <option value="supervised">Überwacht</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="retry-count">Max Wiederholungen</label>
                        <input type="number" id="retry-count" value="3" min="0" max="10" />
                    </div>

                    <div class="form-group">
                        <label for="timeout">Timeout (Sekunden)</label>
                        <input type="number" id="timeout" value="300" min="10" max="3600" />
                    </div>

                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="debug-mode" />
                            Debug Modus aktivieren
                        </label>
                        <label>
                            <input type="checkbox" id="logging" />
                            Erweiterte Logs
                        </label>
                        <label>
                            <input type="checkbox" id="performance-monitoring" />
                            Performance Monitoring
                        </label>
                        <label>
                            <input type="checkbox" id="error-reporting" />
                            Automatisches Error Reporting
                        </label>
                    </div>

                    <div class="form-group">
                        <label for="custom-prompt">Custom System Prompt</label>
                        <textarea id="custom-prompt" rows="5" placeholder="Zusätzliche Instruktionen für den Agent..."></textarea>
                    </div>

                    <div class="form-group">
                        <label for="environment-vars">Umgebungsvariablen</label>
                        <div class="env-vars">
                            <div class="env-var-row">
                                <input type="text" placeholder="KEY" />
                                <input type="text" placeholder="VALUE" />
                                <button class="btn-remove">-</button>
                            </div>
                            <button class="btn-add-env">+ Variable hinzufügen</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Tab switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab')) {
                this.switchTab(e.target.dataset.tab);
            }
        });

        // Model selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('.model-card')) {
                this.selectModel(e.target.closest('.model-card').dataset.model);
            }
        });

        // Temperature range
        document.addEventListener('input', (e) => {
            if (e.target.id === 'temperature') {
                e.target.nextElementSibling.textContent = e.target.value;
            }
        });

        // Skills filtering
        document.addEventListener('input', (e) => {
            if (e.target.id === 'skills-search') {
                this.filterSkills(e.target.value);
            }
        });

        // Category filtering
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-tab')) {
                this.filterByCategory(e.target.dataset.category);
                document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));
                e.target.classList.add('active');
            }
        });

        // Environment variables
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-add-env')) {
                this.addEnvironmentVar();
            }
            if (e.target.classList.contains('btn-remove')) {
                e.target.closest('.env-var-row').remove();
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"].tab`).classList.add('active');
        document.querySelector(`[data-tab="${tabName}"].tab-content`).classList.add('active');
    }

    selectModel(modelName) {
        document.querySelectorAll('.model-card').forEach(card => card.classList.remove('selected'));
        document.querySelector(`[data-model="${modelName}"]`).classList.add('selected');
    }

    filterSkills(searchTerm) {
        const cards = document.querySelectorAll('.skill-card');
        cards.forEach(card => {
            const name = card.querySelector('h4').textContent.toLowerCase();
            const description = card.querySelector('.skill-description').textContent.toLowerCase();
            const match = name.includes(searchTerm.toLowerCase()) || description.includes(searchTerm.toLowerCase());
            card.style.display = match ? 'block' : 'none';
        });
    }

    filterByCategory(category) {
        const cards = document.querySelectorAll('.skill-card');
        cards.forEach(card => {
            if (category === 'all' || card.dataset.category === category) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    addEnvironmentVar() {
        const container = document.querySelector('.env-vars');
        const newRow = document.createElement('div');
        newRow.className = 'env-var-row';
        newRow.innerHTML = `
            <input type="text" placeholder="KEY" />
            <input type="text" placeholder="VALUE" />
            <button class="btn-remove">-</button>
        `;
        container.insertBefore(newRow, container.lastElementChild);
    }

    getModelBadge(model) {
        if (model.includes('claude-sonnet')) return 'STANDARD';
        if (model.includes('claude-opus')) return 'PREMIUM';
        if (model.includes('claude-haiku')) return 'FAST';
        if (model.includes('gpt-4o')) return 'MULTIMODAL';
        return 'EXTERN';
    }

    getModelTokens(model) {
        if (model.includes('claude')) return '200K';
        if (model.includes('gpt-4')) return '128K';
        return '32K';
    }

    getModelSpeed(model) {
        if (model.includes('haiku')) return 'Sehr schnell';
        if (model.includes('sonnet')) return 'Schnell';
        if (model.includes('opus')) return 'Langsam';
        return 'Mittel';
    }

    getModelCost(model) {
        if (model.includes('haiku')) return '$';
        if (model.includes('sonnet')) return '$$';
        if (model.includes('opus')) return '$$$';
        return '$$';
    }

    getModelDescription(model) {
        const descriptions = {
            'claude-sonnet-4-6': 'Ausgewogenes Verhältnis von Geschwindigkeit und Qualität',
            'claude-opus-4-6': 'Höchste Qualität für komplexe Aufgaben',
            'claude-haiku-4-5': 'Ultraschnell für einfache Tasks',
            'gpt-4o': 'Multimodale Fähigkeiten mit Bild/Text',
            'gpt-4-turbo': 'Optimiert für Geschwindigkeit'
        };
        return descriptions[model] || 'Externes Model';
    }

    getMemoryLabel(type) {
        const labels = {
            'short': 'Kurzzeitgedächtnis',
            'long': 'Langzeitgedächtnis',
            'persistent': 'Persistentes Memory',
            'contextual': 'Kontext Memory'
        };
        return labels[type] || type;
    }

    async saveConfig() {
        const config = this.gatherConfig();

        try {
            const response = await fetch('/api/agents/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                this.showNotification('Konfiguration erfolgreich gespeichert', 'success');
            } else {
                throw new Error('Server Fehler');
            }
        } catch (error) {
            this.showNotification('Fehler beim Speichern der Konfiguration', 'error');
            console.error('Save config error:', error);
        }
    }

    gatherConfig() {
        return {
            basic: {
                name: document.getElementById('agent-name').value,
                role: document.getElementById('agent-role').value,
                description: document.getElementById('agent-description').value,
                language: document.getElementById('agent-language').value
            },
            model: {
                name: document.querySelector('.model-card.selected')?.dataset.model || 'claude-sonnet-4-6',
                temperature: parseFloat(document.getElementById('temperature').value),
                maxTokens: parseInt(document.getElementById('max-tokens').value)
            },
            memory: {
                types: this.memoryTypes.filter(type =>
                    document.getElementById(`memory-${type}`)?.checked
                ),
                contextWindow: document.getElementById('context-window').value,
                autoSummarize: document.getElementById('auto-summarize').checked,
                compression: document.getElementById('memory-compression').checked,
                crossSession: document.getElementById('cross-session').checked
            },
            skills: this.availableSkills.filter(skill =>
                document.getElementById(`skill-${skill.id}`)?.checked
            ).map(skill => skill.id),
            advanced: {
                executionMode: document.getElementById('execution-mode').value,
                retryCount: parseInt(document.getElementById('retry-count').value),
                timeout: parseInt(document.getElementById('timeout').value),
                debugMode: document.getElementById('debug-mode').checked,
                logging: document.getElementById('logging').checked,
                performanceMonitoring: document.getElementById('performance-monitoring').checked,
                errorReporting: document.getElementById('error-reporting').checked,
                customPrompt: document.getElementById('custom-prompt').value,
                environmentVars: this.gatherEnvironmentVars()
            }
        };
    }

    gatherEnvironmentVars() {
        const envVars = {};
        document.querySelectorAll('.env-var-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) {
                envVars[inputs[0].value] = inputs[1].value;
            }
        });
        return envVars;
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    loadAgent(agentId) {
        // Load existing agent configuration
        fetch(`/api/agents/${agentId}/config`)
            .then(response => response.json())
            .then(config => {
                this.populateForm(config);
                this.selectedAgent = agentId;
            })
            .catch(error => {
                console.error('Failed to load agent:', error);
                this.showNotification('Fehler beim Laden der Agent-Konfiguration', 'error');
            });
    }

    populateForm(config) {
        // Populate basic settings
        if (config.basic) {
            document.getElementById('agent-name').value = config.basic.name || '';
            document.getElementById('agent-role').value = config.basic.role || 'developer';
            document.getElementById('agent-description').value = config.basic.description || '';
            document.getElementById('agent-language').value = config.basic.language || 'deutsch';
        }

        // Populate model settings
        if (config.model) {
            if (config.model.name) {
                this.selectModel(config.model.name);
            }
            document.getElementById('temperature').value = config.model.temperature || 0.7;
            document.getElementById('max-tokens').value = config.model.maxTokens || 4096;
        }

        // Populate memory settings
        if (config.memory) {
            config.memory.types?.forEach(type => {
                const checkbox = document.getElementById(`memory-${type}`);
                if (checkbox) checkbox.checked = true;
            });

            if (config.memory.contextWindow) {
                document.getElementById('context-window').value = config.memory.contextWindow;
            }
        }

        // Populate skills
        if (config.skills) {
            config.skills.forEach(skillId => {
                const checkbox = document.getElementById(`skill-${skillId}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Populate advanced settings
        if (config.advanced) {
            Object.keys(config.advanced).forEach(key => {
                const element = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = config.advanced[key];
                    } else {
                        element.value = config.advanced[key];
                    }
                }
            });
        }
    }
}

// Initialize global instance
window.agentConfigurator = new AgentConfigurator();