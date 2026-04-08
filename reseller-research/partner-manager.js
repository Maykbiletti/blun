/**
 * BLUN Partner Management System
 * Autor: Rolf - Business Developer
 * Integration: BLUN.ai Reseller Pipeline
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

class PartnerManager {
    constructor() {
        this.dataFile = path.join(__dirname, 'dach-reseller-pipeline.json');
        this.partners = this.loadPartnerData();
        this.app = express();
        this.setupRoutes();
    }

    loadPartnerData() {
        try {
            const data = fs.readFileSync(this.dataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading partner data:', error);
            return { partners: {}, pipeline_metadata: {} };
        }
    }

    savePartnerData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.partners, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving partner data:', error);
            return false;
        }
    }

    // Partner-Ranking basierend auf Umsatzpotenzial und Fit-Score
    getTopPartners(limit = 10) {
        const partnerArray = Object.values(this.partners.partners || {});
        return partnerArray
            .sort((a, b) => {
                // Sortierung: Umsatzpotenzial * Fit-Score
                const scoreA = a.potential?.total_arr_potential * (a.fit_analysis?.overall_fit / 100) || 0;
                const scoreB = b.potential?.total_arr_potential * (b.fit_analysis?.overall_fit / 100) || 0;
                return scoreB - scoreA;
            })
            .slice(0, limit);
    }

    // Outreach-Pipeline nach Priorität
    getOutreachSchedule() {
        const partners = Object.values(this.partners.partners || {});
        const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };

        return partners
            .filter(p => p.status === 'target' || p.status === 'prospect')
            .sort((a, b) => {
                return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
            });
    }

    // Partner-Status Update
    updatePartnerStatus(partnerId, newStatus, notes = '') {
        if (!this.partners.partners[partnerId]) {
            return { success: false, message: 'Partner nicht gefunden' };
        }

        const partner = this.partners.partners[partnerId];
        const oldStatus = partner.status;

        partner.status = newStatus;
        partner.last_updated = new Date().toISOString();

        if (notes) {
            if (!partner.activity_log) partner.activity_log = [];
            partner.activity_log.push({
                date: new Date().toISOString(),
                action: `Status-Änderung: ${oldStatus} → ${newStatus}`,
                notes: notes,
                user: 'Rolf'
            });
        }

        this.savePartnerData();
        return { success: true, message: `Status updated für ${partner.company_name}` };
    }

    // Kontakt-Logger
    logContact(partnerId, contactType, contactPerson, outcome, nextSteps) {
        if (!this.partners.partners[partnerId]) {
            return { success: false, message: 'Partner nicht gefunden' };
        }

        const partner = this.partners.partners[partnerId];
        if (!partner.activity_log) partner.activity_log = [];

        partner.activity_log.push({
            date: new Date().toISOString(),
            action: 'Kontakt',
            type: contactType,
            contact_person: contactPerson,
            outcome: outcome,
            next_steps: nextSteps,
            user: 'Rolf'
        });

        partner.last_contact = new Date().toISOString();
        this.savePartnerData();

        return { success: true, message: 'Kontakt erfolgreich geloggt' };
    }

    // Revenue-Projektion
    calculateRevenueProjection(timeframe = 12) {
        const partners = Object.values(this.partners.partners || {});
        let totalProjection = 0;
        let totalCommission = 0;

        const projectionByStatus = {
            'signed': { multiplier: 1.0, partners: [] },
            'pilot': { multiplier: 0.7, partners: [] },
            'negotiation': { multiplier: 0.5, partners: [] },
            'target': { multiplier: 0.3, partners: [] },
            'prospect': { multiplier: 0.15, partners: [] }
        };

        partners.forEach(partner => {
            const status = partner.status || 'prospect';
            const potential = partner.potential?.total_arr_potential || 0;
            const commission = partner.potential?.commission_estimate || 0;
            const confidence = partner.potential?.confidence_score / 100 || 0.5;

            if (projectionByStatus[status]) {
                const weightedPotential = potential * projectionByStatus[status].multiplier * confidence;
                const weightedCommission = commission * projectionByStatus[status].multiplier * confidence;

                projectionByStatus[status].partners.push({
                    id: partner.id,
                    name: partner.company_name,
                    potential: weightedPotential,
                    commission: weightedCommission
                });

                totalProjection += weightedPotential;
                totalCommission += weightedCommission;
            }
        });

        return {
            timeframe_months: timeframe,
            total_arr_projection: Math.round(totalProjection),
            total_commission_projection: Math.round(totalCommission),
            breakdown_by_status: projectionByStatus,
            confidence_level: this.calculateOverallConfidence()
        };
    }

    calculateOverallConfidence() {
        const partners = Object.values(this.partners.partners || {});
        const activePartners = partners.filter(p =>
            p.status === 'target' || p.status === 'prospect' || p.status === 'negotiation'
        );

        if (activePartners.length === 0) return 0;

        const avgConfidence = activePartners.reduce((sum, p) =>
            sum + (p.potential?.confidence_score || 50), 0) / activePartners.length;

        return Math.round(avgConfidence);
    }

    // Nächste Aktionen generieren
    getActionItems() {
        const partners = Object.values(this.partners.partners || {});
        const actions = [];
        const now = new Date();

        partners.forEach(partner => {
            // Kontakt überfällig?
            const lastContact = partner.last_contact ? new Date(partner.last_contact) : null;
            const daysSinceContact = lastContact ? Math.floor((now - lastContact) / (1000 * 60 * 60 * 24)) : 999;

            if (partner.status === 'target' && daysSinceContact > 7) {
                actions.push({
                    priority: 'high',
                    type: 'follow_up',
                    partner: partner.company_name,
                    action: `Follow-up erforderlich (${daysSinceContact} Tage seit letztem Kontakt)`,
                    contact: partner.contact[partner.outreach?.best_contact]?.email || 'Kontakt unbekannt'
                });
            }

            // Status-Updates erforderlich?
            if (partner.status === 'prospect' && daysSinceContact > 30) {
                actions.push({
                    priority: 'medium',
                    type: 'status_check',
                    partner: partner.company_name,
                    action: `Status-Update erforderlich (${daysSinceContact} Tage inaktiv)`,
                    contact: partner.contact[partner.outreach?.best_contact]?.email || 'Kontakt unbekannt'
                });
            }

            // Spezielle Outreach-Kanäle
            if (partner.outreach?.timeline && partner.outreach.timeline.includes('2026') && partner.status === 'target') {
                actions.push({
                    priority: 'high',
                    type: 'scheduled_outreach',
                    partner: partner.company_name,
                    action: `Geplanter Outreach: ${partner.outreach.approach} (${partner.outreach.timeline})`,
                    contact: partner.contact[partner.outreach?.best_contact]?.email || 'Kontakt unbekannt'
                });
            }
        });

        return actions.sort((a, b) => {
            const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
            return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
        });
    }

    // Express.js Routes Setup
    setupRoutes() {
        this.app.use(express.json());
        this.app.use(express.static(__dirname));

        // Dashboard Overview
        this.app.get('/api/partners/dashboard', (req, res) => {
            const topPartners = this.getTopPartners(5);
            const revenueProjection = this.calculateRevenueProjection();
            const actionItems = this.getActionItems();
            const outreachSchedule = this.getOutreachSchedule().slice(0, 10);

            res.json({
                success: true,
                data: {
                    top_partners: topPartners,
                    revenue_projection: revenueProjection,
                    action_items: actionItems,
                    outreach_schedule: outreachSchedule,
                    metadata: this.partners.pipeline_metadata
                }
            });
        });

        // Partner Details
        this.app.get('/api/partners/:partnerId', (req, res) => {
            const partner = this.partners.partners[req.params.partnerId];
            if (!partner) {
                return res.status(404).json({ success: false, message: 'Partner nicht gefunden' });
            }
            res.json({ success: true, data: partner });
        });

        // Partner Status Update
        this.app.post('/api/partners/:partnerId/status', (req, res) => {
            const { status, notes } = req.body;
            const result = this.updatePartnerStatus(req.params.partnerId, status, notes);
            res.json(result);
        });

        // Kontakt-Log
        this.app.post('/api/partners/:partnerId/contact', (req, res) => {
            const { contactType, contactPerson, outcome, nextSteps } = req.body;
            const result = this.logContact(req.params.partnerId, contactType, contactPerson, outcome, nextSteps);
            res.json(result);
        });

        // Outreach-Report generieren
        this.app.get('/api/partners/reports/outreach', (req, res) => {
            const schedule = this.getOutreachSchedule();
            const actions = this.getActionItems();

            const report = {
                generated_date: new Date().toISOString(),
                generated_by: 'Rolf',
                pending_outreach: schedule.length,
                action_items: actions.length,
                high_priority_actions: actions.filter(a => a.priority === 'high').length,
                schedule: schedule.map(p => ({
                    company: p.company_name,
                    priority: p.priority,
                    status: p.status,
                    potential: p.potential?.total_arr_potential || 0,
                    contact: p.contact[p.outreach?.best_contact]?.email || 'N/A',
                    approach: p.outreach?.approach || 'Standard'
                }))
            };

            res.json({ success: true, data: report });
        });

        // Revenue-Report
        this.app.get('/api/partners/reports/revenue', (req, res) => {
            const projection = this.calculateRevenueProjection();
            res.json({ success: true, data: projection });
        });
    }

    // Server starten
    startServer(port = 3851) {
        this.app.listen(port, () => {
            console.log(`\n🚀 BLUN Partner Management System gestartet`);
            console.log(`📊 Dashboard: http://localhost:${port}/dashboard.html`);
            console.log(`🔌 API: http://localhost:${port}/api/partners/dashboard`);
            console.log(`👨‍💼 Manager: Rolf - Business Developer\n`);

            // Startup-Report
            const topPartners = this.getTopPartners(3);
            const actions = this.getActionItems();

            console.log('📈 Top 3 Partner-Potenzial:');
            topPartners.forEach((p, i) => {
                console.log(`  ${i+1}. ${p.company_name} - €${p.potential?.total_arr_potential?.toLocaleString('de-DE') || 'N/A'} ARR`);
            });

            console.log(`\n⚡ ${actions.length} Action Items pending`);
            console.log(`🎯 ${actions.filter(a => a.priority === 'high').length} High Priority\n`);
        });
    }
}

// Export für Integration in BLUN-System
module.exports = PartnerManager;

// Standalone-Ausführung
if (require.main === module) {
    const partnerManager = new PartnerManager();
    partnerManager.startServer(3851);
}