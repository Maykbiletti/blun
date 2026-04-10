const express = require('express');
const BillingController = require('../controllers/billing');
const { verifyStripeSignature } = require('../middleware/stripe-webhook');

const router = express.Router();

// Create checkout session
router.post('/checkout', BillingController.createCheckoutSession);

// Stripe webhook (raw body needed for signature verification)
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  verifyStripeSignature,
  BillingController.handleWebhook
);

// Update subscription (upgrade/downgrade)
router.put('/subscription', BillingController.updateSubscription);

// Get customer subscription
router.get('/subscription/:customerId', BillingController.getSubscription);

// Download invoice PDF
router.get('/invoice/:invoiceId/download', BillingController.downloadInvoice);

// Get available plans
router.get('/plans', BillingController.getPlans);

module.exports = router;