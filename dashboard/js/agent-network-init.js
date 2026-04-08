/**
 * Agent Network Graph — Initialization & Data Management
 * Runde 28 — Agents als visuelle Netzwerk-Nodes
 */

class AgentNetworkInit {
  constructor() {
    this.network = null;
    this.refreshInterval = null;
    this.containerSelector = '#page-agents';
  }

  init() {
    const container = document.querySelector(this.containerSelector);
    if (!container) {
      console.warn('[AgentNetworkInit] Container not found:', this.containerSelector);
      return;
    }

    // Create container for SVG
    const networkDiv = document.createElement('div');
    networkDiv.id = 'agentNetworkContainer';
    networkDiv.style.cssText = 'flex:1;overflow:auto;display:flex;flex-direction:column;padding:12px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:12px;color:var(--tx)';
    title.textContent = 'Agent Netzwerk';

    const graphContainer = document.createElement('div');
    graphContainer.id = 'agentNetworkGraph';
    graphContainer.style.cssText = 'flex:1;min-height:400px;background:#0f172a;border-radius:8px;border:1px solid var(--brd)';

    networkDiv.appendChild(title);
    networkDiv.appendChild(graphContainer);
    container.appendChild(networkDiv);

    // Initialize AgentNetwork
    if (window.AgentNetwork) {
      this.network = new AgentNetwork('agentNetworkGraph', {
        width: graphContainer.offsetWidth,
        height: graphContainer.offsetHeight || 500
      });

      // Load initial data
      this.loadAgentData();

      // Refresh every 10 seconds
      this.refreshInterval = setInterval(() => this.loadAgentData(), 10000);

      // Handle window resize
      window.addEventListener('resize', () => {
        if (this.network && this.network.container) {
          this.network.width = graphContainer.offsetWidth;
          this.network.height = graphContainer.offsetHeight;
          this.network.render();
        }
      });

      // Listen for agent graph clicks
      document.addEventListener('agent-graph-click', (e) => {
        this.onAgentClicked(e.detail.agentId);
      });
    }
  }

  loadAgentData() {
    // Mock data — in production würde das von /api/agents kommen
    const mockAgents = [
      { id: 'op-1', name: 'Dieter', department: 'operator', status: 'active', role: 'operator' },
      { id: 'ag-1', name: 'Fritz', department: 'backend', status: 'active', role: 'agent' },
      { id: 'ag-2', name: 'Klaus', department: 'devops', status: 'idle', role: 'agent' },
      { id: 'ag-3', name: 'Greta', department: 'backend', status: 'active', role: 'agent' },
      { id: 'ag-4', name: 'Guenter', department: 'devops', status: 'active', role: 'agent' },
      { id: 'ag-5', name: 'Maria', department: 'frontend', status: 'idle', role: 'agent' },
      { id: 'ag-6', name: 'Hans', department: 'security', status: 'active', role: 'agent' }
    ];

    const mockConnections = [
      { from_agent_id: 'op-1', to_agent_id: 'ag-1', type: 'active' },
      { from_agent_id: 'op-1', to_agent_id: 'ag-3', type: 'active' },
      { from_agent_id: 'ag-1', to_agent_id: 'ag-2', type: 'async' },
      { from_agent_id: 'ag-3', to_agent_id: 'ag-4', type: 'default' },
      { from_agent_id: 'ag-2', to_agent_id: 'ag-6', type: 'default' }
    ];

    const mockActiveChats = [
      { from: 'op-1', to: 'ag-1' },
      { from: 'op-1', to: 'ag-3' }
    ];

    if (this.network) {
      this.network.setData(mockAgents, mockConnections);
      this.network.setActiveChats(mockActiveChats);
      this.network.render();
    }
  }

  onAgentClicked(agentId) {
    console.log('[AgentNetworkInit] Agent clicked:', agentId);

    // Dispatch event to open chat or detail modal
    document.dispatchEvent(new CustomEvent('agent-selected', {
      detail: { agentId }
    }));

    // Optional: Open chat panel
    const chatPanel = document.querySelector('.page[id="page-chat"]');
    if (chatPanel) {
      // Switch to chat view
      if (typeof showPage === 'function') {
        showPage('chat');
      }
    }
  }

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

// Auto-init on page load
document.addEventListener('DOMContentLoaded', function() {
  if (typeof AgentNetwork !== 'undefined') {
    window._agentNetworkInit = new AgentNetworkInit();
    window._agentNetworkInit.init();
  }
});
