#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Security Headers to check
const REQUIRED_HEADERS = {
  'Strict-Transport-Security': {
    priority: 'CRITICAL',
    description: 'Erzwingt HTTPS für alle Verbindungen',
    recommendation: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;'
  },
  'Content-Security-Policy': {
    priority: 'HIGH',
    description: 'Schützt vor XSS und Injection-Angriffen',
    recommendation: 'add_header Content-Security-Policy "default-src \'self\'" always;'
  },
  'X-Frame-Options': {
    priority: 'HIGH',
    description: 'Verhindert Clickjacking-Attacken',
    recommendation: 'add_header X-Frame-Options "SAMEORIGIN" always;'
  },
  'X-Content-Type-Options': {
    priority: 'HIGH',
    description: 'Verhindert MIME-Type-Sniffing',
    recommendation: 'add_header X-Content-Type-Options "nosniff" always;'
  },
  'Referrer-Policy': {
    priority: 'MEDIUM',
    description: 'Kontrolliert Referrer-Information',
    recommendation: 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;'
  },
  'X-XSS-Protection': {
    priority: 'MEDIUM',
    description: 'Legacy XSS-Schutz (Browser-Feature)',
    recommendation: 'add_header X-XSS-Protection "1; mode=block" always;'
  },
  'Permissions-Policy': {
    priority: 'MEDIUM',
    description: 'Kontrolliert Browser-Features',
    recommendation: 'add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;'
  }
};

class NginxSecurityAudit {
  constructor() {
    this.results = [];
    this.nginxConfigPath = '/etc/nginx';
  }

  async findNginxConfigs() {
    try {
      const { stdout } = await execAsync(`find ${this.nginxConfigPath} -name "*.conf" -type f 2>/dev/null`);
      return stdout.split('\n').filter(line => line.trim());
    } catch (error) {
      console.error('Fehler beim Suchen nach Nginx-Configs:', error.message);
      return [];
    }
  }

  parseNginxConfig(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const servers = [];

      // Regex für server blocks
      const serverRegex = /server\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
      let match;

      while ((match = serverRegex.exec(content)) !== null) {
        const serverBlock = match[1];
        const server = this.parseServerBlock(serverBlock);
        if (server.domain) {
          servers.push(server);
        }
      }

      return servers;
    } catch (error) {
      console.error(`Fehler beim Parsen von ${filePath}:`, error.message);
      return [];
    }
  }

  parseServerBlock(block) {
    const server = {
      domain: null,
      port: 80,
      protocol: 'HTTP',
      headers: [],
      missing_headers: []
    };

    // Server Name
    const serverNameMatch = block.match(/server_name\s+([^;]+);/);
    if (serverNameMatch) {
      server.domain = serverNameMatch[1].trim();
    }

    // Listen Port
    const listenMatch = block.match(/listen\s+(\d+)/);
    if (listenMatch) {
      server.port = parseInt(listenMatch[1]);
      server.protocol = server.port === 443 ? 'HTTPS' : 'HTTP';
    }

    // Suche nach add_header Direktiven
    const headerRegex = /add_header\s+([^\s]+)\s+"([^"]+)"/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(block)) !== null) {
      server.headers.push(headerMatch[1]);
    }

    // Prüfe fehlende Header
    Object.keys(REQUIRED_HEADERS).forEach(header => {
      if (!server.headers.includes(header)) {
        server.missing_headers.push(header);
      }
    });

    return server;
  }

  async audit() {
    console.log('🔍 Starte Nginx Security Headers Audit...\n');

    const configs = await this.findNginxConfigs();
    if (configs.length === 0) {
      console.warn('⚠️  Keine Nginx-Config-Dateien gefunden.');
      return this.results;
    }

    configs.forEach(configPath => {
      const servers = this.parseNginxConfig(configPath);
      servers.forEach(server => {
        this.results.push({
          ...server,
          configPath
        });
      });
    });

    return this.results;
  }

  generateReport() {
    const timestamp = new Date().toISOString();
    const criticalIssues = this.results.filter(r =>
      r.missing_headers.some(h => REQUIRED_HEADERS[h].priority === 'CRITICAL')
    ).length;

    let html = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nginx Security Headers Audit Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            border-bottom: 1px solid #eee;
        }
        .summary-card {
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-card.critical {
            background: #fee;
            border: 2px solid #c00;
        }
        .summary-card.high {
            background: #fef3cd;
            border: 2px solid #ff9800;
        }
        .summary-card.medium {
            background: #e3f2fd;
            border: 2px solid #2196f3;
        }
        .summary-card h3 {
            font-size: 2em;
            margin-bottom: 5px;
        }
        .summary-card p {
            color: #666;
            font-size: 0.9em;
        }
        .content {
            padding: 30px;
        }
        .priority-section {
            margin-bottom: 30px;
        }
        .priority-title {
            font-size: 1.5em;
            font-weight: bold;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 15px;
            display: inline-block;
        }
        .priority-title.critical {
            background: #c00;
            color: white;
        }
        .priority-title.high {
            background: #ff9800;
            color: white;
        }
        .priority-title.medium {
            background: #2196f3;
            color: white;
        }
        .header-info {
            background: #f5f5f5;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid #667eea;
        }
        .header-info h4 {
            margin-bottom: 8px;
            color: #333;
        }
        .header-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            font-size: 0.9em;
        }
        .header-details p {
            color: #666;
        }
        .header-details strong {
            color: #333;
        }
        .status-ok { color: #4caf50; font-weight: bold; }
        .status-missing { color: #c00; font-weight: bold; }
        .missing-list {
            margin-top: 10px;
        }
        .missing-item {
            background: #fee;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            border-left: 3px solid #c00;
        }
        .missing-item strong {
            color: #c00;
        }
        .missing-item p {
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
        }
        .recommendation {
            background: #f0f7ff;
            padding: 10px;
            margin-top: 8px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            overflow-x: auto;
            border-left: 3px solid #2196f3;
        }
        .footer {
            background: #f5f5f5;
            padding: 20px;
            text-align: center;
            color: #666;
            border-top: 1px solid #eee;
            font-size: 0.9em;
        }
        .no-issues { color: #4caf50; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Nginx Security Headers Audit</h1>
            <p>Vollständige Sicherheitsprüfung aller aktiven vHosts</p>
            <p style="font-size: 0.9em; margin-top: 10px;">Report erstellt: ${timestamp}</p>
        </div>

        <div class="summary">`;

    // Summary Statistics
    const criticalCount = this.results.reduce((sum, r) =>
      sum + r.missing_headers.filter(h => REQUIRED_HEADERS[h].priority === 'CRITICAL').length, 0
    );
    const highCount = this.results.reduce((sum, r) =>
      sum + r.missing_headers.filter(h => REQUIRED_HEADERS[h].priority === 'HIGH').length, 0
    );
    const mediumCount = this.results.reduce((sum, r) =>
      sum + r.missing_headers.filter(h => REQUIRED_HEADERS[h].priority === 'MEDIUM').length, 0
    );

    html += `
            <div class="summary-card critical">
                <h3>${criticalCount}</h3>
                <p>🚨 KRITISCHE Issues</p>
            </div>
            <div class="summary-card high">
                <h3>${highCount}</h3>
                <p>⚠️ HOHE Issues</p>
            </div>
            <div class="summary-card medium">
                <h3>${mediumCount}</h3>
                <p>ℹ️ MITTLERE Issues</p>
            </div>
            <div class="summary-card">
                <h3>${this.results.length}</h3>
                <p>📋 Domains geprüft</p>
            </div>
        </div>

        <div class="content">`;

    // Group by priority
    ['CRITICAL', 'HIGH', 'MEDIUM'].forEach(priority => {
      const issuesWithPriority = [];
      this.results.forEach(server => {
        const headersWithPriority = server.missing_headers.filter(h => REQUIRED_HEADERS[h].priority === priority);
        if (headersWithPriority.length > 0) {
          issuesWithPriority.push({ server, headers: headersWithPriority });
        }
      });

      if (issuesWithPriority.length > 0) {
        html += `<div class="priority-section">
            <div class="priority-title ${priority.toLowerCase()}">${priority} Priorität (${issuesWithPriority.length} Domains betroffen)</div>`;

        issuesWithPriority.forEach(({ server, headers }) => {
          html += `<div class="header-info">
                <h4>📌 ${server.domain} (Port ${server.port}, ${server.protocol})</h4>
                <div class="header-details">
                    <p><strong>Config:</strong> ${server.configPath}</p>
                    <p><strong>Status:</strong> <span class="status-missing">${headers.length} Header fehlen</span></p>
                </div>
                <div class="missing-list">`;

          headers.forEach(header => {
            const info = REQUIRED_HEADERS[header];
            html += `<div class="missing-item">
                    <strong>❌ ${header}</strong>
                    <p>${info.description}</p>
                    <div class="recommendation">${info.recommendation}</div>
                </div>`;
          });

          html += `</div></div>`;
        });

        html += `</div>`;
      }
    });

    // Domains without issues
    const cleanDomains = this.results.filter(r => r.missing_headers.length === 0);
    if (cleanDomains.length > 0) {
      html += `<div class="priority-section">
            <div class="priority-title" style="background: #4caf50;">✅ SECURE - Alle Header vorhanden</div>`;
      cleanDomains.forEach(server => {
        html += `<div class="header-info" style="border-left-color: #4caf50;">
                <h4>✅ ${server.domain} (Port ${server.port}, ${server.protocol})</h4>
                <p class="no-issues">Alle Security-Header sind korrekt konfiguriert!</p>
            </div>`;
      });
      html += `</div>`;
    }

    html += `
        </div>

        <div class="footer">
            <p><strong>Audit durchgeführt:</strong> ${new Date().toLocaleString('de-DE')}</p>
            <p>Bitte alle CRITICAL und HIGH Priority Issues so bald wie möglich beheben.</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  saveReport(outputPath) {
    const report = this.generateReport();
    fs.writeFileSync(outputPath, report, 'utf8');
    return outputPath;
  }
}

async function main() {
  const audit = new NginxSecurityAudit();
  const results = await audit.audit();

  if (results.length === 0) {
    console.warn('⚠️  Keine vHosts gefunden. Prüfe manuelle Konfiguration.');
  } else {
    console.log(`✅ ${results.length} vHosts geprüft.\n`);
    results.forEach(r => {
      const status = r.missing_headers.length === 0 ? '✅' : '⚠️';
      console.log(`${status} ${r.domain} (${r.protocol}) - ${r.missing_headers.length} fehlend`);
    });
  }

  // Generate report
  const reportPath = process.argv[2] || '/root/blun/dashboard/nginx-security-audit-report.html';
  const savePath = audit.saveReport(reportPath);
  console.log(`\n📄 Report gespeichert: ${savePath}`);
}

main().catch(console.error);
