/**
 * Skill Card Component
 * Rendert eine Skill-Karte mit Name, Beschreibung, Status-Badge und Toggle-Button
 */

function renderSkillCard(skill) {
  // Erstelle das Karten-Container-Element
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.setAttribute('data-skill-id', skill.id);

  // Erstelle den HTML-Inhalt der Karte
  card.innerHTML = `
    <div class="skill-card-header">
      <div class="skill-info">
        <h3 class="skill-name">${escapeHtml(skill.name)}</h3>
        <span class="skill-status-badge ${skill.active ? 'active' : 'inactive'}">
          ${skill.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <button class="skill-toggle-btn" data-skill-id="${skill.id}" title="Toggle skill status">
        <span class="toggle-icon">${skill.active ? '⏸' : '▶'}</span>
      </button>
    </div>
    <div class="skill-card-body">
      <p class="skill-description">${escapeHtml(skill.description || 'Keine Beschreibung verfügbar')}</p>
    </div>
  `;

  // Event Listener für den Toggle-Button
  const toggleBtn = card.querySelector('.skill-toggle-btn');
  toggleBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const skillId = e.currentTarget.getAttribute('data-skill-id');

    try {
      // Loading-State setzen
      toggleBtn.disabled = true;
      toggleBtn.innerHTML = '<span class="loading-spinner">⏳</span>';

      // API-Call für Toggle
      const response = await fetch(`/api/v1/skills/${skillId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Status Badge und Button aktualisieren
      const statusBadge = card.querySelector('.skill-status-badge');
      const toggleIcon = toggleBtn.querySelector('.toggle-icon');

      if (result.active) {
        statusBadge.className = 'skill-status-badge active';
        statusBadge.textContent = 'Active';
        toggleIcon.textContent = '⏸';

        // Card als aktiv markieren
        card.classList.add('skill-active');
        card.classList.remove('skill-inactive');

        skill.active = true;
      } else {
        statusBadge.className = 'skill-status-badge inactive';
        statusBadge.textContent = 'Inactive';
        toggleIcon.textContent = '▶';

        // Card als inaktiv markieren
        card.classList.add('skill-inactive');
        card.classList.remove('skill-active');

        skill.active = false;
      }

      // Success Notification (falls vorhanden)
      if (window.showNotification) {
        window.showNotification(
          `Skill "${skill.name}" ${result.active ? 'aktiviert' : 'deaktiviert'}`,
          'success'
        );
      }

    } catch (error) {
      console.error('Error toggling skill:', error);

      // Error Notification (falls vorhanden)
      if (window.showNotification) {
        window.showNotification(
          `Fehler beim ${skill.active ? 'Deaktivieren' : 'Aktivieren'} von "${skill.name}": ${error.message}`,
          'error'
        );
      }

      // Fallback Alert
      alert(`Fehler beim Skill-Toggle: ${error.message}`);

    } finally {
      // Loading-State zurücksetzen
      toggleBtn.disabled = false;
      const currentIcon = skill.active ? '⏸' : '▶';
      toggleBtn.innerHTML = `<span class="toggle-icon">${currentIcon}</span>`;
    }
  });

  // Anfangs-CSS-Klassen setzen
  card.classList.add(skill.active ? 'skill-active' : 'skill-inactive');

  return card;
}

/**
 * Hilfsfunktion für HTML-Escaping
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Skill-Karten in Container rendern
 */
function renderSkillCards(skills, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID "${containerId}" not found`);
    return;
  }

  // Container leeren
  container.innerHTML = '';

  // Leere Liste prüfen
  if (!skills || skills.length === 0) {
    container.innerHTML = '<div class="no-skills-message">Keine Skills verfügbar</div>';
    return;
  }

  // Skills rendern
  skills.forEach(skill => {
    const card = renderSkillCard(skill);
    container.appendChild(card);
  });
}

// CSS-Stile hinzufügen (falls nicht bereits vorhanden)
if (!document.querySelector('#skill-card-styles')) {
  const styles = document.createElement('style');
  styles.id = 'skill-card-styles';
  styles.textContent = `
    .skill-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      background: white;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .skill-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .skill-card.skill-active {
      border-color: #4CAF50;
      background: #f8fff8;
    }

    .skill-card.skill-inactive {
      border-color: #ccc;
      background: #f9f9f9;
    }

    .skill-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .skill-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .skill-name {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .skill-status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .skill-status-badge.active {
      background: #4CAF50;
      color: white;
    }

    .skill-status-badge.inactive {
      background: #999;
      color: white;
    }

    .skill-toggle-btn {
      background: #007bff;
      color: white;
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.2s ease;
      font-size: 14px;
    }

    .skill-toggle-btn:hover {
      background: #0056b3;
    }

    .skill-toggle-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .skill-card-body {
      margin-top: 8px;
    }

    .skill-description {
      margin: 0;
      color: #666;
      font-size: 14px;
      line-height: 1.4;
    }

    .no-skills-message {
      text-align: center;
      color: #999;
      font-style: italic;
      padding: 40px 20px;
    }

    .loading-spinner {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styles);
}

// Export für Modul-System falls vorhanden
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderSkillCard,
    renderSkillCards,
    escapeHtml
  };
}