#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

class WeeklyCEOReport {
    constructor() {
        this.reportDate = new Date();
        this.weekStart = new Date(this.reportDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        this.data = {
            tasks: [],
            costs: 0,
            newUsers: 0,
            errors: []
        };
    }

    async collectTaskData() {
        try {
            // Git commits der letzten Woche
            const { stdout: commits } = await execPromise(`git log --since="7 days ago" --pretty=format:"%h - %s (%an)" --abbrev-commit`);
            this.data.tasks = commits.split('\n').filter(line => line.trim());

            // Agent tasks aus memory files
            const memoryDir = '/root/.claude/projects/-root-blun/memory/';
            if (fs.existsSync(memoryDir)) {
                const files = fs.readdirSync(memoryDir);
                const taskFiles = files.filter(f => f.includes('task_') && f.endsWith('.md'));

                for (const file of taskFiles) {
                    const content = fs.readFileSync(path.join(memoryDir, file), 'utf8');
                    if (content.includes('Successfully') || content.includes('completed')) {
                        this.data.tasks.push(`Task: ${file.replace('task_', '').replace('.md', '')}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error collecting task data:', error);
        }
    }

    async collectCostData() {
        try {
            // API costs aus logs
            const logFiles = ['/var/log/blun.log', './logs/api.log', './blun.log'];
            let totalCost = 0;

            for (const logFile of logFiles) {
                if (fs.existsSync(logFile)) {
                    const content = fs.readFileSync(logFile, 'utf8');
                    const costMatches = content.match(/cost[:\s]+\$?(\d+\.?\d*)/gi) || [];
                    for (const match of costMatches) {
                        const cost = parseFloat(match.replace(/[^\d.]/g, ''));
                        if (!isNaN(cost)) totalCost += cost;
                    }
                }
            }

            // Geschätzte Kosten basierend auf Agent-Aktivitäten
            const agentRuns = this.data.tasks.length;
            const estimatedCost = agentRuns * 0.02; // $0.02 per agent task

            this.data.costs = Math.max(totalCost, estimatedCost);
        } catch (error) {
            console.error('Error collecting cost data:', error);
        }
    }

    async collectUserData() {
        try {
            // Neue Users aus DB oder logs
            const dbFile = './blun.db';
            if (fs.existsSync(dbFile)) {
                const { stdout } = await execPromise(`sqlite3 ${dbFile} "SELECT COUNT(*) FROM users WHERE created_at >= date('now', '-7 days')" 2>/dev/null || echo "0"`);
                this.data.newUsers = parseInt(stdout.trim()) || 0;
            }

            // Fallback: Git activity als User-Proxy
            if (this.data.newUsers === 0) {
                const uniqueAuthors = new Set();
                for (const task of this.data.tasks) {
                    const authorMatch = task.match(/\(([^)]+)\)$/);
                    if (authorMatch) uniqueAuthors.add(authorMatch[1]);
                }
                this.data.newUsers = Math.max(uniqueAuthors.size - 1, 0);
            }
        } catch (error) {
            console.error('Error collecting user data:', error);
        }
    }

    async collectErrorData() {
        try {
            // Errors aus memory files (catastrophic reports)
            const memoryDir = '/root/.claude/projects/-root-blun/memory/';
            if (fs.existsSync(memoryDir)) {
                const files = fs.readdirSync(memoryDir);
                const errorFiles = files.filter(f =>
                    f.includes('catastrophic') ||
                    f.includes('critical') ||
                    f.includes('security_violation')
                );

                for (const file of errorFiles) {
                    const content = fs.readFileSync(path.join(memoryDir, file), 'utf8');
                    const title = content.split('\n')[0].replace(/^#\s*/, '');
                    this.data.errors.push(`${file}: ${title}`);
                }
            }

            // System errors aus logs
            const logFiles = ['/var/log/blun.log', './logs/error.log', './blun.log'];
            for (const logFile of logFiles) {
                if (fs.existsSync(logFile)) {
                    const content = fs.readFileSync(logFile, 'utf8');
                    const errorLines = content.split('\n').filter(line =>
                        line.toLowerCase().includes('error') ||
                        line.toLowerCase().includes('fail')
                    ).slice(-5); // Letzte 5 Errors

                    this.data.errors.push(...errorLines);
                }
            }

            // Limit errors to recent ones
            this.data.errors = this.data.errors.slice(-10);
        } catch (error) {
            console.error('Error collecting error data:', error);
        }
    }

    generateReport() {
        const report = `
🏢 **BLUN CEO Wochenbericht** - KW ${this.getWeekNumber()}
📅 ${this.weekStart.toLocaleDateString('de-DE')} - ${this.reportDate.toLocaleDateString('de-DE')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **BUSINESS METRICS**
• ✅ Tasks abgeschlossen: **${this.data.tasks.length}**
• 💰 Kosten diese Woche: **$${this.data.costs.toFixed(2)}**
• 👥 Neue User: **${this.data.newUsers}**
• 🚨 Kritische Fehler: **${this.data.errors.length}**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 **TOP ACHIEVEMENTS**
${this.data.tasks.slice(0, 5).map(task => `• ${task}`).join('\n') || '• Keine abgeschlossenen Tasks'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  **KRITISCHE ISSUES**
${this.data.errors.slice(0, 3).map(error => `• ${error.substring(0, 100)}...`).join('\n') || '• Keine kritischen Fehler'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 **NEXT STEPS**
${this.generateRecommendations()}

---
🤖 *Automatisch generiert von Rolf - Business Developer*
        `.trim();

        return report;
    }

    generateRecommendations() {
        const recommendations = [];

        if (this.data.costs > 10) {
            recommendations.push('• Kostenoptimierung prüfen - Budget überschritten');
        }

        if (this.data.errors.length > 5) {
            recommendations.push('• Kritische System-Stabilität - Sofortige Intervention nötig');
        }

        if (this.data.newUsers === 0) {
            recommendations.push('• User-Akquisition verstärken');
        }

        if (this.data.tasks.length < 5) {
            recommendations.push('• Produktivität steigern - Zu wenige abgeschlossene Tasks');
        }

        return recommendations.length > 0 ? recommendations.join('\n') : '• Alles läuft optimal 🎯';
    }

    getWeekNumber() {
        const date = new Date(this.reportDate);
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    async sendToDieterChat(report) {
        try {
            // Webhook URL für Dieter Chat (muss konfiguriert werden)
            const webhookUrl = process.env.DIETER_WEBHOOK_URL || 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';

            const payload = {
                text: report,
                channel: "#dieter-chat",
                username: "CEO-Reporter",
                icon_emoji: ":bar_chart:"
            };

            // Fallback: Save to file wenn kein Webhook
            const reportFile = `./reports/ceo-report-${this.reportDate.toISOString().split('T')[0]}.txt`;
            await fs.promises.writeFile(reportFile, report);

            console.log(`✅ CEO Report gespeichert: ${reportFile}`);
            console.log(`📊 Report Preview:\n${report}`);

            // In Produktion: HTTP Request zum Webhook
            // const https = require('https');
            // const postData = JSON.stringify(payload);
            // const req = https.request(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            // req.write(postData);
            // req.end();

        } catch (error) {
            console.error('Error sending to Dieter chat:', error);
        }
    }

    async run() {
        console.log('🚀 Generiere CEO Wochenbericht...');

        await this.collectTaskData();
        await this.collectCostData();
        await this.collectUserData();
        await this.collectErrorData();

        const report = this.generateReport();
        await this.sendToDieterChat(report);

        console.log('✅ CEO Report fertig!');
    }
}

// Script ausführen wenn direkt aufgerufen
if (require.main === module) {
    const reporter = new WeeklyCEOReport();
    reporter.run().catch(console.error);
}

module.exports = WeeklyCEOReport;