#!/usr/bin/env node
// BLUN.ai Affiliate Backend
// Referral-Links, Tracking, Provisions-Berechnung, Payout-API
// Heinrich — 2026-04-07

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.AFFILIATE_PORT || 3850;
const PG_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/blun_agents';
const BASE_URL = process.env.AFFILIATE_BASE_URL || 'https://blun.ai';
const PAYOUT_THRESHOLD = parseFloat(process.env.PAYOUT_THRESHOLD || '50.00');
const DEFAULT_COMMISSION_RATE = parseFloat(process.env.DEFAULT_COMMISSION_RATE || '0.15'); // 15%

// ─── In-Memory DB (PostgreSQL-ready Schema unten) ────────────────────────
const db = {
  partners: new Map(),        // partner_id -> partner
  referralLinks: new Map(),   // link_id -> link
  clicks: [],                 // click events
  signups: new Map(),         // signup_id -> signup
  conversions: [],            // conversion events
  payouts: new Map(),         // payout_id -> payout
  commissionTiers: [
    { min_conversions: 0,   rate: 0.10 },  // 10% bis 10 Conversions
    { min_conversions: 10,  rate: 0.15 },  // 15% ab 10
    { min_conversions: 50,  rate: 0.20 },  // 20% ab 50
    { min_conversions: 100, rate: 0.25 },  // 25% ab 100
  ]
};

// ─── Helpers ─────────────────────────────────────────────────────────────
function genId(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function genRefCode() {
  return crypto.randomBytes(4).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function jsonResp(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getCommissionRate(totalConversions) {
  let rate = DEFAULT_COMMISSION_RATE;
  for (const tier of db.commissionTiers) {
    if (totalConversions >= tier.min_conversions) rate = tier.rate;
  }
  return rate;
}

function getPartnerStats(partnerId) {
  const links = [...db.referralLinks.values()].filter(l => l.partner_id === partnerId);
  const linkIds = new Set(links.map(l => l.link_id));
  const clicks = db.clicks.filter(c => linkIds.has(c.link_id));
  const signups = [...db.signups.values()].filter(s => linkIds.has(s.link_id));
  const conversions = db.conversions.filter(c => c.partner_id === partnerId);
  const totalRevenue = conversions.reduce((sum, c) => sum + c.amount, 0);
  const totalCommission = conversions.reduce((sum, c) => sum + c.commission, 0);
  const payouts = [...db.payouts.values()].filter(p => p.partner_id === partnerId);
  const paidOut = payouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const pending = payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

  return {
    total_clicks: clicks.length,
    total_signups: signups.length,
    total_conversions: conversions.length,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_commission: Math.round(totalCommission * 100) / 100,
    paid_out: Math.round(paidOut * 100) / 100,
    pending_payout: Math.round(pending * 100) / 100,
    balance: Math.round((totalCommission - paidOut - pending) * 100) / 100,
    current_rate: getCommissionRate(conversions.length),
    links_count: links.length
  };
}

// ─── Route Handlers ──────────────────────────────────────────────────────

// POST /api/affiliate/partners — Partner registrieren
async function createPartner(req, res) {
  const body = await readBody(req);
  if (!body.name || !body.email) {
    return jsonResp(res, 400, { error: 'name und email sind Pflichtfelder' });
  }
  // Duplikat-Check
  for (const p of db.partners.values()) {
    if (p.email === body.email) {
      return jsonResp(res, 409, { error: 'Partner mit dieser Email existiert bereits', partner_id: p.partner_id });
    }
  }
  const partner = {
    partner_id: genId('par_'),
    name: body.name,
    email: body.email,
    company: body.company || null,
    payout_method: body.payout_method || 'bank_transfer', // bank_transfer, paypal, crypto
    payout_details: body.payout_details || {},
    status: 'active',
    created_at: now(),
    updated_at: now()
  };
  db.partners.set(partner.partner_id, partner);
  jsonResp(res, 201, { success: true, partner });
}

// GET /api/affiliate/partners — Alle Partner
function listPartners(req, res) {
  const partners = [...db.partners.values()].map(p => ({
    ...p,
    stats: getPartnerStats(p.partner_id)
  }));
  jsonResp(res, 200, { partners, total: partners.length });
}

// GET /api/affiliate/partners/:id — Einzelner Partner
function getPartner(req, res, partnerId) {
  const partner = db.partners.get(partnerId);
  if (!partner) return jsonResp(res, 404, { error: 'Partner nicht gefunden' });
  jsonResp(res, 200, { partner, stats: getPartnerStats(partnerId) });
}

// PUT /api/affiliate/partners/:id — Partner updaten
async function updatePartner(req, res, partnerId) {
  const partner = db.partners.get(partnerId);
  if (!partner) return jsonResp(res, 404, { error: 'Partner nicht gefunden' });
  const body = await readBody(req);
  const allowed = ['name', 'email', 'company', 'payout_method', 'payout_details', 'status'];
  for (const key of allowed) {
    if (body[key] !== undefined) partner[key] = body[key];
  }
  partner.updated_at = now();
  jsonResp(res, 200, { success: true, partner });
}

// POST /api/affiliate/links — Referral-Link generieren
async function createLink(req, res) {
  const body = await readBody(req);
  if (!body.partner_id) return jsonResp(res, 400, { error: 'partner_id ist Pflichtfeld' });
  if (!db.partners.has(body.partner_id)) return jsonResp(res, 404, { error: 'Partner nicht gefunden' });

  const refCode = genRefCode();
  const link = {
    link_id: genId('lnk_'),
    partner_id: body.partner_id,
    ref_code: refCode,
    campaign: body.campaign || 'default',
    target_url: body.target_url || BASE_URL,
    referral_url: `${BASE_URL}/ref/${refCode}`,
    custom_params: body.custom_params || {},
    status: 'active',
    created_at: now()
  };
  db.referralLinks.set(link.link_id, link);
  jsonResp(res, 201, { success: true, link });
}

// GET /api/affiliate/links?partner_id= — Links auflisten
function listLinks(req, res, query) {
  let links = [...db.referralLinks.values()];
  if (query.partner_id) links = links.filter(l => l.partner_id === query.partner_id);
  if (query.campaign) links = links.filter(l => l.campaign === query.campaign);

  links = links.map(l => {
    const clicks = db.clicks.filter(c => c.link_id === l.link_id).length;
    const signups = [...db.signups.values()].filter(s => s.link_id === l.link_id).length;
    return { ...l, clicks, signups, conversion_rate: clicks > 0 ? Math.round(signups / clicks * 10000) / 100 : 0 };
  });

  jsonResp(res, 200, { links, total: links.length });
}

// POST /api/affiliate/track/click — Klick tracken
async function trackClick(req, res) {
  const body = await readBody(req);
  if (!body.ref_code) return jsonResp(res, 400, { error: 'ref_code ist Pflichtfeld' });

  const link = [...db.referralLinks.values()].find(l => l.ref_code === body.ref_code);
  if (!link) return jsonResp(res, 404, { error: 'Referral-Code nicht gefunden' });
  if (link.status !== 'active') return jsonResp(res, 410, { error: 'Link ist deaktiviert' });

  const click = {
    click_id: genId('clk_'),
    link_id: link.link_id,
    partner_id: link.partner_id,
    ref_code: body.ref_code,
    ip: body.ip || req.socket.remoteAddress,
    user_agent: body.user_agent || req.headers['user-agent'] || '',
    referrer: body.referrer || '',
    timestamp: now()
  };
  db.clicks.push(click);
  jsonResp(res, 200, { success: true, click_id: click.click_id, redirect_to: link.target_url });
}

// POST /api/affiliate/track/signup — Signup tracken
async function trackSignup(req, res) {
  const body = await readBody(req);
  if (!body.ref_code || !body.user_id) {
    return jsonResp(res, 400, { error: 'ref_code und user_id sind Pflichtfelder' });
  }

  const link = [...db.referralLinks.values()].find(l => l.ref_code === body.ref_code);
  if (!link) return jsonResp(res, 404, { error: 'Referral-Code nicht gefunden' });

  // Duplikat-Check
  for (const s of db.signups.values()) {
    if (s.user_id === body.user_id) {
      return jsonResp(res, 409, { error: 'User bereits als Signup registriert', signup_id: s.signup_id });
    }
  }

  const signup = {
    signup_id: genId('sig_'),
    link_id: link.link_id,
    partner_id: link.partner_id,
    ref_code: body.ref_code,
    user_id: body.user_id,
    email: body.email || null,
    plan: body.plan || 'free',
    metadata: body.metadata || {},
    timestamp: now()
  };
  db.signups.set(signup.signup_id, signup);
  jsonResp(res, 201, { success: true, signup });
}

// POST /api/affiliate/track/conversion — Conversion tracken + Provision berechnen
async function trackConversion(req, res) {
  const body = await readBody(req);
  if (!body.partner_id || !body.amount) {
    return jsonResp(res, 400, { error: 'partner_id und amount sind Pflichtfelder' });
  }
  if (!db.partners.has(body.partner_id)) return jsonResp(res, 404, { error: 'Partner nicht gefunden' });

  const partnerConversions = db.conversions.filter(c => c.partner_id === body.partner_id).length;
  const rate = body.commission_rate || getCommissionRate(partnerConversions);
  const commission = Math.round(body.amount * rate * 100) / 100;

  const conversion = {
    conversion_id: genId('con_'),
    partner_id: body.partner_id,
    user_id: body.user_id || null,
    signup_id: body.signup_id || null,
    type: body.type || 'purchase', // purchase, subscription, upgrade
    amount: body.amount,
    currency: body.currency || 'EUR',
    commission_rate: rate,
    commission,
    description: body.description || '',
    timestamp: now()
  };
  db.conversions.push(conversion);
  jsonResp(res, 201, { success: true, conversion });
}

// GET /api/affiliate/tracking/:partnerId — Tracking-Uebersicht
function getTracking(req, res, partnerId) {
  if (!db.partners.has(partnerId)) return jsonResp(res, 404, { error: 'Partner nicht gefunden' });
  const stats = getPartnerStats(partnerId);
  const links = [...db.referralLinks.values()].filter(l => l.partner_id === partnerId);

  // Letzte 20 Events
  const recentClicks = db.clicks.filter(c => c.partner_id === partnerId).slice(-10);
  const recentConversions = db.conversions.filter(c => c.partner_id === partnerId).slice(-10);

  jsonResp(res, 200, { partner_id: partnerId, stats, links_count: links.length, recent_clicks: recentClicks, recent_conversions: recentConversions });
}

// POST /api/affiliate/payouts — Auszahlung anfordern
async function createPayout(req, res) {
  const body = await readBody(req);
  if (!body.partner_id) return jsonResp(res, 400, { error: 'partner_id ist Pflichtfeld' });

  const partner = db.partners.get(body.partner_id);
  if (!partner) return jsonResp(res, 404, { error: 'Partner nicht gefunden' });

  const stats = getPartnerStats(body.partner_id);
  const amount = body.amount || stats.balance;

  if (amount <= 0) return jsonResp(res, 400, { error: 'Kein Guthaben verfuegbar', balance: stats.balance });
  if (amount > stats.balance) return jsonResp(res, 400, { error: 'Betrag uebersteigt Guthaben', balance: stats.balance, requested: amount });
  if (amount < PAYOUT_THRESHOLD) {
    return jsonResp(res, 400, { error: `Mindestbetrag fuer Auszahlung: ${PAYOUT_THRESHOLD} EUR`, balance: stats.balance });
  }

  const payout = {
    payout_id: genId('pay_'),
    partner_id: body.partner_id,
    amount: Math.round(amount * 100) / 100,
    currency: 'EUR',
    method: partner.payout_method,
    details: partner.payout_details,
    status: 'pending', // pending -> processing -> completed / failed
    requested_at: now(),
    processed_at: null,
    completed_at: null,
    notes: body.notes || ''
  };
  db.payouts.set(payout.payout_id, payout);
  jsonResp(res, 201, { success: true, payout });
}

// GET /api/affiliate/payouts?partner_id= — Auszahlungen auflisten
function listPayouts(req, res, query) {
  let payouts = [...db.payouts.values()];
  if (query.partner_id) payouts = payouts.filter(p => p.partner_id === query.partner_id);
  if (query.status) payouts = payouts.filter(p => p.status === query.status);
  payouts.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  jsonResp(res, 200, { payouts, total: payouts.length });
}

// PUT /api/affiliate/payouts/:id — Auszahlung Status aendern (Admin)
async function updatePayout(req, res, payoutId) {
  const payout = db.payouts.get(payoutId);
  if (!payout) return jsonResp(res, 404, { error: 'Payout nicht gefunden' });

  const body = await readBody(req);
  const validTransitions = {
    pending: ['processing', 'failed', 'cancelled'],
    processing: ['completed', 'failed'],
    failed: ['pending'],
    cancelled: []
  };
  if (body.status) {
    if (!validTransitions[payout.status]?.includes(body.status)) {
      return jsonResp(res, 400, { error: `Ungültiger Status-Wechsel: ${payout.status} -> ${body.status}` });
    }
    payout.status = body.status;
    if (body.status === 'processing') payout.processed_at = now();
    if (body.status === 'completed') payout.completed_at = now();
  }
  if (body.notes) payout.notes = body.notes;
  jsonResp(res, 200, { success: true, payout });
}

// POST /api/affiliate/payouts/auto — Automatische Auszahlungen
async function autoPayouts(req, res) {
  const results = [];
  for (const partner of db.partners.values()) {
    if (partner.status !== 'active') continue;
    const stats = getPartnerStats(partner.partner_id);
    if (stats.balance >= PAYOUT_THRESHOLD) {
      const payout = {
        payout_id: genId('pay_'),
        partner_id: partner.partner_id,
        amount: Math.round(stats.balance * 100) / 100,
        currency: 'EUR',
        method: partner.payout_method,
        details: partner.payout_details,
        status: 'pending',
        requested_at: now(),
        processed_at: null,
        completed_at: null,
        notes: 'Auto-Payout'
      };
      db.payouts.set(payout.payout_id, payout);
      results.push({ partner_id: partner.partner_id, name: partner.name, amount: payout.amount, payout_id: payout.payout_id });
    }
  }
  jsonResp(res, 200, { success: true, auto_payouts: results, count: results.length });
}

// GET /api/affiliate/reports/summary — Gesamtbericht
function reportSummary(req, res) {
  const totalPartners = db.partners.size;
  const activePartners = [...db.partners.values()].filter(p => p.status === 'active').length;
  const totalClicks = db.clicks.length;
  const totalSignups = db.signups.size;
  const totalConversions = db.conversions.length;
  const totalRevenue = db.conversions.reduce((s, c) => s + c.amount, 0);
  const totalCommission = db.conversions.reduce((s, c) => s + c.commission, 0);
  const totalPaidOut = [...db.payouts.values()].filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);

  // Top 5 Partner
  const partnerStats = [...db.partners.values()].map(p => ({
    partner_id: p.partner_id, name: p.name, ...getPartnerStats(p.partner_id)
  }));
  partnerStats.sort((a, b) => b.total_commission - a.total_commission);

  // 24h Stats
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const clicks24h = db.clicks.filter(c => c.timestamp > oneDayAgo).length;
  const conversions24h = db.conversions.filter(c => c.timestamp > oneDayAgo).length;
  const revenue24h = db.conversions.filter(c => c.timestamp > oneDayAgo).reduce((s, c) => s + c.amount, 0);

  jsonResp(res, 200, {
    overview: {
      total_partners: totalPartners,
      active_partners: activePartners,
      total_clicks: totalClicks,
      total_signups: totalSignups,
      total_conversions: totalConversions,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_commission: Math.round(totalCommission * 100) / 100,
      total_paid_out: Math.round(totalPaidOut * 100) / 100,
      outstanding: Math.round((totalCommission - totalPaidOut) * 100) / 100,
      global_conversion_rate: totalClicks > 0 ? Math.round(totalConversions / totalClicks * 10000) / 100 : 0
    },
    last_24h: { clicks: clicks24h, conversions: conversions24h, revenue: Math.round(revenue24h * 100) / 100 },
    top_partners: partnerStats.slice(0, 5),
    commission_tiers: db.commissionTiers
  });
}

// GET /api/affiliate/stats — Schnell-Stats
function quickStats(req, res) {
  jsonResp(res, 200, {
    partners: db.partners.size,
    links: db.referralLinks.size,
    clicks: db.clicks.length,
    signups: db.signups.size,
    conversions: db.conversions.length,
    payouts: db.payouts.size,
    uptime: process.uptime()
  });
}

// ─── Router ──────────────────────────────────────────────────────────────
function parseQuery(urlStr) {
  try {
    const u = new URL(urlStr, 'http://localhost');
    const q = {};
    u.searchParams.forEach((v, k) => { q[k] = v; });
    return { path: u.pathname, query: q };
  } catch {
    return { path: urlStr.split('?')[0], query: {} };
  }
}

async function router(req, res) {
  const { path, query } = parseQuery(req.url);
  const method = req.method.toUpperCase();

  // CORS Preflight
  if (method === 'OPTIONS') return jsonResp(res, 204, {});

  const p = path.replace(/\/+$/, ''); // trailing slash entfernen
  const segments = p.split('/').filter(Boolean);
  // /api/affiliate/...
  const route = segments.slice(2).join('/'); // nach "api/affiliate"

  try {
    // Partners
    if (route === 'partners' && method === 'POST') return await createPartner(req, res);
    if (route === 'partners' && method === 'GET') return listPartners(req, res);
    if (route.startsWith('partners/') && method === 'GET') return getPartner(req, res, segments[4]);
    if (route.startsWith('partners/') && method === 'PUT') return await updatePartner(req, res, segments[4]);

    // Links
    if (route === 'links' && method === 'POST') return await createLink(req, res);
    if (route === 'links' && method === 'GET') return listLinks(req, res, query);

    // Tracking
    if (route === 'track/click' && method === 'POST') return await trackClick(req, res);
    if (route === 'track/signup' && method === 'POST') return await trackSignup(req, res);
    if (route === 'track/conversion' && method === 'POST') return await trackConversion(req, res);
    if (route.startsWith('tracking/') && method === 'GET') return getTracking(req, res, segments[4]);

    // Payouts
    if (route === 'payouts' && method === 'POST') return await createPayout(req, res);
    if (route === 'payouts' && method === 'GET') return listPayouts(req, res, query);
    if (route === 'payouts/auto' && method === 'POST') return await autoPayouts(req, res);
    if (route.startsWith('payouts/') && method === 'PUT') return await updatePayout(req, res, segments[4]);

    // Reports
    if (route === 'reports/summary' && method === 'GET') return reportSummary(req, res);

    // Stats
    if (route === 'stats' && method === 'GET') return quickStats(req, res);

    // Health
    if (p === '/health') return jsonResp(res, 200, { status: 'ok', service: 'affiliate-backend', uptime: process.uptime() });

    jsonResp(res, 404, { error: 'Route nicht gefunden', path: p, method });
  } catch (err) {
    console.error(`[ERROR] ${method} ${p}:`, err.message);
    jsonResp(res, 500, { error: 'Interner Fehler', message: err.message });
  }
}

// ─── Server Start ────────────────────────────────────────────────────────
const server = http.createServer(router);

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  BLUN.ai Affiliate Backend — Port ${PORT}          ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Partner:    POST/GET /api/affiliate/partners    ║`);
  console.log(`║  Links:      POST/GET /api/affiliate/links       ║`);
  console.log(`║  Tracking:   POST /api/affiliate/track/click     ║`);
  console.log(`║             POST /api/affiliate/track/signup     ║`);
  console.log(`║             POST /api/affiliate/track/conversion ║`);
  console.log(`║  Payouts:    POST/GET /api/affiliate/payouts     ║`);
  console.log(`║  Auto-Pay:   POST /api/affiliate/payouts/auto    ║`);
  console.log(`║  Reports:    GET /api/affiliate/reports/summary  ║`);
  console.log(`║  Stats:      GET /api/affiliate/stats            ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});

// Export fuer Integration
module.exports = { router, db };
