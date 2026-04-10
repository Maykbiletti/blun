// BLUN - AI Organisator | MIT License
// Stripe billing routes

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireAuth } = require('../middleware/auth');
const { PLANS, getPlanLimits } = require('../middleware/plans');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// GET /billing/plans
router.get('/plans', function(req, res) {
  var plans = Object.keys(PLANS).map(function(key) {
    var p = PLANS[key];
    return { id: key, name: p.name, price_cents: p.price, limits: p.limits };
  });
  res.json({ plans: plans });
});

// GET /billing/subscription
router.get('/subscription', authenticate, requireAuth, async function(req, res) {
  try {
    var result = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id =  ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    var sub = result.rows[0] || { plan: req.user.plan || 'free', status: 'active' };
    res.json({ subscription: sub, plan_details: getPlanLimits(sub.plan) });
  } catch (err) {
    console.error('[billing] subscription error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// GET /billing/invoices
router.get('/invoices', authenticate, requireAuth, async function(req, res) {
  try {
    var result = await pool.query(
      'SELECT * FROM invoices WHERE user_id =  ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ invoices: result.rows });
  } catch (err) {
    console.error('[billing] invoices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// POST /billing/checkout
router.post('/checkout', authenticate, requireAuth, async function(req, res) {
  try {
    var plan = req.body.plan;
    if (!plan || !PLANS[plan] || plan === 'free' || plan === 'enterprise') {
      return res.status(400).json({ error: 'Invalid plan. Use pro or team.' });
    }

    var priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_TEAM_PRICE_ID;

    // Get or create Stripe customer
    var subResult = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id =  AND stripe_customer_id IS NOT NULL LIMIT 1',
      [req.user.id]
    );
    var customerId = subResult.rows[0] ? subResult.rows[0].stripe_customer_id : null;

    if (!customerId) {
      var customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name || undefined,
        metadata: { blun_user_id: req.user.id }
      });
      customerId = customer.id;
    }

    var session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: (req.headers.origin || 'https://blun.ai') + '/billing?success=1',
      cancel_url: (req.headers.origin || 'https://blun.ai') + '/billing?cancelled=1',
      metadata: { blun_user_id: req.user.id, plan: plan }
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[billing] checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /billing/portal
router.post('/portal', authenticate, requireAuth, async function(req, res) {
  try {
    var subResult = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id =  AND stripe_customer_id IS NOT NULL LIMIT 1',
      [req.user.id]
    );
    if (!subResult.rows[0]) {
      return res.status(400).json({ error: 'No active subscription found' });
    }
    var session = await stripe.billingPortal.sessions.create({
      customer: subResult.rows[0].stripe_customer_id,
      return_url: (req.headers.origin || 'https://blun.ai') + '/billing'
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal error:', err.message);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// POST /billing/webhook
router.post('/webhook', async function(req, res) {
  var sig = req.headers['stripe-signature'];
  var event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing] webhook signature failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        var session = event.data.object;
        var userId = session.metadata.blun_user_id;
        var plan = session.metadata.plan;
        var customerId = session.customer;
        var subscriptionId = session.subscription;

        await pool.query(
          'INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status) VALUES (, , , , ) ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id=, stripe_subscription_id=, plan=, status=, updated_at=NOW()',
          [userId, customerId, subscriptionId, plan, 'active']
        );
        await pool.query('UPDATE users SET plan =  WHERE id = ', [plan, userId]);
        console.log('[billing] Checkout completed: user=' + userId + ' plan=' + plan);
        break;
      }
      case 'invoice.paid': {
        var invoice = event.data.object;
        var custId = invoice.customer;
        var subRes = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_customer_id =  LIMIT 1', [custId]);
        if (subRes.rows[0]) {
          await pool.query(
            'INSERT INTO invoices (user_id, stripe_invoice_id, amount_cents, currency, status, pdf_url) VALUES (, , , , , )',
            [subRes.rows[0].user_id, invoice.id, invoice.amount_paid, invoice.currency, 'paid', invoice.invoice_pdf]
          );
        }
        break;
      }
      case 'customer.subscription.updated': {
        var sub = event.data.object;
        await pool.query(
          'UPDATE subscriptions SET status=, current_period_start=to_timestamp(), current_period_end=to_timestamp(), updated_at=NOW() WHERE stripe_subscription_id=',
          [sub.status, sub.current_period_start, sub.current_period_end, sub.id]
        );
        break;
      }
      case 'customer.subscription.deleted': {
        var del = event.data.object;
        await pool.query(
          'UPDATE subscriptions SET status=, plan=, updated_at=NOW() WHERE stripe_subscription_id=',
          ['cancelled', 'free', del.id]
        );
        var delRes = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_subscription_id=', [del.id]);
        if (delRes.rows[0]) {
          await pool.query('UPDATE users SET plan =  WHERE id = ', ['free', delRes.rows[0].user_id]);
        }
        console.log('[billing] Subscription cancelled: ' + del.id);
        break;
      }
    }
  } catch (err) {
    console.error('[billing] webhook handler error:', err.message);
  }

  res.json({ received: true });
});

// Serve billing page
var path = require("path");
router.get("/", authenticate, function(req, res) {
  if (!req.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "..", "..", "dashboard", "billing.html"));
});
module.exports = router;
