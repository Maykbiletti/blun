const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const createCheckoutSession = async (req, res) => {
  try {
    const { priceId, userId, planType } = req.body;

    if (!priceId || !userId || !planType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${req.headers.origin}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/dashboard/billing/canceled`,
      metadata: {
        userId: userId,
        planType: planType
      },
      client_reference_id: userId
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

const getSessionStatus = async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.json({
      status: session.payment_status,
      customer_email: session.customer_details?.email,
      subscription_id: session.subscription
    });
  } catch (error) {
    console.error('Stripe session status error:', error);
    res.status(500).json({ error: 'Failed to retrieve session status' });
  }
};

module.exports = {
  createCheckoutSession,
  getSessionStatus
};