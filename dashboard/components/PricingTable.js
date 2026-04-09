/**
 * PricingTable.js - React Pricing Component
 * Tailwind Styling, 3 Tarifspalten mit Toggle
 */

let pricingData = {
  monthly: {
    free: { price: 0, period: 'Monat' },
    pro: { price: 29, period: 'Monat' },
    enterprise: { price: 99, period: 'Monat' }
  },
  yearly: {
    free: { price: 0, period: 'Jahr' },
    pro: { price: 290, period: 'Jahr' },
    enterprise: { price: 990, period: 'Jahr' }
  }
};

let pricingState = {
  isYearly: false
};

function togglePricing() {
  pricingState.isYearly = !pricingState.isYearly;
  renderPricingTable();
}

function renderPricingToggle() {
  return `
    <div class="flex items-center justify-center mb-12">
      <span class="text-sm font-medium ${!pricingState.isYearly ? 'text-blue-600' : 'text-gray-600'}">Monatlich</span>
      <button
        onclick="togglePricing()"
        class="relative mx-4 w-14 h-7 bg-gray-200 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${pricingState.isYearly ? 'bg-blue-600' : ''}"
        aria-label="Zwischen monatlich und jährlich wechseln"
      >
        <span class="absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${pricingState.isYearly ? 'transform translate-x-7' : ''}"></span>
      </button>
      <span class="text-sm font-medium ${pricingState.isYearly ? 'text-blue-600' : 'text-gray-600'}">
        Jährlich
        <span class="text-xs text-green-600 ml-1">-20%</span>
      </span>
    </div>
  `;
}

function renderPricingCard(plan, data, isPopular = false) {
  const currentData = pricingState.isYearly ? pricingData.yearly[plan] : pricingData.monthly[plan];

  let features = [];
  if (plan === 'free') {
    features = ['5 KI-Unterhaltungen', 'Standard-Templates', 'Community Support'];
  } else if (plan === 'pro') {
    features = ['Unbegrenzte Unterhaltungen', 'Premium-Templates', 'Priority Support', 'API-Zugang', 'Custom Branding'];
  } else {
    features = ['Alles aus Pro', 'Dedicated Support', 'SLA Garantie', 'Custom Integrations', 'Team Management'];
  }

  const titles = {
    free: 'Free',
    pro: 'Pro',
    enterprise: 'Enterprise'
  };

  const descriptions = {
    free: 'Perfekt zum Ausprobieren',
    pro: 'Für professionelle Nutzer',
    enterprise: 'Für große Organisationen'
  };

  return `
    <div class="relative bg-white rounded-2xl shadow-lg border-2 ${isPopular ? 'border-blue-500 scale-105' : 'border-gray-100'} p-8 transition-all duration-300 hover:shadow-xl">
      ${isPopular ? `
        <div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span class="bg-blue-500 text-white px-4 py-1 rounded-full text-xs font-medium">Beliebtester Plan</span>
        </div>
      ` : ''}

      <div class="text-center mb-8">
        <h3 class="text-2xl font-bold text-gray-900 mb-2">${titles[plan]}</h3>
        <p class="text-gray-600 text-sm mb-4">${descriptions[plan]}</p>

        <div class="mb-6">
          <span class="text-5xl font-bold text-gray-900">${currentData.price === 0 ? 'Kostenlos' : '€' + currentData.price}</span>
          ${currentData.price > 0 ? `<span class="text-gray-600 ml-1">/${currentData.period}</span>` : ''}
        </div>

        <button class="w-full py-3 px-6 rounded-lg font-medium transition-all duration-300 min-h-[44px] ${
          isPopular
            ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
            : 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500'
        } focus:outline-none focus:ring-offset-2">
          ${plan === 'free' ? 'Kostenlos starten' : plan === 'enterprise' ? 'Kontakt' : 'Pro starten'}
        </button>
      </div>

      <div class="space-y-3">
        ${features.map(feature => `
          <div class="flex items-center">
            <svg class="w-5 h-5 text-green-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <span class="text-gray-700 text-sm">${feature}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPricingTable() {
  const container = document.getElementById('pricing-table');
  if (!container) return;

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-12">
      <div class="text-center mb-16">
        <h2 class="text-4xl font-bold text-gray-900 mb-4">Preise & Pläne</h2>
        <p class="text-xl text-gray-600">Wählen Sie den perfekten Plan für Ihre Bedürfnisse</p>
      </div>

      ${renderPricingToggle()}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
        ${renderPricingCard('free', pricingData)}
        ${renderPricingCard('pro', pricingData, true)}
        ${renderPricingCard('enterprise', pricingData)}
      </div>

      <div class="text-center mt-12">
        <p class="text-gray-600 text-sm">
          Alle Preise inklusive MwSt. •
          <a href="#" class="text-blue-600 hover:underline">Häufige Fragen</a> •
          <a href="#" class="text-blue-600 hover:underline">Kontakt</a>
        </p>
      </div>
    </div>
  `;
}

// Export für Verwendung in anderen Dateien
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderPricingTable,
    togglePricing,
    pricingState,
    pricingData
  };
}

// Auto-render wenn DOM geladen
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    renderPricingTable();
  });
}