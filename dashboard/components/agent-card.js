class AgentCard {
    constructor(agent) {
        this.agent = agent;
        this.element = null;
    }

    render() {
        const card = document.createElement('div');
        card.className = 'agent-card';

        const statusClass = this.getStatusClass(this.agent.status);
        const formattedTime = this.formatTimestamp(this.agent.lastUpdate);

        card.innerHTML = `
            <div class="agent-card__header">
                <h3 class="agent-card__name">${this.escapeHtml(this.agent.name)}</h3>
                <span class="agent-card__status ${statusClass}">${this.agent.status}</span>
            </div>
            <div class="agent-card__content">
                <div class="agent-card__task">
                    ${this.agent.lastTask ? this.escapeHtml(this.agent.lastTask) : 'Kein Task'}
                </div>
                <div class="agent-card__timestamp">${formattedTime}</div>
            </div>
        `;

        // Event listeners
        card.addEventListener('click', () => {
            this.onCardClick();
        });

        this.element = card;
        return card;
    }

    getStatusClass(status) {
        switch (status) {
            case 'busy':
                return 'agent-card__status--busy';
            case 'error':
                return 'agent-card__status--error';
            case 'idle':
            default:
                return 'agent-card__status--idle';
        }
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Nie';

        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `vor ${diffMins}m`;
        if (diffHours < 24) return `vor ${diffHours}h`;
        if (diffDays < 7) return `vor ${diffDays}d`;

        return date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    onCardClick() {
        // Emit custom event for parent to handle
        const event = new CustomEvent('agentCardClick', {
            detail: this.agent,
            bubbles: true
        });
        this.element.dispatchEvent(event);
    }

    updateAgent(newAgent) {
        this.agent = { ...this.agent, ...newAgent };
        if (this.element) {
            const newCard = this.render();
            this.element.replaceWith(newCard);
        }
    }

    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    // Static method to create multiple cards
    static renderList(agents, container) {
        if (!container) return;

        container.innerHTML = '';

        agents.forEach(agent => {
            const card = new AgentCard(agent);
            container.appendChild(card.render());
        });
    }

    // CSS styles as string for easy inclusion
    static getCSS() {
        return `
            .agent-card {
                background: #fff;
                border: 1px solid #e1e5e9;
                border-radius: 8px;
                padding: 16px;
                margin: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .agent-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                border-color: #007bff;
            }

            .agent-card__header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .agent-card__name {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #2c3e50;
            }

            .agent-card__status {
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
            }

            .agent-card__status--idle {
                background: #e8f5e8;
                color: #4caf50;
            }

            .agent-card__status--busy {
                background: #fff3cd;
                color: #ff9800;
            }

            .agent-card__status--error {
                background: #f8d7da;
                color: #dc3545;
            }

            .agent-card__content {
                color: #6c757d;
            }

            .agent-card__task {
                font-size: 14px;
                margin-bottom: 8px;
                font-weight: 500;
                color: #495057;
            }

            .agent-card__timestamp {
                font-size: 12px;
                color: #adb5bd;
            }

            @media (max-width: 768px) {
                .agent-card {
                    margin: 4px;
                    padding: 12px;
                }

                .agent-card__name {
                    font-size: 16px;
                }
            }
        `;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AgentCard;
}

// Global registration for direct HTML usage
if (typeof window !== 'undefined') {
    window.AgentCard = AgentCard;
}