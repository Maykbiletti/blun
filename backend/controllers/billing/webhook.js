const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

const handleCheckoutCompleted = async (session) => {
  console.log('Checkout completed:', session.id);
  // TODO: Update user subscription in database
  const userId = session.metadata?.userId;
  const planType = session.metadata?.planType;

  if (userId && planType) {
    // Here you would update the user's subscription in your database
    console.log(`User ${userId} subscribed to ${planType} plan`);
  }
};

const handleSubscriptionCreated = async (subscription) => {
  console.log('Subscription created:', subscription.id);
  // TODO: Update user subscription in database
};

const handleSubscriptionUpdated = async (subscription) => {
  console.log('Subscription updated:', subscription.id);
  // TODO: Update user subscription in database

  const customerId = subscription.customer;
  const status = subscription.status;
  const currentPeriodEnd = subscription.current_period_end;

  console.log(`Subscription ${subscription.id} status: ${status}, ends: ${new Date(currentPeriodEnd * 1000)}`);
};

const handleSubscriptionDeleted = async (subscription) => {
  console.log('Subscription deleted:', subscription.id);
  // TODO: Update user subscription in database to inactive
};

const handleInvoicePaymentSucceeded = async (invoice) => {
  console.log('Invoice payment succeeded:', invoice.id);
  // TODO: Update payment history in database
};

const handleInvoicePaymentFailed = async (invoice) => {
  console.log('Invoice payment failed:', invoice.id);
  // TODO: Handle failed payment (notify user, suspend service, etc.)
};

module.exports = {
  handleWebhook
};