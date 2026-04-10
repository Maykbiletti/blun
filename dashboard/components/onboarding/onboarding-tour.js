class OnboardingTour {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                title: "Willkommen bei BLUN!",
                content: "BLUN ist Ihre KI-gestützte Plattform für automatisierte Geschäftsprozesse. Lassen Sie uns gemeinsam die wichtigsten Funktionen entdecken.",
                target: null,
                position: "center"
            },
            {
                title: "Was sind BLUN Agents?",
                content: "Agents sind spezialisierte KI-Assistenten, die komplexe Aufgaben automatisch erledigen. Jeder Agent hat seine eigene Expertise - von Marketing bis Buchhaltung.",
                target: ".nav-item[data-page='agents']",
                position: "right"
            },
            {
                title: "Ihre erste Firma anlegen",
                content: "Hier verwalten Sie Ihre Unternehmensdaten, Teams und Projekte. Klicken Sie auf 'Neue Firma' um zu beginnen.",
                target: ".nav-item[data-page='companies']",
                position: "right"
            },
            {
                title: "API-Keys verbinden",
                content: "Verbinden Sie Ihre KI-Anbieter (Claude, OpenAI, Gemini) oder tragen Sie Ihren API-Key ein. Sie können auch eine unserer lokalen KIs installieren.",
                target: ".nav-item[aria-label='Verbindungen verwalten']",
                position: "right"
            },
            {
                title: "Websites bauen",
                content: "Mit dem Website-Picker erstellen Sie in Minuten eine eigene Webseite. Template auswählen, anpassen, fertig. Optional mit eigener Domain gehostet bei uns.",
                target: ".nav-item[aria-label='Websites verwalten']",
                position: "right"
            },
            {
                title: "Software & Apps",
                content: "Hier bauen Sie eigene Software und Apps ohne Programmierkenntnisse: Sie beschreiben was Ihre Software oder App können soll, die Agents setzen es um. Am Ende Signen Sie Ihr fertiges Produkt — das heißt Sie bestätigen mit einem Klick, dass alles so passt wie Sie es wollten. Erst danach wird es ausgeliefert. So haben Sie immer die Kontrolle und nichts läuft ohne Ihr OK.",
                target: ".nav-item[aria-label='Software-Tools öffnen']",
                position: "right"
            },
            {
                title: "Projekte starten",
                content: "Erstellen Sie ein neues Projekt und instruieren Sie einfach Ihren Operator — er kümmert sich dann um die gesamte Arbeit, verteilt Aufgaben an seine Agents und liefert Ihnen Ergebnisse. Sie müssen sich um nichts weiter kümmern.",
                target: ".nav-item[data-page='projects']",
                position: "right"
            },
            {
                title: "Abrechnung & Pläne",
                content: "Hier sehen Sie Ihren aktuellen Plan, verbrauchte Credits und Rechnungen. Upgrade jederzeit möglich, keine Vertragsbindung.",
                target: ".nav-item[aria-label='Abrechnung einsehen']",
                position: "right"
            },
            {
                title: "Affiliate-Programm",
                content: "Wenn Sie mit BLUN Geld verdienen möchten, dann machen Sie Werbung für uns. Hier finden Sie Ihren Empfehlungslink, Provisionen und Auszahlungen.",
                target: ".nav-item[data-page='affiliate']",
                position: "right"
            },
            {
                title: "Los geht's!",
                content: "Sie sind bereit! Nutzen Sie jederzeit das Hilfe-Menü (?) unten rechts für weitere Informationen. Viel Erfolg mit BLUN!",
                target: null,
                position: "center",
                final: true
            }
        ];

        this.overlay = null;
        this.isActive = false;
        this.init();
    }

    init() {
        this.createStyles();
        this.bindEvents();

        // Only run AFTER user is logged in — poll for blun_token + user data
        var self = this;
        var tries = 0;
        var gate = setInterval(function () {
            tries++;
            var token = localStorage.getItem('blun_token');
            var loginVisible = document.getElementById('authForm') && document.getElementById('authForm').offsetParent !== null;
            if (token && !loginVisible) {
                clearInterval(gate);
                if (!localStorage.getItem('blun_onboarding_completed')) {
                    setTimeout(function () { self.start(); }, 800);
                }
            } else if (tries > 300) {
                clearInterval(gate); // give up after ~5 min
            }
        }, 1000);
    }

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .onboarding-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: transparent; pointer-events: none;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .onboarding-overlay.active {
                opacity: 1;
            }

            .onboarding-card {
                background: var(--bg3); pointer-events: auto;
                border: 2px solid var(--b);
                border-radius: 16px;
                padding: 24px;
                max-width: 480px;
                width: 90vw;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                position: relative;
                transform: translateY(20px);
                transition: transform 0.3s ease;
            }

            .onboarding-overlay.active .onboarding-card {
                transform: translateY(0);
            }

            .onboarding-header {
                display: flex;
                align-items: center;
                justify-content: between;
                margin-bottom: 16px;
            }

            .onboarding-title {
                font-size: 20px;
                font-weight: 700;
                color: var(--tx);
                flex: 1;
            }

            .onboarding-step-counter {
                background: var(--bg4);
                color: var(--tx2);
                padding: 4px 8px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
            }

            .onboarding-content {
                margin-bottom: 20px;
            }

            .onboarding-text {
                color: var(--tx2);
                line-height: 1.5;
                margin-bottom: 16px;
            }

            .onboarding-media {
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 16px;
                max-height: 200px;
                background: var(--bg2);
            }

            .onboarding-media img,
            .onboarding-media video {
                width: 100%;
                height: auto;
                display: block;
            }

            .onboarding-controls {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }

            .onboarding-btn {
                padding: 10px 20px;
                border-radius: 8px;
                border: none;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .onboarding-btn-primary {
                background: var(--b);
                color: white;
            }

            .onboarding-btn-primary:hover {
                background: var(--bd);
            }

            .onboarding-btn-secondary {
                background: transparent;
                color: var(--tx2);
                border: 1px solid var(--brd);
            }

            .onboarding-btn-secondary:hover {
                background: var(--bg4);
                color: var(--tx);
            }

            .onboarding-progress {
                display: flex;
                gap: 6px;
                margin: 16px 0;
            }

            .onboarding-progress-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--bg4);
                transition: background 0.2s;
            }

            .onboarding-progress-dot.active {
                background: var(--b);
            }

            .onboarding-progress-dot.completed {
                background: var(--green);
            }

            .onboarding-skip {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                color: var(--tx2);
                font-size: 14px;
                cursor: pointer;
                padding: 4px;
            }

            .onboarding-skip:hover {
                color: var(--tx);
            }

            .onboarding-target-highlight {
                position: relative !important;
                z-index: 10002 !important;
                box-shadow: 0 0 0 4px #3b82f6, 0 0 0 8px rgba(59, 130, 246, 0.4) !important;
                outline: 3px solid #3b82f6 !important;
                outline-offset: 2px !important;
                border-radius: 8px !important;
                animation: pulse-highlight 2s infinite;
            }

            @keyframes pulse-highlight {
                0%, 100% {
                    box-shadow: 0 0 0 4px var(--b), 0 0 0 8px rgba(59, 130, 246, 0.3);
                }
                50% {
                    box-shadow: 0 0 0 6px var(--b), 0 0 0 12px rgba(59, 130, 246, 0.2);
                }
            }

            .onboarding-pointer {
                position: fixed;
                z-index: 9998;
                pointer-events: none;
            }

            .onboarding-pointer::after {
                content: '';
                width: 0;
                height: 0;
                position: absolute;
                border: 12px solid transparent;
            }

            .onboarding-pointer.right::after {
                border-left-color: var(--b);
                left: -12px;
                top: 50%;
                transform: translateY(-50%);
            }

            .onboarding-pointer.left::after {
                border-right-color: var(--b);
                right: -12px;
                top: 50%;
                transform: translateY(-50%);
            }

            .onboarding-pointer.top::after {
                border-bottom-color: var(--b);
                bottom: -12px;
                left: 50%;
                transform: translateX(-50%);
            }

            .onboarding-pointer.bottom::after {
                border-top-color: var(--b);
                top: -12px;
                left: 50%;
                transform: translateX(-50%);
            }
        `;
        document.head.appendChild(style);
    }

    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.currentStep = 0;
        this.createOverlay();
        this.showStep();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'onboarding-overlay';

        const card = document.createElement('div');
        card.className = 'onboarding-card';

        card.innerHTML = `
            <button class="onboarding-skip" onclick="onboardingTour.skip()">×</button>
            <div class="onboarding-header">
                <h2 class="onboarding-title"></h2>
                <div class="onboarding-step-counter"></div>
            </div>
            <div class="onboarding-progress"></div>
            <div class="onboarding-content">
                <div class="onboarding-text"></div>
                <div class="onboarding-media"></div>
            </div>
            <div class="onboarding-controls">
                <button class="onboarding-btn onboarding-btn-secondary" onclick="onboardingTour.prev()">
                    ← Zurück
                </button>
                <div style="flex: 1"></div>
                <button class="onboarding-btn onboarding-btn-primary" onclick="onboardingTour.next()">
                    Weiter →
                </button>
            </div>
        `;

        this.overlay.appendChild(card);
        document.body.appendChild(this.overlay);

        // Trigger transition
        setTimeout(() => this.overlay.classList.add('active'), 10);
    }

    showStep() {
        const step = this.steps[this.currentStep];
        const card = this.overlay.querySelector('.onboarding-card');

        // Update content
        card.querySelector('.onboarding-title').textContent = step.title;
        card.querySelector('.onboarding-step-counter').textContent = `${this.currentStep + 1} / ${this.steps.length}`;
        card.querySelector('.onboarding-text').textContent = step.content;

        // Update progress dots
        this.updateProgress();

        // Handle media
        const mediaContainer = card.querySelector('.onboarding-media');
        mediaContainer.innerHTML = '';

        if (step.video) {
            const video = document.createElement('video');
            video.src = step.video;
            video.controls = true;
            video.autoplay = true;
            video.muted = true;
            mediaContainer.appendChild(video);
        } else if (step.image || step.screenshot) {
            const img = document.createElement('img');
            img.src = step.image || step.screenshot;
            img.alt = step.title;
            mediaContainer.appendChild(img);
        }

        // Handle target highlighting
        this.clearHighlight();
        if (step.target) {
            this.highlightTarget(step.target, step.position);
        }

        // Update buttons
        const prevBtn = card.querySelector('.onboarding-btn-secondary');
        const nextBtn = card.querySelector('.onboarding-btn-primary');

        prevBtn.style.display = this.currentStep > 0 ? 'flex' : 'none';

        if (step.final || this.currentStep === this.steps.length - 1) {
            nextBtn.textContent = 'Tour beenden';
            nextBtn.onclick = () => this.complete();
        } else {
            nextBtn.textContent = 'Weiter →';
            nextBtn.onclick = () => this.next();
        }
    }

    updateProgress() {
        const container = this.overlay.querySelector('.onboarding-progress');
        container.innerHTML = '';

        for (let i = 0; i < this.steps.length; i++) {
            const dot = document.createElement('div');
            dot.className = 'onboarding-progress-dot';

            if (i < this.currentStep) {
                dot.classList.add('completed');
            } else if (i === this.currentStep) {
                dot.classList.add('active');
            }

            container.appendChild(dot);
        }
    }

    highlightTarget(selector, position) {
        const target = document.querySelector(selector);
        if (!target) return;

        target.classList.add('onboarding-target-highlight');

        // Position overlay card relative to target
        if (position !== 'center') {
            this.positionCard(target, position);
        }
    }

    positionCard(target, position) {
        const card = this.overlay.querySelector('.onboarding-card');
        const rect = target.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        let left, top;

        switch (position) {
            case 'right':
                left = rect.right + 20;
                top = rect.top + (rect.height / 2) - (cardRect.height / 2);
                break;
            case 'left':
                left = rect.left - cardRect.width - 20;
                top = rect.top + (rect.height / 2) - (cardRect.height / 2);
                break;
            case 'top':
                left = rect.left + (rect.width / 2) - (cardRect.width / 2);
                top = rect.top - cardRect.height - 20;
                break;
            case 'bottom':
                left = rect.left + (rect.width / 2) - (cardRect.width / 2);
                top = rect.bottom + 20;
                break;
        }

        // Ensure card stays within viewport
        left = Math.max(20, Math.min(left, window.innerWidth - cardRect.width - 20));
        top = Math.max(20, Math.min(top, window.innerHeight - cardRect.height - 20));

        this.overlay.style.alignItems = 'flex-start';
        this.overlay.style.justifyContent = 'flex-start';
        card.style.position = 'absolute';
        card.style.left = left + 'px';
        card.style.top = top + 'px';
    }

    clearHighlight() {
        document.querySelectorAll('.onboarding-target-highlight').forEach(el => {
            el.classList.remove('onboarding-target-highlight');
        });
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else {
            this.complete();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep();
        }
    }

    skip() {
        this.complete();
    }

    complete() {
        this.isActive = false;
        localStorage.setItem('blun_onboarding_completed', 'true');

        this.overlay.classList.remove('active');
        setTimeout(() => {
            this.clearHighlight();
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.overlay = null;
        }, 300);
    }

    restart() {
        localStorage.removeItem('blun_onboarding_completed');
        this.start();
    }

    bindEvents() {
        // Listen for escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isActive) {
                this.skip();
            }
        });

        // Prevent clicks outside overlay
        document.addEventListener('click', (e) => {
            if (this.isActive && e.target === this.overlay) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    }
}

// Initialize onboarding tour
const onboardingTour = new OnboardingTour();

// Export for global access
window.onboardingTour = onboardingTour;