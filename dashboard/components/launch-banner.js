/**
 * BLUN Marketplace Launch Banner
 * Marketing-optimierte Komponente mit starkem CTA
 */

class LaunchBanner {
    constructor() {
        this.isVisible = this.checkVisibility();
        this.init();
    }

    checkVisibility() {
        // Banner nur anzeigen wenn Marketplace-Feature aktiv
        const dismissed = localStorage.getItem('blun-launch-banner-dismissed');
        return !dismissed;
    }

    init() {
        if (!this.isVisible) return;

        this.render();
        this.bindEvents();
        this.animate();
    }

    render() {
        const bannerHTML = `
            <div id="launch-banner" class="launch-banner">
                <div class="launch-banner-content">
                    <div class="launch-banner-icon">
                        🚀
                    </div>
                    <div class="launch-banner-text">
                        <h3 class="launch-banner-headline">
                            Der BLUN Marketplace ist live!
                        </h3>
                        <p class="launch-banner-subtitle">
                            Entdecke KI-Agent Skills, die dein Business auf das nächste Level bringen.
                        </p>
                    </div>
                    <div class="launch-banner-actions">
                        <button class="launch-banner-cta" data-action="explore">
                            Marketplace erkunden
                        </button>
                        <button class="launch-banner-dismiss" data-action="dismiss" title="Banner ausblenden">
                            ×
                        </button>
                    </div>
                </div>
                <div class="launch-banner-gradient"></div>
            </div>
        `;

        // Insert at top of dashboard
        const dashboard = document.querySelector('.dashboard-main') || document.body;
        dashboard.insertAdjacentHTML('afterbegin', bannerHTML);

        this.addStyles();
    }

    addStyles() {
        const styles = `
            <style>
                .launch-banner {
                    position: relative;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    margin-bottom: 20px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
                    overflow: hidden;
                    animation: slideDown 0.6s ease-out;
                }

                .launch-banner-content {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    position: relative;
                    z-index: 2;
                }

                .launch-banner-icon {
                    font-size: 2.5rem;
                    animation: bounce 2s infinite;
                }

                .launch-banner-text {
                    flex: 1;
                }

                .launch-banner-headline {
                    margin: 0 0 4px 0;
                    font-size: 1.3rem;
                    font-weight: 700;
                    line-height: 1.3;
                }

                .launch-banner-subtitle {
                    margin: 0;
                    font-size: 0.95rem;
                    opacity: 0.95;
                    line-height: 1.4;
                }

                .launch-banner-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .launch-banner-cta {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                }

                .launch-banner-cta:hover {
                    background: rgba(255, 255, 255, 0.3);
                    border-color: rgba(255, 255, 255, 0.5);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 16px rgba(255, 255, 255, 0.2);
                }

                .launch-banner-dismiss {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 1.5rem;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    line-height: 1;
                }

                .launch-banner-dismiss:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .launch-banner-gradient {
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 200px;
                    height: 100%;
                    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 100%);
                    pointer-events: none;
                }

                @keyframes slideDown {
                    from {
                        transform: translateY(-100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                @keyframes bounce {
                    0%, 20%, 50%, 80%, 100% {
                        transform: translateY(0);
                    }
                    40% {
                        transform: translateY(-8px);
                    }
                    60% {
                        transform: translateY(-4px);
                    }
                }

                @media (max-width: 768px) {
                    .launch-banner {
                        padding: 16px;
                    }

                    .launch-banner-content {
                        flex-direction: column;
                        text-align: center;
                        gap: 12px;
                    }

                    .launch-banner-text {
                        order: 2;
                    }

                    .launch-banner-icon {
                        order: 1;
                        font-size: 2rem;
                    }

                    .launch-banner-actions {
                        order: 3;
                        justify-content: center;
                        width: 100%;
                    }

                    .launch-banner-cta {
                        flex: 1;
                        max-width: 200px;
                    }

                    .launch-banner-headline {
                        font-size: 1.1rem;
                    }

                    .launch-banner-subtitle {
                        font-size: 0.9rem;
                    }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    bindEvents() {
        const banner = document.getElementById('launch-banner');
        if (!banner) return;

        // CTA Button - Navigate to Marketplace
        const ctaButton = banner.querySelector('.launch-banner-cta');
        ctaButton?.addEventListener('click', () => {
            this.trackClick('marketplace-cta');
            this.navigateToMarketplace();
        });

        // Dismiss Button
        const dismissButton = banner.querySelector('.launch-banner-dismiss');
        dismissButton?.addEventListener('click', () => {
            this.trackClick('dismiss');
            this.dismiss();
        });

        // Auto-dismiss after 30 seconds
        setTimeout(() => {
            if (document.getElementById('launch-banner')) {
                this.dismiss(true);
            }
        }, 30000);
    }

    navigateToMarketplace() {
        // Try different marketplace routes
        const marketplaceRoutes = [
            '/marketplace',
            '/agents/marketplace',
            '#marketplace',
            '?view=marketplace'
        ];

        // Check if marketplace route exists
        if (window.location.pathname.includes('marketplace')) {
            // Already on marketplace, scroll to top
            window.scrollTo(0, 0);
            return;
        }

        // Try to navigate to marketplace
        if (window.router && window.router.navigate) {
            window.router.navigate('/marketplace');
        } else if (window.location.hash) {
            window.location.hash = 'marketplace';
        } else {
            // Fallback: reload with marketplace parameter
            window.location.href = window.location.origin + '?view=marketplace';
        }
    }

    dismiss(auto = false) {
        const banner = document.getElementById('launch-banner');
        if (!banner) return;

        // Store dismissal
        localStorage.setItem('blun-launch-banner-dismissed', Date.now().toString());

        // Animate out
        banner.style.animation = 'slideUp 0.4s ease-in forwards';

        setTimeout(() => {
            banner.remove();
        }, 400);

        // Track dismissal
        this.trackClick(auto ? 'auto-dismiss' : 'manual-dismiss');
    }

    animate() {
        // Add periodic pulse to CTA button
        const ctaButton = document.querySelector('.launch-banner-cta');
        if (!ctaButton) return;

        setInterval(() => {
            ctaButton.style.animation = 'none';
            setTimeout(() => {
                ctaButton.style.animation = 'pulse 0.6s ease-in-out';
            }, 100);
        }, 8000);
    }

    trackClick(action) {
        // Analytics tracking
        if (window.analytics) {
            window.analytics.track('Launch Banner Interaction', {
                action: action,
                timestamp: Date.now(),
                source: 'launch-banner'
            });
        }

        // Console log for debugging
        console.log('Launch Banner:', action);
    }
}

// Additional CSS for animations
document.head.insertAdjacentHTML('beforeend', `
    <style>
        @keyframes slideUp {
            to {
                transform: translateY(-100%);
                opacity: 0;
            }
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    </style>
`);

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.launchBanner = new LaunchBanner();
    });
} else {
    window.launchBanner = new LaunchBanner();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LaunchBanner;
}