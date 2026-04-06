// BLUN - AI Organisator | MIT License
// Stripe billing routes — Payment Element (inline)

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireAuth } = require('../middleware/auth');
const { PLANS, getPlanLimits } = require('../middleware/plans');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// GET /billing/api/config — public key for Stripe.js
router.get('/api/config', function(req, res) {
  res.json({ publicKey: process.env.STRIPE_PUBLIC_KEY || 'pk_test_placeholder' });
});

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
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    var sub = result.rows[0] || { plan: req.user.plan || 'free', status: 'active' };
    res.json({ subscription: sub, plan_details: getPlanLimits(sub.plan) });
  } catch (err) {
    console.error('[billing] subscription error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// GET /billing/api/subscription — alias for Payment Element flow
router.get('/api/subscription', authenticate, requireAuth, async function(req, res) {
  try {
    var result = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    var sub = result.rows[0] || { plan: req.user.plan || 'free', status: 'active' };
    res.json({ subscription: sub, plan_details: getPlanLimits(sub.plan) });
  } catch (err) {
    console.error('[billing] api/subscription error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// GET /billing/invoices
router.get('/invoices', authenticate, requireAuth, async function(req, res) {
  try {
    var result = await pool.query(
      'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ invoices: result.rows });
  } catch (err) {
    console.error('[billing] invoices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// POST /billing/api/create-subscription — Payment Element flow
router.post('/api/create-subscription', authenticate, requireAuth, async function(req, res) {
  try {
    var plan = req.body.plan;
    if (!plan || !PLANS[plan] || plan === 'free' || plan === 'enterprise') {
      return res.status(400).json({ error: 'Invalid plan. Use pro or team.' });
    }

    var priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_TEAM_PRICE_ID;

    // Get or create Stripe customer
    var subResult = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
      [req.user.id]
    );
    var customerId = subResult.rows[0] ? subResult.rows[0].stripe_customer_id : null;

    if (!customerId) {
      var customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name || undefined,
        metadata: { blun_user_id: String(req.user.id) }
      });
      customerId = customer.id;
    }

    // Check for existing active subscription to update
    var existingSub = await pool.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2 AND stripe_subscription_id IS NOT NULL LIMIT 1',
      [req.user.id, 'active']
    );

    if (existingSub.rows[0] && existingSub.rows[0].stripe_subscription_id) {
      // Update existing subscription (upgrade/downgrade)
      var stripeSub = await stripe.subscriptions.retrieve(existingSub.rows[0].stripe_subscription_id);
      var updated = await stripe.subscriptions.update(stripeSub.id, {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        payment_behavior: 'default_incomplete',
        proration_behavior: 'create_prorations',
        expand: ['latest_invoice.payment_intent']
      });

      var clientSecret = null;
      if (updated.latest_invoice && updated.latest_invoice.payment_intent) {
        clientSecret = updated.latest_invoice.payment_intent.client_secret;
      }

      return res.json({
        subscriptionId: updated.id,
        clientSecret: clientSecret,
        status: updated.status
      });
    }

    // Create new subscription with incomplete status for Payment Element
    var subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription'
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { blun_user_id: String(req.user.id), plan: plan }
    });

    // Store subscription record
    await pool.query(
      'INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id=$2, stripe_subscription_id=$3, plan=$4, status=$5, updated_at=NOW()',
      [req.user.id, customerId, subscription.id, plan, 'incomplete']
    );

    var clientSecret2 = subscription.latest_invoice.payment_intent.client_secret;

    res.json({
      subscriptionId: subscription.id,
      clientSecret: clientSecret2,
      status: subscription.status
    });
  } catch (err) {
    console.error('[billing] create-subscription error:', err.message);
    res.status(500).json({ error: 'Failed to create subscription: ' + err.message });
  }
});

// POST /billing/api/cancel — cancel subscription
router.post('/api/cancel', authenticate, requireAuth, async function(req, res) {
  try {
    var subResult = await pool.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL AND status != $2 LIMIT 1',
      [req.user.id, 'cancelled']
    );
    if (!subResult.rows[0]) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    var cancelled = await stripe.subscriptions.update(subResult.rows[0].stripe_subscription_id, {
      cancel_at_period_end: true
    });

    await pool.query(
      'UPDATE subscriptions SET status=$1, updated_at=NOW() WHERE user_id=$2',
      ['cancelling', req.user.id]
    );

    res.json({ status: 'cancelling', cancel_at: cancelled.cancel_at });
  } catch (err) {
    console.error('[billing] cancel error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /billing/checkout — legacy fallback
router.post('/checkout', authenticate, requireAuth, async function(req, res) {
  try {
    var plan = req.body.plan;
    if (!plan || !PLANS[plan] || plan === 'free' || plan === 'enterprise') {
      return res.status(400).json({ error: 'Invalid plan. Use pro or team.' });
    }

    var priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_TEAM_PRICE_ID;

    var subResult = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
      [req.user.id]
    );
    var customerId = subResult.rows[0] ? subResult.rows[0].stripe_customer_id : null;

    if (!customerId) {
      var customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name || undefined,
        metadata: { blun_user_id: String(req.user.id) }
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
      metadata: { blun_user_id: String(req.user.id), plan: plan }
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
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
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

// POST /billing/webhook — raw body needed
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
          'INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id=$2, stripe_subscription_id=$3, plan=$4, status=$5, updated_at=NOW()',
          [userId, customerId, subscriptionId, plan, 'active']
        );
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
        console.log('[billing] Checkout completed: user=' + userId + ' plan=' + plan);
        break;
      }
      case 'invoice.paid': {
        var invoice = event.data.object;
        var custId = invoice.customer;
        var subRes = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1', [custId]);
        if (subRes.rows[0]) {
          await pool.query(
            'INSERT INTO invoices (user_id, stripe_invoice_id, amount_cents, currency, status, pdf_url) VALUES ($1, $2, $3, $4, $5, $6)',
            [subRes.rows[0].user_id, invoice.id, invoice.amount_paid, invoice.currency, 'paid', invoice.invoice_pdf]
          );
          // Activate subscription on first payment (Payment Element flow)
          await pool.query(
            'UPDATE subscriptions SET status=$1, updated_at=NOW() WHERE stripe_customer_id=$2 AND status=$3',
            ['active', custId, 'incomplete']
          );
          var planRes = await pool.query('SELECT plan FROM subscriptions WHERE stripe_customer_id=$1 LIMIT 1', [custId]);
          if (planRes.rows[0]) {
            await pool.query('UPDATE users SET plan=$1 WHERE id=$2', [planRes.rows[0].plan, subRes.rows[0].user_id]);
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        var failInv = event.data.object;
        var failCust = failInv.customer;
        console.error('[billing] Payment failed for customer:', failCust);
        await pool.query(
          'UPDATE subscriptions SET status=$1, updated_at=NOW() WHERE stripe_customer_id=$2',
          ['past_due', failCust]
        );
        break;
      }
      case 'customer.subscription.updated': {
        var sub = event.data.object;
        var newPlan = null;
        if (sub.items && sub.items.data && sub.items.data[0]) {
          var pid = sub.items.data[0].price.id;
          if (pid === process.env.STRIPE_PRO_PRICE_ID) newPlan = 'pro';
          else if (pid === process.env.STRIPE_TEAM_PRICE_ID) newPlan = 'team';
        }
        var updateQ = 'UPDATE subscriptions SET status=$1, updated_at=NOW() WHERE stripe_subscription_id=$2';
        var updateV = [sub.status, sub.id];
        if (sub.current_period_start) {
          updateQ = 'UPDATE subscriptions SET status=$1, current_period_start=to_timestamp($3), current_period_end=to_timestamp($4), updated_at=NOW() WHERE stripe_subscription_id=$2';
          updateV = [sub.status, sub.id, sub.current_period_start, sub.current_period_end];
        }
        await pool.query(updateQ, updateV);
        if (newPlan) {
          var userRes = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_subscription_id=$1', [sub.id]);
          if (userRes.rows[0]) {
            await pool.query('UPDATE subscriptions SET plan=$1 WHERE stripe_subscription_id=$2', [newPlan, sub.id]);
            await pool.query('UPDATE users SET plan=$1 WHERE id=$2', [newPlan, userRes.rows[0].user_id]);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        var del = event.data.object;
        await pool.query(
          'UPDATE subscriptions SET status=$1, plan=$2, updated_at=NOW() WHERE stripe_subscription_id=$3',
          ['cancelled', 'free', del.id]
        );
        var delRes = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_subscription_id=$1', [del.id]);
        if (delRes.rows[0]) {
          await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', delRes.rows[0].user_id]);
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
