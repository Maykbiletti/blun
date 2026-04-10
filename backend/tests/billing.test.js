const request = require('supertest');
const express = require('express');
const billingRoutes = require('../routes/billing');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test'
        })
      }
    },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        items: {
          data: [{ id: 'si_test_123' }]
        }
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'active'
      }),
      list: jest.fn().mockResolvedValue({
        data: [{
          id: 'sub_test_123',
          status: 'active'
        }]
      })
    },
    invoices: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'in_test_123',
        invoice_pdf: 'https://files.stripe.com/test.pdf'
      })
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            metadata: {
              userId: 'user123',
              planId: 'starter'
            }
          }
        }
      })
    }
  }));
});

// Mock node-fetch for invoice PDF download
jest.mock('node-fetch', () => jest.fn().mockResolvedValue({
  ok: true,
  body: {
    pipe: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/billing', billingRoutes);

describe('Billing Controller Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
  });

  describe('POST /api/billing/checkout', () => {
    it('should create a checkout session successfully', async () => {
      const response = await request(app)
        .post('/api/billing/checkout')
        .send({
          planId: 'starter',
          userId: 'user123',
          email: 'test@example.com'
        })
        .expect(200);

      expect(response.body).toHaveProperty('sessionId', 'cs_test_123');
      expect(response.body).toHaveProperty('url', 'https://checkout.stripe.com/test');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/billing/checkout')
        .send({
          planId: 'starter'
          // missing userId
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields: planId, userId');
    });

    it('should return 400 for invalid plan ID', async () => {
      const response = await request(app)
        .post('/api/billing/checkout')
        .send({
          planId: 'invalid',
          userId: 'user123',
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid plan ID');
    });
  });

  describe('POST /api/billing/webhook', () => {
    it('should handle webhook successfully', async () => {
      const response = await request(app)
        .post('/api/billing/webhook')
        .set('stripe-signature', 'test_signature')
        .send({ test: 'data' })
        .expect(200);

      expect(response.body).toHaveProperty('received', true);
    });

    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/api/billing/webhook')
        .send({ test: 'data' })
        .expect(400);

      expect(response.text).toBe('Missing Stripe signature');
    });
  });

  describe('PUT /api/billing/subscription', () => {
    it('should update subscription successfully', async () => {
      const response = await request(app)
        .put('/api/billing/subscription')
        .send({
          subscriptionId: 'sub_test_123',
          newPlanId: 'professional'
        })
        .expect(200);

      expect(response.body).toHaveProperty('subscription');
      expect(response.body).toHaveProperty('message', 'Subscription updated successfully');
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .put('/api/billing/subscription')
        .send({
          subscriptionId: 'sub_test_123'
          // missing newPlanId
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields: subscriptionId, newPlanId');
    });
  });

  describe('GET /api/billing/subscription/:customerId', () => {
    it('should get customer subscription', async () => {
      const response = await request(app)
        .get('/api/billing/subscription/cus_test_123')
        .expect(200);

      expect(response.body).toHaveProperty('subscription');
    });
  });

  describe('GET /api/billing/invoice/:invoiceId/download', () => {
    it('should download invoice PDF', async () => {
      const response = await request(app)
        .get('/api/billing/invoice/in_test_123/download')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('GET /api/billing/plans', () => {
    it('should get available plans', async () => {
      const response = await request(app)
        .get('/api/billing/plans')
        .expect(200);

      expect(response.body).toHaveProperty('plans');
      expect(response.body.plans).toHaveProperty('starter');
      expect(response.body.plans).toHaveProperty('professional');
      expect(response.body.plans).toHaveProperty('enterprise');
    });
  });
});

// Integration test for complete checkout flow
describe('Checkout Flow Integration Test', () => {
  it('should complete full checkout flow', async () => {
    // 1. Get plans
    const plansResponse = await request(app)
      .get('/api/billing/plans')
      .expect(200);

    expect(plansResponse.body.plans).toHaveProperty('starter');

    // 2. Create checkout session
    const checkoutResponse = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'starter',
        userId: 'user123',
        email: 'test@example.com'
      })
      .expect(200);

    expect(checkoutResponse.body).toHaveProperty('sessionId');
    expect(checkoutResponse.body).toHaveProperty('url');

    // 3. Simulate webhook (subscription created)
    const webhookResponse = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test_signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: checkoutResponse.body.sessionId,
            metadata: {
              userId: 'user123',
              planId: 'starter'
            }
          }
        }
      })
      .expect(200);

    expect(webhookResponse.body).toHaveProperty('received', true);
  });
});