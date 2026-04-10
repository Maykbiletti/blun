class CostWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render();
    this.loadData();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #e2e8f0;
        }

        .widget-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          padding: 16px;
          background: #0f172a;
          border-radius: 12px;
          border: 1px solid #334155;
        }

        .cost-card {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          border: 1px solid #475569;
          border-radius: 8px;
          padding: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .cost-card:hover {
          transform: translateY(-2px);
          border-color: #60a5fa;
          box-shadow: 0 10px 25px rgba(96, 165, 250, 0.1);
        }

        .cost-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #3b82f6, #60a5fa, #93c5fd);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .cost-card:hover::before {
          opacity: 1;
        }

        .card-header {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-icon {
          width: 24px;
          height: 24px;
          margin-right: 12px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .icon-today {
          background: linear-gradient(135deg, #10b981, #059669);
        }

        .icon-week {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
        }

        .icon-month {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        }

        .card-title {
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .card-metrics {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .metric-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-label {
          font-size: 13px;
          color: #64748b;
        }

        .metric-value {
          font-size: 16px;
          font-weight: 700;
          color: #e2e8f0;
        }

        .cost-value {
          font-size: 24px;
          font-weight: 800;
          background: linear-gradient(135deg, #60a5fa, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-top: 8px;
        }

        .loading {
          opacity: 0.6;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.9; }
        }

        .trend-indicator {
          display: inline-flex;
          align-items: center;
          margin-left: 8px;
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .trend-up {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        .trend-down {
          color: #10b981;
          background: rgba(16, 185, 129, 0.1);
        }

        @media (max-width: 768px) {
          .widget-container {
            grid-template-columns: 1fr;
            padding: 12px;
            gap: 12px;
          }

          .cost-card {
            padding: 16px;
          }
        }
      </style>

      <div class="widget-container">
        <div class="cost-card loading" id="todayCard">
          <div class="card-header">
            <div class="card-icon icon-today">📅</div>
            <div class="card-title">Today</div>
          </div>
          <div class="card-metrics">
            <div class="metric-row">
              <span class="metric-label">Tokens</span>
              <span class="metric-value" id="todayTokens">-</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Requests</span>
              <span class="metric-value" id="todayRequests">-</span>
            </div>
          </div>
          <div class="cost-value" id="todayCost">$0.00</div>
        </div>

        <div class="cost-card loading" id="weekCard">
          <div class="card-header">
            <div class="card-icon icon-week">📊</div>
            <div class="card-title">This Week</div>
          </div>
          <div class="card-metrics">
            <div class="metric-row">
              <span class="metric-label">Tokens</span>
              <span class="metric-value" id="weekTokens">-</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Requests</span>
              <span class="metric-value" id="weekRequests">-</span>
            </div>
          </div>
          <div class="cost-value" id="weekCost">$0.00</div>
        </div>

        <div class="cost-card loading" id="monthCard">
          <div class="card-header">
            <div class="card-icon icon-month">📈</div>
            <div class="card-title">This Month</div>
          </div>
          <div class="card-metrics">
            <div class="metric-row">
              <span class="metric-label">Tokens</span>
              <span class="metric-value" id="monthTokens">-</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Requests</span>
              <span class="metric-value" id="monthRequests">-</span>
            </div>
          </div>
          <div class="cost-value" id="monthCost">$0.00</div>
        </div>
      </div>
    `;
  }

  async loadData() {
    try {
      // Simulate API call - replace with actual endpoint
      const response = await fetch('/api/usage-stats').catch(() => ({
        ok: false,
        json: () => Promise.resolve(this.getMockData())
      }));

      const data = response.ok ? await response.json() : this.getMockData();
      this.updateMetrics(data);
    } catch (error) {
      console.warn('Failed to load cost data, using mock data:', error);
      this.updateMetrics(this.getMockData());
    }
  }

  getMockData() {
    return {
      today: {
        tokens: 45672,
        requests: 238,
        cost: 2.84,
        trend: 'up'
      },
      week: {
        tokens: 312456,
        requests: 1547,
        cost: 19.67,
        trend: 'down'
      },
      month: {
        tokens: 1234567,
        requests: 6789,
        cost: 78.23,
        trend: 'up'
      }
    };
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  formatCost(cost) {
    return '$' + cost.toFixed(2);
  }

  updateMetrics(data) {
    // Update today
    this.shadowRoot.getElementById('todayTokens').textContent = this.formatNumber(data.today.tokens);
    this.shadowRoot.getElementById('todayRequests').textContent = this.formatNumber(data.today.requests);
    this.shadowRoot.getElementById('todayCost').textContent = this.formatCost(data.today.cost);

    // Update week
    this.shadowRoot.getElementById('weekTokens').textContent = this.formatNumber(data.week.tokens);
    this.shadowRoot.getElementById('weekRequests').textContent = this.formatNumber(data.week.requests);
    this.shadowRoot.getElementById('weekCost').textContent = this.formatCost(data.week.cost);

    // Update month
    this.shadowRoot.getElementById('monthTokens').textContent = this.formatNumber(data.month.tokens);
    this.shadowRoot.getElementById('monthRequests').textContent = this.formatNumber(data.month.requests);
    this.shadowRoot.getElementById('monthCost').textContent = this.formatCost(data.month.cost);

    // Remove loading state
    this.shadowRoot.querySelectorAll('.loading').forEach(card => {
      card.classList.remove('loading');
    });
  }

  connectedCallback() {
    // Auto-refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadData();
    }, 5 * 60 * 1000);
  }

  disconnectedCallback() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

customElements.define('cost-widget', CostWidget);