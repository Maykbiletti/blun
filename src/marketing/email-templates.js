const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const baseStyles = `
  body {
    margin: 0;
    padding: 0;
    background: #f4f7fb;
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a2433;
  }
  .shell {
    width: 100%;
    padding: 28px 12px;
    box-sizing: border-box;
  }
  .card {
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #dbe4f3;
    box-shadow: 0 12px 30px rgba(22, 35, 59, 0.08);
  }
  .header {
    background: linear-gradient(135deg, #0b5dff 0%, #00a8ff 100%);
    color: #ffffff;
    padding: 26px 28px;
  }
  .brand {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1.3px;
    font-weight: 700;
    opacity: 0.95;
  }
  .title {
    margin: 10px 0 0;
    font-size: 30px;
    line-height: 1.25;
    font-weight: 800;
  }
  .body {
    padding: 28px;
  }
  .text {
    margin: 0 0 16px;
    font-size: 16px;
    line-height: 1.65;
    color: #243247;
  }
  .meta {
    margin: 0;
    font-size: 13px;
    color: #5e708a;
  }
  .panel {
    margin: 22px 0;
    padding: 18px;
    border-radius: 10px;
    background: #f0f5ff;
    border: 1px solid #d0defa;
  }
  .panel-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: #0f2d73;
  }
  .cta {
    display: inline-block;
    margin-top: 14px;
    padding: 12px 18px;
    border-radius: 8px;
    background: #0b5dff;
    color: #ffffff !important;
    text-decoration: none;
    font-weight: 700;
    font-size: 14px;
  }
  .stats {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  .stats td {
    padding: 10px 12px;
    border-bottom: 1px solid #dde7f8;
    font-size: 14px;
  }
  .stats td:first-child {
    color: #4c607a;
  }
  .stats td:last-child {
    text-align: right;
    color: #0a265f;
    font-weight: 700;
  }
  .task-list {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .task-item {
    margin: 0 0 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #f8fbff;
    border: 1px solid #dce8fb;
    font-size: 14px;
    line-height: 1.45;
  }
  .footer {
    padding: 18px 28px 26px;
    border-top: 1px solid #e3ebf9;
    font-size: 12px;
    color: #6c7f98;
  }
  @media only screen and (max-width: 640px) {
    .title {
      font-size: 25px;
    }
    .body,
    .footer,
    .header {
      padding: 20px;
    }
  }
`;

function buildLayout(subject, headline, content, footerNote) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="shell">
    <section class="card">
      <header class="header">
        <p class="brand">BLUN</p>
        <h1 class="title">${escapeHtml(headline)}</h1>
      </header>
      <main class="body">
        ${content}
      </main>
      <footer class="footer">
        ${escapeHtml(footerNote)}
      </footer>
    </section>
  </div>
</body>
</html>`;
}

function renderTaskList(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '<p class="text">Keine offenen Punkte in dieser Woche.</p>';
  }

  const items = tasks
    .map((task) => `<li class="task-item">${escapeHtml(task)}</li>`)
    .join('');

  return `<ul class="task-list">${items}</ul>`;
}

function buildWelcomeEmail({
  userName = 'Teammitglied',
  workspaceName = 'Dein Workspace',
  loginUrl = '#',
  supportMail = 'support@blun.app'
} = {}) {
  const content = `
    <p class="text">Hallo ${escapeHtml(userName)},</p>
    <p class="text">willkommen bei BLUN. Dein Workspace <strong>${escapeHtml(workspaceName)}</strong> ist startklar und kann sofort genutzt werden.</p>
    <div class="panel">
      <p class="panel-title">Was jetzt wichtig ist</p>
      <p class="text">Lege dein erstes Projekt an, verbinde deine Kanaele und weise deinem Team Rollen zu. Damit sind Reports und Task-Automationen innerhalb weniger Minuten aktiv.</p>
      <a class="cta" href="${escapeHtml(loginUrl)}">Jetzt einloggen</a>
    </div>
    <p class="meta">Fragen? Schreib direkt an ${escapeHtml(supportMail)}.</p>
  `;

  return buildLayout(
    'Willkommen bei BLUN',
    'Willkommen im Launch Cockpit',
    content,
    'BLUN Team | Launch, Social Media, Content'
  );
}

function buildTaskCompleteEmail({
  userName = 'Teammitglied',
  taskTitle = 'Neue Aufgabe',
  projectName = 'Projekt',
  completedAt = new Date().toISOString(),
  taskUrl = '#'
} = {}) {
  const content = `
    <p class="text">Hi ${escapeHtml(userName)},</p>
    <p class="text">die Aufgabe <strong>${escapeHtml(taskTitle)}</strong> im Projekt <strong>${escapeHtml(projectName)}</strong> wurde erfolgreich abgeschlossen.</p>
    <div class="panel">
      <p class="panel-title">Abschlussdetails</p>
      <p class="text">Abgeschlossen am: <strong>${escapeHtml(completedAt)}</strong></p>
      <a class="cta" href="${escapeHtml(taskUrl)}">Aufgabe ansehen</a>
    </div>
    <p class="meta">Diese Benachrichtigung wurde automatisch von deinem BLUN Workflow versendet.</p>
  `;

  return buildLayout(
    'Aufgabe abgeschlossen',
    'Task erfolgreich erledigt',
    content,
    'Du erhaeltst diese E-Mails fuer wichtige Projekt-Events.'
  );
}

function buildWeeklyReportEmail({
  userName = 'Teammitglied',
  weekLabel = 'KW',
  createdTasks = 0,
  completedTasks = 0,
  openTasks = 0,
  topTasks = [],
  dashboardUrl = '#'
} = {}) {
  const completionRate = createdTasks > 0
    ? `${Math.min(100, Math.round((completedTasks / createdTasks) * 100))}%`
    : '0%';

  const content = `
    <p class="text">Hallo ${escapeHtml(userName)}, hier ist dein Wochenreport fuer <strong>${escapeHtml(weekLabel)}</strong>.</p>
    <div class="panel">
      <p class="panel-title">Leistungsuebersicht</p>
      <table class="stats" role="presentation">
        <tr><td>Erstellte Tasks</td><td>${escapeHtml(createdTasks)}</td></tr>
        <tr><td>Abgeschlossene Tasks</td><td>${escapeHtml(completedTasks)}</td></tr>
        <tr><td>Offene Tasks</td><td>${escapeHtml(openTasks)}</td></tr>
        <tr><td>Abschlussquote</td><td>${escapeHtml(completionRate)}</td></tr>
      </table>
    </div>
    <div class="panel">
      <p class="panel-title">Top Tasks dieser Woche</p>
      ${renderTaskList(topTasks)}
      <a class="cta" href="${escapeHtml(dashboardUrl)}">Report im Dashboard</a>
    </div>
    <p class="meta">Tipp: Halte offene Aufgaben unter 20%, um Kampagnen stabil auszuliefern.</p>
  `;

  return buildLayout(
    'Wochenreport',
    'Weekly Performance Report',
    content,
    'Automatischer Report aus deinem BLUN Workspace.'
  );
}

module.exports = {
  buildWelcomeEmail,
  buildTaskCompleteEmail,
  buildWeeklyReportEmail
};
