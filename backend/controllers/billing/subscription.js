const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const getSubscription = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({ error: 'Missing customer ID' });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.json({ subscription: null });
    }

    const subscription = subscriptions.data[0];
    res.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        items: subscription.items.data.map(item => ({
          id: item.id,
          price: {
            id: item.price.id,
            unit_amount: item.price.unit_amount,
            currency: item.price.currency,
            recurring: item.price.recurring
          }
        }))
      }
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
};

const updateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { newPriceId, prorationBehavior = 'always_invoice' } = req.body;

    if (!subscriptionId || !newPriceId) {
      return res.status(400).json({ error: 'Missing subscription ID or new price ID' });
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Update subscription with new price
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId,
      }],
      proration_behavior: prorationBehavior,
    });

    res.json({
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        current_period_start: updatedSubscription.current_period_start,
        current_period_end: updatedSubscription.current_period_end,
        proration_behavior: prorationBehavior
      }
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { cancelAtPeriodEnd = true } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'Missing subscription ID' });
    }

    let canceledSubscription;

    if (cancelAtPeriodEnd) {
      // Cancel at period end (downgrade at end of billing cycle)
      canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });
    } else {
      // Cancel immediately
      canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
    }

    res.json({
      subscription: {
        id: canceledSubscription.id,
        status: canceledSubscription.status,
        cancel_at_period_end: canceledSubscription.cancel_at_period_end,
        canceled_at: canceledSubscription.canceled_at,
        current_period_end: canceledSubscription.current_period_end
      }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

const reactivateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'Missing subscription ID' });
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });

    res.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end
      }
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
};

module.exports = {
  getSubscription,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription
};