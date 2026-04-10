const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  starter: {
    name: 'Starter',
    price: 9.99,
    priceId: 'price_starter',
    features: ['5 AI Agents', 'Basic Support', '10GB Storage']
  },
  professional: {
    name: 'Professional',
    price: 29.99,
    priceId: 'price_professional',
    features: ['20 AI Agents', 'Priority Support', '100GB Storage', 'Advanced Analytics']
  },
  enterprise: {
    name: 'Enterprise',
    price: 99.99,
    priceId: 'price_enterprise',
    features: ['Unlimited AI Agents', '24/7 Support', '1TB Storage', 'Custom Integrations']
  }
};

class BillingController {
  // Create checkout session
  static async createCheckoutSession(req, res) {
    try {
      const { planId, userId } = req.body;

      if (!planId || !userId) {
        return res.status(400).json({
          error: 'Missing required fields: planId, userId'
        });
      }

      const plan = PLANS[planId];
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.features.join(', ')
            },
            unit_amount: Math.round(plan.price * 100),
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${req.headers.origin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/pricing?canceled=true`,
        customer_email: req.body.email,
        metadata: {
          userId: userId,
          planId: planId
        }
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Stripe checkout error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }

  // Handle Stripe webhooks
  static async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await BillingController.handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await BillingController.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await BillingController.handleSubscriptionCancelled(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await BillingController.handlePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await BillingController.handlePaymentFailed(event.data.object);
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  // Update subscription (upgrade/downgrade)
  static async updateSubscription(req, res) {
    try {
      const { subscriptionId, newPlanId } = req.body;

      if (!subscriptionId || !newPlanId) {
        return res.status(400).json({
          error: 'Missing required fields: subscriptionId, newPlanId'
        });
      }

      const plan = PLANS[newPlanId];
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.features.join(', ')
            },
            unit_amount: Math.round(plan.price * 100),
            recurring: {
              interval: 'month'
            }
          }
        }],
        proration_behavior: 'always_invoice'
      });

      res.json({
        subscription: updatedSubscription,
        message: 'Subscription updated successfully'
      });
    } catch (error) {
      console.error('Subscription update error:', error);
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  }

  // Download invoice PDF
  static async downloadInvoice(req, res) {
    try {
      const { invoiceId } = req.params;

      const invoice = await stripe.invoices.retrieve(invoiceId);

      if (!invoice.invoice_pdf) {
        return res.status(404).json({ error: 'Invoice PDF not available' });
      }

      // Fetch PDF from Stripe URL
      const fetch = require('node-fetch');
      const response = await fetch(invoice.invoice_pdf);

      if (!response.ok) {
        throw new Error('Failed to fetch invoice PDF');
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);

      response.body.pipe(res);
    } catch (error) {
      console.error('Invoice download error:', error);
      res.status(500).json({ error: 'Failed to download invoice' });
    }
  }

  // Get customer's current subscription
  static async getSubscription(req, res) {
    try {
      const { customerId } = req.params;

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        return res.status(404).json({ error: 'No active subscription found' });
      }

      res.json({ subscription: subscriptions.data[0] });
    } catch (error) {
      console.error('Get subscription error:', error);
      res.status(500).json({ error: 'Failed to get subscription' });
    }
  }

  // List available plans
  static async getPlans(req, res) {
    try {
      res.json({ plans: PLANS });
    } catch (error) {
      console.error('Get plans error:', error);
      res.status(500).json({ error: 'Failed to get plans' });
    }
  }

  // Helper methods for webhook events
  static async handleSubscriptionCreated(session) {
    console.log('Subscription created:', session.id);
    // TODO: Update user's subscription status in database
  }

  static async handleSubscriptionUpdated(subscription) {
    console.log('Subscription updated:', subscription.id);
    // TODO: Update user's subscription status in database
  }

  static async handleSubscriptionCancelled(subscription) {
    console.log('Subscription cancelled:', subscription.id);
    // TODO: Update user's subscription status in database
  }

  static async handlePaymentSucceeded(invoice) {
    console.log('Payment succeeded for invoice:', invoice.id);
    // TODO: Update payment status in database
  }

  static async handlePaymentFailed(invoice) {
    console.log('Payment failed for invoice:', invoice.id);
    // TODO: Handle payment failure (notify user, suspend account, etc.)
  }
}

module.exports = BillingController;