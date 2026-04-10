const express = require('express');

// Middleware to handle raw body for Stripe webhooks
function stripeWebhookMiddleware(req, res, next) {
  if (req.originalUrl === '/api/billing/webhook') {
    // For Stripe webhooks, we need the raw body
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    next();
  }
}

// Middleware to verify Stripe webhook signature
function verifyStripeSignature(req, res, next) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).send('Missing Stripe signature');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  next();
}

module.exports = {
  stripeWebhookMiddleware,
  verifyStripeSignature
};