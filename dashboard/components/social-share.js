/**
 * Social Share Component - BLUN Marketing
 * Share-Button-Komponente mit Copy-Link, Twitter/LinkedIn-Intent-URLs, Toast-Feedback
 */

class SocialShare extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.toastTimeout = null;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    static get observedAttributes() {
        return ['url', 'title', 'description', 'variant'];
    }

    attributeChangedCallback() {
        if (this.shadowRoot) {
            this.render();
        }
    }

    get shareData() {
        return {
            url: this.getAttribute('url') || window.location.href,
            title: this.getAttribute('title') || 'BLUN.ai - AI Agents Build Your Business',
            description: this.getAttribute('description') || 'Entdecke die Zukunft des Unternehmensaufbaus mit KI-Agenten. BLUN.ai macht Business-Building intelligent, schnell und erfolgreich.'
        };
    }

    get variant() {
        return this.getAttribute('variant') || 'default'; // default, compact, floating
    }

    getTwitterIntent() {
        const { url, title, description } = this.shareData;
        const text = `${title}\n\n${description}`;
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=BLUN,AI,Startup,AgentTech`;
    }

    getLinkedInIntent() {
        const { url, title, description } = this.shareData;
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&summary=${encodeURIComponent(description)}`;
    }

    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.shareData.url);
            this.showToast('Link kopiert! 📋', 'success');
        } catch (err) {
            // Fallback für ältere Browser
            this.fallbackCopy(this.shareData.url);
        }
    }

    fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            this.showToast('Link kopiert! 📋', 'success');
        } catch (err) {
            this.showToast('Kopieren fehlgeschlagen', 'error');
        }
        document.body.removeChild(textArea);
    }

    showToast(message, type = 'info') {
        // Toast-Container erstellen oder finden
        let toastContainer = document.querySelector('.social-share-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'social-share-toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                pointer-events: none;
            `;
            document.body.appendChild(toastContainer);
        }

        // Toast erstellen
        const toast = document.createElement('div');
        toast.className = `social-share-toast social-share-toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#6366F1'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            font-size: 14px;
            font-weight: 500;
            transform: translateX(100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: auto;
            max-width: 300px;
        `;

        toastContainer.appendChild(toast);

        // Animation einblenden
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });

        // Nach 3 Sekunden ausblenden
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                // Container entfernen wenn leer
                if (toastContainer.children.length === 0) {
                    document.body.removeChild(toastContainer);
                }
            }, 300);
        }, 3000);
    }

    setupEventListeners() {
        // Copy Button
        this.shadowRoot.querySelector('.copy-btn')?.addEventListener('click', () => {
            this.copyToClipboard();
        });

        // Twitter Button
        this.shadowRoot.querySelector('.twitter-btn')?.addEventListener('click', () => {
            window.open(this.getTwitterIntent(), '_blank', 'width=550,height=420');
            this.showToast('Twitter geöffnet! 🐦', 'info');
        });

        // LinkedIn Button
        this.shadowRoot.querySelector('.linkedin-btn')?.addEventListener('click', () => {
            window.open(this.getLinkedInIntent(), '_blank', 'width=550,height=420');
            this.showToast('LinkedIn geöffnet! 💼', 'info');
        });
    }

    getStyles() {
        return `
            <style>
                :host {
                    display: inline-block;
                }

                .share-container {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .share-container.compact {
                    gap: 4px;
                }

                .share-container.floating {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: white;
                    padding: 12px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    backdrop-filter: blur(10px);
                    z-index: 1000;
                }

                .share-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                    text-decoration: none;
                    min-width: 40px;
                    height: 40px;
                    position: relative;
                    overflow: hidden;
                }

                .compact .share-btn {
                    min-width: 32px;
                    height: 32px;
                    padding: 8px;
                    font-size: 12px;
                }

                .share-btn::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                    transform: translateX(-100%);
                    transition: transform 0.5s;
                }

                .share-btn:hover::before {
                    transform: translateX(100%);
                }

                .copy-btn {
                    background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
                    color: white;
                    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
                }

                .copy-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(99, 102, 241, 0.3);
                }

                .copy-btn:active {
                    transform: translateY(0);
                }

                .twitter-btn {
                    background: linear-gradient(135deg, #1DA1F2 0%, #0C7ABF 100%);
                    color: white;
                    box-shadow: 0 2px 4px rgba(29, 161, 242, 0.2);
                }

                .twitter-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(29, 161, 242, 0.3);
                }

                .linkedin-btn {
                    background: linear-gradient(135deg, #0A66C2 0%, #084B91 100%);
                    color: white;
                    box-shadow: 0 2px 4px rgba(10, 102, 194, 0.2);
                }

                .linkedin-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(10, 102, 194, 0.3);
                }

                .share-icon {
                    font-size: 18px;
                }

                .compact .share-icon {
                    font-size: 14px;
                }

                .share-label {
                    margin-left: 6px;
                    display: none;
                }

                @media (min-width: 768px) {
                    .share-btn {
                        padding: 10px 16px;
                    }

                    .share-label {
                        display: inline;
                    }

                    .compact .share-label {
                        display: none;
                    }
                }

                /* Animations */
                @keyframes shareScale {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }

                .share-btn:active {
                    animation: shareScale 0.2s ease;
                }

                /* Accessibility */
                .share-btn:focus {
                    outline: 2px solid #6366F1;
                    outline-offset: 2px;
                }
            </style>
        `;
    }

    getTemplate() {
        const variant = this.variant;

        return `
            ${this.getStyles()}
            <div class="share-container ${variant}">
                <button class="share-btn copy-btn" title="Link kopieren" aria-label="Link kopieren">
                    <span class="share-icon">📋</span>
                    <span class="share-label">Kopieren</span>
                </button>

                <button class="share-btn twitter-btn" title="Auf Twitter teilen" aria-label="Auf Twitter teilen">
                    <span class="share-icon">🐦</span>
                    <span class="share-label">Twitter</span>
                </button>

                <button class="share-btn linkedin-btn" title="Auf LinkedIn teilen" aria-label="Auf LinkedIn teilen">
                    <span class="share-icon">💼</span>
                    <span class="share-label">LinkedIn</span>
                </button>
            </div>
        `;
    }

    render() {
        this.shadowRoot.innerHTML = this.getTemplate();
        this.setupEventListeners();
    }
}

// Custom Element registrieren
customElements.define('social-share', SocialShare);

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocialShare;
}

// Usage Examples:
/*
// Standard
<social-share
    url="https://blun.ai"
    title="BLUN.ai - AI Agents Build Your Business"
    description="Entdecke die Zukunft des Unternehmensaufbaus mit KI-Agenten.">
</social-share>

// Kompakt
<social-share variant="compact"></social-share>

// Floating (schwebt rechts unten)
<social-share variant="floating"></social-share>

// Mit Custom Data
<social-share
    url="https://blun.ai/marketplace"
    title="BLUN Marketplace - AI Agent Skills"
    description="Über 50 spezialisierte AI-Agents für Marketing, Sales, Development und Business.">
</social-share>
*/