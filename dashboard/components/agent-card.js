/**
 * AgentCard Component - Wiederverwendbare Agent-Karte
 *
 * @param {Object} props - Agent-Eigenschaften
 * @param {string} props.name - Agent Name
 * @param {string} props.status - Agent Status (active, idle, error, etc.)
 * @param {number} props.taskCount - Anzahl Tasks
 * @param {number} props.errorCount - Anzahl Errors
 * @returns {HTMLDivElement} DOM-Node der Agent-Karte
 */
function renderAgentCard(props) {
    const { name, status, taskCount = 0, errorCount = 0 } = props;

    // Agent-Karte Container erstellen
    const agentItem = document.createElement('div');
    agentItem.className = 'agent-item';

    // Agent Info Section
    const agentInfo = document.createElement('div');
    agentInfo.className = 'agent-info';

    // Agent Name
    const agentName = document.createElement('div');
    agentName.className = 'agent-name';
    agentName.textContent = name || 'Unknown Agent';

    // Agent Details (Tasks & Errors)
    const agentDetails = document.createElement('div');
    agentDetails.className = 'agent-details';

    // Task Info zusammenstellen
    const taskInfo = taskCount > 0 ? `${taskCount} Tasks` : 'No Tasks';
    const errorInfo = errorCount > 0 ? `${errorCount} Errors` : 'No Errors';
    agentDetails.textContent = `${taskInfo} • ${errorInfo}`;

    // Error-Count speziell hervorheben wenn > 0
    if (errorCount > 0) {
        agentDetails.classList.add('has-errors');
    }

    // Agent Info zusammenbauen
    agentInfo.appendChild(agentName);
    agentInfo.appendChild(agentDetails);

    // Agent Status Section
    const agentStatus = document.createElement('div');
    agentStatus.className = `agent-status status-${status.toLowerCase()}`;
    agentStatus.textContent = status;

    // Alles zusammenfügen
    agentItem.appendChild(agentInfo);
    agentItem.appendChild(agentStatus);

    return agentItem;
}

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderAgentCard };
}

// Global verfügbar machen für Browser
if (typeof window !== 'undefined') {
    window.renderAgentCard = renderAgentCard;
}