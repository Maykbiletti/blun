// BLUN.ai Affiliate API Routes
// Business Logic: Referral Link Generator, Click Tracking, Commission Management
// Author: Rolf (Business Developer - Billing, Affiliate, Reseller)

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Middleware für Authentifizierung
router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({
            error: 'Ungültiger API-Schlüssel',
            message: 'Bitte gültigen x-api-key Header angeben'
        });
    }
    next();
});

// POST /api/v1/affiliate/generate - Referral-Link Generator
router.post('/generate', async (req, res) => {
    try {
        const { userId, campaign = 'default', customCode } = req.body;

        // Validation
        if (!userId) {
            return res.status(400).json({
                error: 'User ID erforderlich',
                message: 'userId Parameter fehlt'
            });
        }

        // Prüfe ob User existiert
        const userExists = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
        if (userExists.length === 0) {
            return res.status(404).json({
                error: 'User nicht gefunden',
                message: 'Ungültige User ID'
            });
        }

        // Generiere einzigartigen Referral Code
        let referralCode;
        let isUnique = false;

        if (customCode) {
            // Validiere Custom Code Format (alphanumerisch, 4-20 Zeichen)
            if (!/^[a-zA-Z0-9]{4,20}$/.test(customCode)) {
                return res.status(400).json({
                    error: 'Ungültiger Custom Code',
                    message: 'Code muss 4-20 alphanumerische Zeichen enthalten'
                });
            }

            // Prüfe ob Custom Code verfügbar
            const existingCode = await db.query('SELECT id FROM affiliate_links WHERE code = ?', [customCode]);
            if (existingCode.length > 0) {
                return res.status(409).json({
                    error: 'Code bereits vergeben',
                    message: 'Bitte anderen Code wählen'
                });
            }

            referralCode = customCode;
            isUnique = true;
        } else {
            // Generiere automatischen Code
            let attempts = 0;
            while (!isUnique && attempts < 10) {
                referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
                const existing = await db.query('SELECT id FROM affiliate_links WHERE code = ?', [referralCode]);
                isUnique = existing.length === 0;
                attempts++;
            }

            if (!isUnique) {
                return res.status(500).json({
                    error: 'Code-Generierung fehlgeschlagen',
                    message: 'Bitte erneut versuchen'
                });
            }
        }

        // Erstelle Affiliate Link
        const linkId = await db.query(`
            INSERT INTO affiliate_links (user_id, code, campaign, created_at, status)
            VALUES (?, ?, ?, NOW(), 'active')
        `, [userId, referralCode, campaign]);

        // Vollständige URL erstellen
        const referralUrl = `https://blun.ai/ref/${referralCode}`;

        res.status(201).json({
            success: true,
            data: {
                id: linkId.insertId,
                userId: parseInt(userId),
                code: referralCode,
                url: referralUrl,
                campaign,
                status: 'active',
                createdAt: new Date().toISOString(),
                trackingInfo: {
                    clicks: 0,
                    conversions: 0,
                    commission: 0
                }
            },
            message: 'Referral-Link erfolgreich erstellt'
        });

    } catch (error) {
        console.error('Affiliate Link Generation Error:', error);
        res.status(500).json({
            error: 'Server-Fehler bei Link-Generierung',
            message: 'Bitte Support kontaktieren'
        });
    }
});

// GET /api/v1/affiliate/referrals - Referral Liste mit Tracking
router.get('/referrals', async (req, res) => {
    try {
        const { userId, status = 'all', limit = 50, offset = 0 } = req.query;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID erforderlich',
                message: 'userId Parameter fehlt'
            });
        }

        // SQL Query mit Click/Conversion Tracking
        let whereClause = 'WHERE al.user_id = ?';
        let params = [userId];

        if (status !== 'all') {
            whereClause += ' AND al.status = ?';
            params.push(status);
        }

        const referrals = await db.query(`
            SELECT
                al.id,
                al.code,
                al.campaign,
                al.status,
                al.created_at,
                COUNT(DISTINCT ac.id) as total_clicks,
                COUNT(DISTINCT CASE WHEN ac.converted = 1 THEN ac.id END) as conversions,
                COALESCE(SUM(ac.commission_amount), 0) as total_commission,
                CONCAT('https://blun.ai/ref/', al.code) as url
            FROM affiliate_links al
            LEFT JOIN affiliate_clicks ac ON al.id = ac.link_id
            ${whereClause}
            GROUP BY al.id
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);

        // Conversion Rate berechnen
        const enrichedReferrals = referrals.map(ref => ({
            ...ref,
            total_clicks: parseInt(ref.total_clicks),
            conversions: parseInt(ref.conversions),
            total_commission: parseFloat(ref.total_commission),
            conversion_rate: ref.total_clicks > 0 ?
                Math.round((ref.conversions / ref.total_clicks) * 100 * 100) / 100 : 0
        }));

        res.json({
            success: true,
            data: enrichedReferrals,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: enrichedReferrals.length
            }
        });

    } catch (error) {
        console.error('Referrals Fetch Error:', error);
        res.status(500).json({
            error: 'Server-Fehler beim Laden der Referrals',
            message: 'Bitte Support kontaktieren'
        });
    }
});

// POST /api/v1/affiliate/track-click - Click Tracking Endpoint
router.post('/track-click', async (req, res) => {
    try {
        const { code, referrer, userAgent, ipAddress } = req.body;

        if (!code) {
            return res.status(400).json({
                error: 'Referral Code erforderlich',
                message: 'code Parameter fehlt'
            });
        }

        // Finde Affiliate Link
        const affiliateLink = await db.query(`
            SELECT id, user_id, status
            FROM affiliate_links
            WHERE code = ? AND status = 'active'
        `, [code]);

        if (affiliateLink.length === 0) {
            return res.status(404).json({
                error: 'Referral Code ungültig',
                message: 'Code nicht gefunden oder inaktiv'
            });
        }

        const link = affiliateLink[0];

        // Speichere Click in affiliate_clicks Tabelle
        await db.query(`
            INSERT INTO affiliate_clicks
            (link_id, user_id, ip_address, user_agent, referrer, clicked_at, converted)
            VALUES (?, ?, ?, ?, ?, NOW(), 0)
        `, [link.id, link.user_id, ipAddress || null, userAgent || null, referrer || null]);

        res.status(201).json({
            success: true,
            data: {
                code,
                tracked: true,
                redirectUrl: 'https://blun.ai/signup'
            },
            message: 'Click erfolgreich getrackt'
        });

    } catch (error) {
        console.error('Click Tracking Error:', error);
        res.status(500).json({
            error: 'Server-Fehler beim Click-Tracking',
            message: 'Bitte Support kontaktieren'
        });
    }
});

// POST /api/v1/affiliate/convert - Conversion Tracking
router.post('/convert', async (req, res) => {
    try {
        const { clickId, conversionValue, subscriptionId } = req.body;

        if (!clickId) {
            return res.status(400).json({
                error: 'Click ID erforderlich',
                message: 'clickId Parameter fehlt'
            });
        }

        // Commission Rate (15% für Pro Plan, 20% für Enterprise)
        const commissionRate = conversionValue >= 50 ? 0.20 : 0.15;
        const commissionAmount = Math.round(conversionValue * commissionRate * 100) / 100;

        // Update Click zu Conversion
        const result = await db.query(`
            UPDATE affiliate_clicks
            SET converted = 1,
                converted_at = NOW(),
                conversion_value = ?,
                commission_amount = ?,
                subscription_id = ?
            WHERE id = ? AND converted = 0
        `, [conversionValue, commissionAmount, subscriptionId || null, clickId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Click nicht gefunden',
                message: 'Ungültige Click ID oder bereits konvertiert'
            });
        }

        res.json({
            success: true,
            data: {
                clickId: parseInt(clickId),
                converted: true,
                conversionValue,
                commissionAmount,
                commissionRate: Math.round(commissionRate * 100)
            },
            message: 'Conversion erfolgreich getrackt'
        });

    } catch (error) {
        console.error('Conversion Tracking Error:', error);
        res.status(500).json({
            error: 'Server-Fehler beim Conversion-Tracking',
            message: 'Bitte Support kontaktieren'
        });
    }
});

module.exports = router;