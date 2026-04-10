const express = require('express');

// Middleware to capture raw body for Stripe webhook signature verification
const stripeWebhookMiddleware = (req, res, next) => {
  if (req.originalUrl === '/api/billing/webhook') {
    let data = '';

    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => {
      req.body = Buffer.from(data);
      next();
    });
  } else {
    next();
  }
};

module.exports = stripeWebhookMiddleware;