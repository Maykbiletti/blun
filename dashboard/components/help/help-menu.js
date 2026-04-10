class HelpMenu {
    constructor() {
        this.isOpen = false;
        this.knowledgeBase = [
            {
                keywords: ["what", "blun", "was", "ist"],
                category: "general",
                question: "Was ist BLUN?",
                en: "BLUN is an open-source AI agent framework. It lets you create, manage and orchestrate AI agents with skills, tools and multi-model support. Self-hosted, privacy-first, built in Austria.",
                de: "BLUN ist ein Open-Source AI-Agent-Framework. Damit kannst du KI-Agenten mit Skills, Tools und Multi-Modell-Unterstützung erstellen und orchestrieren. Self-hosted, Privacy-first, aus Österreich."
            },
            {
                keywords: ["price", "pricing", "cost", "plan", "preis", "kosten", "free", "gratis", "kostenlos"],
                category: "pricing",
                question: "Was kostet BLUN?",
                en: "BLUN is open source and free to self-host. We offer managed hosting plans: Free (3 assistants, 2 local AI models), Pro $20/month (unlimited assistants, all models), Max $100/month (everything unlimited). Enterprise plans with SLA are available on request.",
                de: "BLUN ist Open Source und kostenlos zum Selbst-Hosten. Managed-Hosting-Pläne starten ab EUR 29/Monat mit inkludierten Compute-Credits. Enterprise-Pläne mit SLA auf Anfrage."
            },
            {
                keywords: ["feature", "features", "funktion", "funktionen", "can", "kann", "what can"],
                category: "features",
                question: "Welche Funktionen bietet BLUN?",
                en: "BLUN features: Multi-agent orchestration, Model Race (parallel model comparison), Website Builder, Software Builder, Code Canvas, Skill system, Federation (agent-to-agent communication), Telegram integration, KI-Organisator, privacy dashboard, and more.",
                de: "BLUN-Funktionen: Multi-Agent-Orchestrierung, Model Race (paralleler Modellvergleich), Website Builder, Software Builder, Code Canvas, Skill-System, Federation (Agent-zu-Agent-Kommunikation), Telegram-Integration, KI-Organisator, Datenschutz-Dashboard und mehr."
            },
            {
                keywords: ["agent", "agenten", "create agent", "erstell"],
                category: "features",
                question: "Wie funktionieren Agents?",
                en: "Agents are the core of BLUN. Each agent has its own model, system prompt, skills, and memory. Create unlimited agents, each specialized for different tasks.",
                de: "Agenten sind der Kern von BLUN. Jeder Agent hat sein eigenes Modell, System-Prompt, Skills und Speicher. Erstelle unbegrenzt Agenten, jeder spezialisiert für verschiedene Aufgaben."
            },
            {
                keywords: ["company", "firma", "unternehmen", "organization", "anlegen", "erstellen"],
                category: "setup",
                question: "Wie lege ich eine Firma an?",
                en: "Go to Companies in the sidebar, click 'New Company' and fill in your company details. You can then invite team members and manage projects within your company.",
                de: "Gehe zu Firmen in der Seitenleiste, klicke auf 'Neue Firma' und fülle deine Firmendaten aus. Du kannst dann Teammitglieder einladen und Projekte innerhalb deiner Firma verwalten."
            },
            {
                keywords: ["api", "keys", "verbinden", "connect", "integration"],
                category: "setup",
                question: "Wie verbinde ich API-Keys?",
                en: "Go to Settings > API Keys, click 'Add New Key', select the service (OpenAI, Anthropic, etc.) and enter your API key. This enables agents to use external AI models and services.",
                de: "Gehe zu Einstellungen > API-Keys, klicke 'Neuen Key hinzufügen', wähle den Service (OpenAI, Anthropic, etc.) und gib deinen API-Key ein. Dies ermöglicht Agenten die Nutzung externer KI-Modelle und Services."
            },
            {
                keywords: ["project", "projekt", "first", "erstes", "start", "beginnen"],
                category: "setup",
                question: "Wie starte ich mein erstes Projekt?",
                en: "Go to Projects, click 'New Project', give it a name and description, assign one or more agents, and define the project goals. The agents will then start working on your project automatically.",
                de: "Gehe zu Projekte, klicke 'Neues Projekt', gib einen Namen und Beschreibung ein, weise einen oder mehrere Agenten zu und definiere die Projektziele. Die Agenten werden dann automatisch an deinem Projekt arbeiten."
            },
            {
                keywords: ["install", "setup", "start", "deploy", "installier", "einricht", "anfang", "how to", "getting started"],
                category: "setup",
                question: "Wie installiere ich BLUN?",
                en: "Clone the repo: git clone https://github.com/blun-ai/blun. Run npm install, copy .env.example to .env, configure your DB and Redis, then npm start. Full docs at blun.ai/docs.",
                de: "Repo klonen: git clone https://github.com/blun-ai/blun. Dann npm install, .env.example nach .env kopieren, DB und Redis konfigurieren, npm start. Vollständige Doku auf blun.ai/docs."
            },
            {
                keywords: ["privacy", "dsgvo", "gdpr", "datenschutz", "data", "daten", "sicher"],
                category: "privacy",
                question: "Wie sicher sind meine Daten?",
                en: "BLUN is self-hosted, so your data stays on your servers. We provide a built-in privacy dashboard for GDPR compliance: data export, deletion, consent management. No data leaves your instance.",
                de: "BLUN ist self-hosted, deine Daten bleiben auf deinen Servern. Wir bieten ein eingebautes Datenschutz-Dashboard für DSGVO-Konformität: Datenexport, Löschung, Einwilligungsverwaltung. Keine Daten verlassen deine Instanz."
            },
            {
                keywords: ["support", "help", "hilfe", "contact", "kontakt", "team", "email"],
                category: "general",
                question: "Wie bekomme ich Hilfe?",
                en: "You can reach our team at hello@blun.ai or through the Telegram community. We typically respond within a few hours during business days.",
                de: "Du erreichst unser Team unter hello@blun.ai oder über die Telegram-Community. Wir antworten typischerweise innerhalb weniger Stunden an Werktagen."
            }
        ];

        this.init();
    }

    init() {
        this.createStyles();
        this.createHelpButton();
        this.bindEvents();
    }

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .help-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: var(--b);
                color: white;
                border: none;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
            }

            .help-btn:hover {
                transform: scale(1.1);
                background: var(--bd);
            }

            .help-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }

            .help-menu-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            .help-menu {
                background: var(--bg3);
                border: 2px solid var(--b);
                border-radius: 16px;
                width: 90vw;
                max-width: 800px;
                max-height: 90vh;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                transform: translateY(20px);
                transition: transform 0.3s ease;
                display: flex;
                flex-direction: column;
            }

            .help-menu-overlay.active .help-menu {
                transform: translateY(0);
            }

            .help-header {
                padding: 20px;
                border-bottom: 1px solid var(--brd);
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: var(--bg4);
            }

            .help-title {
                font-size: 24px;
                font-weight: 700;
                color: var(--tx);
                margin: 0;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .help-close {
                background: none;
                border: none;
                font-size: 24px;
                color: var(--tx2);
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
            }

            .help-close:hover {
                color: var(--tx);
                background: var(--bg3);
            }

            .help-content {
                padding: 20px;
                overflow-y: auto;
                flex: 1;
            }

            .help-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 24px;
                padding: 16px;
                background: var(--bg2);
                border-radius: 12px;
            }

            .help-action-btn {
                padding: 12px 16px;
                border-radius: 8px;
                border: 1px solid var(--brd);
                background: var(--bg3);
                color: var(--tx);
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .help-action-btn:hover {
                background: var(--bg4);
                border-color: var(--b);
                transform: translateY(-1px);
            }

            .help-search {
                width: 100%;
                padding: 12px;
                border: 1px solid var(--brd);
                border-radius: 8px;
                background: var(--bg2);
                color: var(--tx);
                font-size: 16px;
                margin-bottom: 20px;
            }

            .help-search:focus {
                outline: none;
                border-color: var(--b);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .help-categories {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 20px;
            }

            .help-category {
                padding: 6px 12px;
                border-radius: 20px;
                background: var(--bg2);
                color: var(--tx2);
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .help-category:hover,
            .help-category.active {
                background: var(--b);
                color: white;
            }

            .faq-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .faq-item {
                border: 1px solid var(--brd);
                border-radius: 8px;
                overflow: hidden;
                background: var(--bg2);
                transition: all 0.2s;
            }

            .faq-item:hover {
                border-color: var(--b);
            }

            .faq-question {
                padding: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 600;
                color: var(--tx);
                background: var(--bg3);
            }

            .faq-question:hover {
                background: var(--bg4);
            }

            .faq-toggle {
                font-size: 18px;
                transition: transform 0.3s ease;
            }

            .faq-item.active .faq-toggle {
                transform: rotate(180deg);
            }

            .faq-answer {
                padding: 0 16px;
                max-height: 0;
                overflow: hidden;
                transition: all 0.3s ease;
                color: var(--tx2);
                line-height: 1.6;
            }

            .faq-item.active .faq-answer {
                padding: 16px;
                max-height: 200px;
            }

            .no-results {
                text-align: center;
                color: var(--tx2);
                font-style: italic;
                padding: 40px 20px;
            }

            @media (max-width: 768px) {
                .help-menu {
                    width: 95vw;
                    max-height: 95vh;
                }

                .help-actions {
                    grid-template-columns: 1fr;
                }

                .help-categories {
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
    }

    createHelpButton() {
        const btn = document.createElement('button');
        btn.className = 'help-btn';
        btn.innerHTML = '?';
        btn.title = 'Hilfe & FAQ';
        btn.onclick = () => this.open();
        document.body.appendChild(btn);
    }

    open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.createOverlay();
        this.renderContent();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'help-menu-overlay';

        this.overlay.innerHTML = `
            <div class="help-menu">
                <div class="help-header">
                    <h2 class="help-title">
                        <span>?</span>
                        Hilfe & FAQ
                    </h2>
                    <button class="help-close">×</button>
                </div>
                <div class="help-content">
                    <div class="help-actions">
                        <button class="help-action-btn" onclick="helpMenu.startOnboarding()">
                            <span>🎯</span>
                            Tour starten
                        </button>
                        <button class="help-action-btn" onclick="helpMenu.contactSupport()">
                            <span>💬</span>
                            Support kontaktieren
                        </button>
                    </div>

                    <input type="text" class="help-search" placeholder="Suche nach Themen..." />

                    <div class="help-categories"></div>

                    <div class="faq-list"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        // Bind events
        this.overlay.querySelector('.help-close').onclick = () => this.close();
        this.overlay.onclick = (e) => {
            if (e.target === this.overlay) this.close();
        };

        const searchInput = this.overlay.querySelector('.help-search');
        searchInput.oninput = (e) => this.filterFAQ(e.target.value);

        // Show overlay
        setTimeout(() => this.overlay.classList.add('active'), 10);
    }

    renderContent() {
        this.renderCategories();
        this.renderFAQ();
    }

    renderCategories() {
        const container = this.overlay.querySelector('.help-categories');
        const categories = [...new Set(this.knowledgeBase.map(item => item.category))];

        const allBtn = document.createElement('div');
        allBtn.className = 'help-category active';
        allBtn.textContent = 'Alle';
        allBtn.onclick = () => this.filterByCategory(null, allBtn);
        container.appendChild(allBtn);

        const categoryLabels = {
            general: 'Allgemein',
            features: 'Funktionen',
            setup: 'Einrichtung',
            pricing: 'Preise',
            privacy: 'Datenschutz'
        };

        categories.forEach(cat => {
            const btn = document.createElement('div');
            btn.className = 'help-category';
            btn.textContent = categoryLabels[cat] || cat;
            btn.onclick = () => this.filterByCategory(cat, btn);
            container.appendChild(btn);
        });
    }

    renderFAQ(filteredItems = null) {
        const container = this.overlay.querySelector('.faq-list');
        const items = filteredItems || this.knowledgeBase;

        if (items.length === 0) {
            container.innerHTML = '<div class="no-results">Keine Ergebnisse gefunden.</div>';
            return;
        }

        container.innerHTML = '';

        items.forEach((item, index) => {
            const faqItem = document.createElement('div');
            faqItem.className = 'faq-item';

            faqItem.innerHTML = `
                <div class="faq-question">
                    <span>${item.question}</span>
                    <span class="faq-toggle">▼</span>
                </div>
                <div class="faq-answer">
                    ${item.de}
                </div>
            `;

            const question = faqItem.querySelector('.faq-question');
            question.onclick = () => this.toggleFAQ(faqItem);

            container.appendChild(faqItem);
        });
    }

    toggleFAQ(item) {
        const isActive = item.classList.contains('active');

        // Close all other items
        this.overlay.querySelectorAll('.faq-item.active').forEach(activeItem => {
            if (activeItem !== item) {
                activeItem.classList.remove('active');
            }
        });

        // Toggle current item
        item.classList.toggle('active', !isActive);
    }

    filterByCategory(category, btn) {
        // Update active category
        this.overlay.querySelectorAll('.help-category').forEach(cat => {
            cat.classList.remove('active');
        });
        btn.classList.add('active');

        // Filter FAQ items
        const filteredItems = category
            ? this.knowledgeBase.filter(item => item.category === category)
            : this.knowledgeBase;

        this.renderFAQ(filteredItems);
    }

    filterFAQ(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderFAQ();
            return;
        }

        const filtered = this.knowledgeBase.filter(item => {
            const text = (item.question + ' ' + item.de + ' ' + item.keywords.join(' ')).toLowerCase();
            return text.includes(searchTerm.toLowerCase());
        });

        this.renderFAQ(filtered);
    }

    startOnboarding() {
        this.close();
        setTimeout(() => {
            if (window.onboardingTour) {
                window.onboardingTour.restart();
            }
        }, 300);
    }

    contactSupport() {
        window.open('mailto:hello@blun.ai?subject=BLUN Support Request', '_blank');
    }

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.overlay.classList.remove('active');

        setTimeout(() => {
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.overlay = null;
        }, 300);
    }

    bindEvents() {
        // Listen for escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Handle /hilfe command
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.open();
            }
        });
    }
}

// Initialize help menu
const helpMenu = new HelpMenu();

// Export for global access
window.helpMenu = helpMenu;