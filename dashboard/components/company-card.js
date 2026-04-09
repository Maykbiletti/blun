class CompanyCard {
    constructor(company, onCompanySwitch) {
        this.company = company;
        this.onCompanySwitch = onCompanySwitch;
        this.element = this.createCard();
    }

    createCard() {
        const card = document.createElement('div');
        card.className = 'company-card';
        card.innerHTML = `
            <div class="company-card-content">
                <div class="company-logo">
                    ${this.company.logo ?
                        `<img src="${this.company.logo}" alt="${this.company.name} Logo" />` :
                        `<div class="company-logo-fallback">${this.company.name.charAt(0)}</div>`
                    }
                </div>
                <div class="company-info">
                    <h3 class="company-name">${this.company.name}</h3>
                    <div class="company-stats">
                        <div class="stat-item">
                            <span class="stat-icon">👥</span>
                            <span class="stat-value">${this.company.agentCount || 0}</span>
                            <span class="stat-label">Agents</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-icon">✅</span>
                            <span class="stat-value">${this.company.completedTasks || 0}</span>
                            <span class="stat-label">Completed</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-icon">⏳</span>
                            <span class="stat-value">${this.company.pendingTasks || 0}</span>
                            <span class="stat-label">Pending</span>
                        </div>
                    </div>
                </div>
                <div class="company-actions">
                    <button class="switch-company-btn" data-company-id="${this.company.id}">
                        Switch
                    </button>
                </div>
            </div>
        `;

        this.attachStyles();
        this.attachEventListeners(card);

        return card;
    }

    attachEventListeners(card) {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('switch-company-btn')) {
                e.stopPropagation();
                this.switchCompany();
            } else {
                this.switchCompany();
            }
        });

        card.addEventListener('mouseenter', () => {
            card.classList.add('company-card-hover');
        });

        card.addEventListener('mouseleave', () => {
            card.classList.remove('company-card-hover');
        });
    }

    switchCompany() {
        if (this.onCompanySwitch && typeof this.onCompanySwitch === 'function') {
            this.onCompanySwitch(this.company.id);
        }
    }

    attachStyles() {
        if (!document.getElementById('company-card-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'company-card-styles';
            styleElement.textContent = `
                .company-card {
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 12px;
                    padding: 20px;
                    margin: 12px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                    min-width: 280px;
                    max-width: 320px;
                }

                .company-card:hover,
                .company-card-hover {
                    border-color: #0066cc;
                    box-shadow: 0 4px 16px rgba(0, 102, 204, 0.2);
                    transform: translateY(-2px);
                }

                .company-card-content {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .company-logo {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 60px;
                }

                .company-logo img {
                    max-width: 60px;
                    max-height: 60px;
                    border-radius: 8px;
                }

                .company-logo-fallback {
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #0066cc, #004499);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    font-size: 24px;
                    font-weight: bold;
                }

                .company-info {
                    text-align: center;
                }

                .company-name {
                    color: #ffffff;
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0 0 12px 0;
                }

                .company-stats {
                    display: flex;
                    justify-content: space-around;
                    gap: 8px;
                }

                .stat-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    flex: 1;
                }

                .stat-icon {
                    font-size: 16px;
                }

                .stat-value {
                    color: #0066cc;
                    font-size: 16px;
                    font-weight: bold;
                }

                .stat-label {
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .company-actions {
                    display: flex;
                    justify-content: center;
                }

                .switch-company-btn {
                    background: #0066cc;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 8px 16px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                .switch-company-btn:hover {
                    background: #0052a3;
                }

                .switch-company-btn:active {
                    transform: scale(0.98);
                }

                @media (max-width: 768px) {
                    .company-card {
                        min-width: 250px;
                        margin: 8px;
                        padding: 16px;
                    }

                    .company-name {
                        font-size: 16px;
                    }

                    .company-stats {
                        gap: 4px;
                    }

                    .stat-value {
                        font-size: 14px;
                    }

                    .stat-label {
                        font-size: 10px;
                    }
                }
            `;
            document.head.appendChild(styleElement);
        }
    }

    render() {
        return this.element;
    }

    update(companyData) {
        this.company = { ...this.company, ...companyData };
        const newCard = this.createCard();
        this.element.replaceWith(newCard);
        this.element = newCard;
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.remove();
        }
    }
}

// Company Cards Container
class CompanyCardsContainer {
    constructor(containerId, onCompanySwitch) {
        this.container = document.getElementById(containerId);
        this.onCompanySwitch = onCompanySwitch;
        this.cards = new Map();
    }

    addCompany(company) {
        const card = new CompanyCard(company, this.onCompanySwitch);
        this.cards.set(company.id, card);
        this.container.appendChild(card.render());
    }

    removeCompany(companyId) {
        const card = this.cards.get(companyId);
        if (card) {
            card.destroy();
            this.cards.delete(companyId);
        }
    }

    updateCompany(companyId, companyData) {
        const card = this.cards.get(companyId);
        if (card) {
            card.update(companyData);
        }
    }

    clear() {
        this.cards.forEach(card => card.destroy());
        this.cards.clear();
    }

    loadCompanies(companies) {
        this.clear();
        companies.forEach(company => this.addCompany(company));
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CompanyCard, CompanyCardsContainer };
} else if (typeof window !== 'undefined') {
    window.CompanyCard = CompanyCard;
    window.CompanyCardsContainer = CompanyCardsContainer;
}