/**
 * Agent Status Bar Component - Schmale Status-Leiste mit farbigen Agent-Dots
 *
 * @param {Array} agents - Array von Agent-Objekten
 * @param {string} agents[].name - Agent Name
 * @param {string} agents[].status - Agent Status ('running', 'stopped', 'error')
 * @returns {HTMLDivElement} DOM-Node der Status-Leiste
 */
function renderAgentStatusBar(agents = []) {
    // Status-Leiste Container erstellen
    const statusBar = document.createElement('div');
    statusBar.className = 'agent-status-bar';
    statusBar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
        height: 40px;
        overflow-x: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // Label hinzufügen
    const label = document.createElement('span');
    label.textContent = 'Agents:';
    label.style.cssText = `
        color: #888;
        font-size: 12px;
        white-space: nowrap;
        margin-right: 4px;
    `;
    statusBar.appendChild(label);

    // Agent Dots Container
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'agent-dots';
    dotsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
    `;

    // Für jeden Agent einen Dot erstellen
    agents.forEach(agent => {
        const dot = createAgentDot(agent);
        dotsContainer.appendChild(dot);
    });

    statusBar.appendChild(dotsContainer);
    return statusBar;
}

/**
 * Erstellt einen farbigen Dot für einen Agent
 * @param {Object} agent - Agent-Daten
 * @param {string} agent.name - Agent Name
 * @param {string} agent.status - Agent Status
 * @returns {HTMLDivElement} Dot-Element
 */
function createAgentDot(agent) {
    const dot = document.createElement('div');
    dot.className = 'agent-dot';

    // Status-Farben definieren
    const statusColors = {
        running: '#22c55e',  // Grün
        stopped: '#6b7280',  // Grau
        error: '#ef4444'     // Rot
    };

    const color = statusColors[agent.status] || statusColors.stopped;

    dot.style.cssText = `
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: ${color};
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
    `;

    // Pulsing-Effekt für running Status
    if (agent.status === 'running') {
        dot.style.animation = 'pulse 2s ease-in-out infinite';

        // CSS Animation über Style-Tag hinzufügen
        if (!document.querySelector('#agent-status-bar-styles')) {
            const style = document.createElement('style');
            style.id = 'agent-status-bar-styles';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                .agent-dot:hover {
                    transform: scale(1.2);
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Tooltip erstellen
    createTooltip(dot, agent);

    return dot;
}

/**
 * Erstellt Tooltip-Funktionalität für einen Agent-Dot
 * @param {HTMLElement} dotElement - Dot-Element
 * @param {Object} agent - Agent-Daten
 */
function createTooltip(dotElement, agent) {
    let tooltip = null;

    // Tooltip bei Hover anzeigen
    dotElement.addEventListener('mouseenter', (e) => {
        tooltip = document.createElement('div');
        tooltip.className = 'agent-tooltip';
        tooltip.textContent = agent.name;
        tooltip.style.cssText = `
            position: absolute;
            background: #333;
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            transform: translateX(-50%);
            bottom: 20px;
            left: 50%;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;

        dotElement.style.position = 'relative';
        dotElement.appendChild(tooltip);

        // Tooltip einblenden
        requestAnimationFrame(() => {
            if (tooltip) tooltip.style.opacity = '1';
        });
    });

    // Tooltip bei Hover-Ende entfernen
    dotElement.addEventListener('mouseleave', () => {
        if (tooltip) {
            tooltip.style.opacity = '0';
            setTimeout(() => {
                if (tooltip && tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
                tooltip = null;
            }, 200);
        }
    });
}

/**
 * Update-Funktion für die Status-Leiste
 * @param {HTMLElement} statusBarElement - Existierende Status-Leiste
 * @param {Array} agents - Neue Agent-Daten
 */
function updateAgentStatusBar(statusBarElement, agents) {
    const dotsContainer = statusBarElement.querySelector('.agent-dots');
    if (!dotsContainer) return;

    // Container leeren
    dotsContainer.innerHTML = '';

    // Neue Dots hinzufügen
    agents.forEach(agent => {
        const dot = createAgentDot(agent);
        dotsContainer.appendChild(dot);
    });
}

// Export für Modul-System
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderAgentStatusBar,
        updateAgentStatusBar,
        createAgentDot
    };
}