/**
 * Agent Network Graph — SVG-basiertes Netzwerk-Visualisierungs-Tool
 * Abteilungsfarben, Operator-Knoten, pulsierende Chat-Linien
 * Runde 28
 */

class AgentNetwork {
  constructor(containerId, opts = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`[AgentNetwork] Container #${containerId} not found`);
      return;
    }
    this.width = opts.width || 1000;
    this.height = opts.height || 600;
    this.nodes = [];
    this.edges = [];
    this.onNodeClick = opts.onNodeClick || null;
    this.selectedNode = null;
    this.activeChats = new Set();
    this.simulation = null;
  }

  static DEPT_COLORS = {
    devops: '#22c55e',
    backend: '#3b82f6',
    frontend: '#f97316',
    security: '#ef4444',
    data: '#f59e0b',
    default: '#a855f7'
  };

  setData(agents, connections = []) {
    if (!agents || agents.length === 0) return;

    const operatorCount = agents.filter(a => a.role === 'operator').length;
    const regularCount = agents.length - operatorCount;
    let opIdx = 0, regIdx = 0;

    this.nodes = agents.map(a => {
      const isOperator = a.role === 'operator';
      let x, y;

      if (isOperator) {
        // Operator mittig, leicht versetzt bei mehreren
        x = this.width / 2 + (opIdx - (operatorCount - 1) / 2) * 80;
        y = this.height / 2;
        opIdx++;
      } else {
        // Reguläre Agents im Kreis drumherum
        const angle = (2 * Math.PI * regIdx) / Math.max(regularCount, 1) - Math.PI / 2;
        const radius = Math.min(this.width, this.height) * 0.35;
        x = this.width / 2 + Math.cos(angle) * radius;
        y = this.height / 2 + Math.sin(angle) * radius;
        regIdx++;
      }

      return {
        id: a.id || `agent-${Math.random()}`,
        label: a.name || a.agent_name || 'Unknown',
        dept: (a.department || 'default').toLowerCase(),
        status: a.status || 'idle',
        role: a.role || 'agent',
        x, y,
        vx: 0,
        vy: 0
      };
    });

    this.edges = connections.map(c => ({
      from: c.from_agent_id || c.from,
      to: c.to_agent_id || c.to,
      type: c.type || 'default'
    }));
  }

  setActiveChats(chatPairs) {
    if (!Array.isArray(chatPairs)) return;
    this.activeChats = new Set(chatPairs.map(p => `${p.from}:${p.to}`));
  }

  render() {
    if (!this.container || this.nodes.length === 0) return;

    const nodeMap = Object.fromEntries(this.nodes.map(n => [n.id, n]));
    const colors = AgentNetwork.DEPT_COLORS;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" style="width:100%;height:100%;background:#0f172a;border-radius:8px;">`;

    // Defs: Arrow, Glow, Pulse, Gradient
    svg += `<defs>`;
    svg += `<marker id="net-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#475569"/></marker>`;
    svg += `<filter id="net-glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    svg += `<style>
      @keyframes pulse-line { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      @keyframes pulse-dot { 0%, 100% { r: 5; opacity: 1; } 50% { r: 8; opacity: 0.3; } }
      .active-line { animation: pulse-line 1.5s ease-in-out infinite; }
      .active-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
    </style>`;
    svg += `</defs>`;

    // Edges
    for (const edge of this.edges) {
      const from = nodeMap[edge.from];
      const to = nodeMap[edge.to];
      if (!from || !to) continue;

      const chatKey = `${edge.from}:${edge.to}`;
      const chatKeyRev = `${edge.to}:${edge.from}`;
      const isActive = this.activeChats.has(chatKey) || this.activeChats.has(chatKeyRev);

      const fromR = from.role === 'operator' ? 32 : 22;
      const toR = to.role === 'operator' ? 32 : 22;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const x1 = from.x + (dx / dist) * fromR;
      const y1 = from.y + (dy / dist) * fromR;
      const x2 = to.x - (dx / dist) * (toR + 8);
      const y2 = to.y - (dy / dist) * (toR + 8);

      if (isActive) {
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#22c55e" stroke-width="2.5" marker-end="url(#net-arrow)" class="active-line"/>`;
      } else {
        const dash = edge.type === 'async' ? ' stroke-dasharray="6,4"' : '';
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#334155" stroke-width="1.5" marker-end="url(#net-arrow)"${dash}/>`;
      }
    }

    // Nodes
    for (const node of this.nodes) {
      const color = colors[node.dept] || colors.default;
      const isOperator = node.role === 'operator';
      const isSelected = this.selectedNode === node.id;
      const r = isOperator ? 32 : 22;
      const statusRing = { active: '#22c55e', idle: '#475569', error: '#ef4444' };
      const ring = statusRing[node.status] || statusRing.idle;

      svg += `<g class="agent-node" data-agent-id="${node.id}" style="cursor:pointer;" ${isSelected ? 'filter="url(#net-glow)"' : ''}>`;

      // Status-Ring
      svg += `<circle cx="${node.x}" cy="${node.y}" r="${r + 4}" fill="none" stroke="${ring}" stroke-width="${isOperator ? 3 : 2}" opacity="0.7"/>`;

      // Hauptkreis
      svg += `<circle cx="${node.x}" cy="${node.y}" r="${r}" fill="${color}" opacity="0.9"/>`;

      // Operator-Markierung: innerer Ring
      if (isOperator) {
        svg += `<circle cx="${node.x}" cy="${node.y}" r="${r - 6}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
      }

      // Label
      const maxChars = isOperator ? 16 : 12;
      const fontSize = isOperator ? 11 : 10;
      svg += `<text x="${node.x}" y="${node.y + 4}" text-anchor="middle" fill="#fff" font-size="${fontSize}" font-weight="${isOperator ? 'bold' : 'normal'}" font-family="sans-serif">${this.escapeXml(node.label.substring(0, maxChars))}</text>`;

      // Abteilungs-Badge unten
      svg += `<text x="${node.x}" y="${node.y + r + 14}" text-anchor="middle" fill="${color}" font-size="9" font-family="sans-serif" opacity="0.8">${this.escapeXml(node.dept)}</text>`;

      // Active-Pulse
      if (node.status === 'active') {
        svg += `<circle cx="${node.x + r - 4}" cy="${node.y - r + 4}" r="5" fill="#22c55e" class="active-pulse"/>`;
      }

      svg += `</g>`;
    }

    // Legende
    svg += this.renderLegend(colors);

    // Tooltip
    svg += `<rect id="net-tooltip-bg" x="0" y="0" width="0" height="0" rx="4" fill="#1e293b" stroke="#334155" stroke-width="1" opacity="0" pointer-events="none"/>`;
    svg += `<text id="net-tooltip-text" x="0" y="0" fill="#e2e8f0" font-size="11" font-family="sans-serif" opacity="0" pointer-events="none"></text>`;

    svg += '</svg>';
    this.container.innerHTML = svg;
    this.bindClicks();
  }

  renderLegend(colors) {
    let svg = '';
    const entries = Object.entries(colors).filter(([k]) => k !== 'default');
    const startX = 16;
    const startY = this.height - 20;

    entries.forEach(([dept, color], i) => {
      const x = startX + i * 90;
      svg += `<circle cx="${x}" cy="${startY}" r="5" fill="${color}" opacity="0.9"/>`;
      svg += `<text x="${x + 10}" y="${startY + 4}" fill="#94a3b8" font-size="10" font-family="sans-serif">${dept}</text>`;
    });

    return svg;
  }

  bindClicks() {
    if (!this.container) return;

    this.container.querySelectorAll('.agent-node').forEach(g => {
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        const agentId = g.getAttribute('data-agent-id');
        this.selectedNode = agentId;

        if (this.onNodeClick) {
          this.onNodeClick(agentId);
        }

        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('agent-graph-click', {
          detail: { agentId }
        }));

        this.render();
      });

      g.addEventListener('mouseenter', () => {
        const agentId = g.getAttribute('data-agent-id');
        const node = this.nodes.find(n => n.id === agentId);
        if (node) this.showTooltip(node);
      });

      g.addEventListener('mouseleave', () => this.hideTooltip());
    });
  }

  showTooltip(node) {
    if (!this.container) return;

    const bg = this.container.querySelector('#net-tooltip-bg');
    const text = this.container.querySelector('#net-tooltip-text');
    if (!bg || !text) return;

    const label = `${node.label} (${node.dept}) — ${node.status}${node.role === 'operator' ? ' [Operator]' : ''}`;
    text.textContent = label;
    text.setAttribute('x', node.x);
    text.setAttribute('y', node.y - (node.role === 'operator' ? 46 : 36));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('opacity', '1');

    const w = label.length * 6.5 + 16;
    bg.setAttribute('x', node.x - w / 2);
    bg.setAttribute('y', node.y - (node.role === 'operator' ? 58 : 48));
    bg.setAttribute('width', w);
    bg.setAttribute('height', 22);
    bg.setAttribute('opacity', '0.95');
  }

  hideTooltip() {
    if (!this.container) return;

    const bg = this.container.querySelector('#net-tooltip-bg');
    const text = this.container.querySelector('#net-tooltip-text');
    if (bg) bg.setAttribute('opacity', '0');
    if (text) text.setAttribute('opacity', '0');
  }

  escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

if (typeof module !== 'undefined') module.exports = { AgentNetwork };
