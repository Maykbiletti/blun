// BLUN - AI Organisator | MIT License
// Plan limits middleware

const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    limits: { agents: 3, companies: 1, messages_per_day: 100, local_models: 2, cloud_models: 0, shared_projects: false, federation: false, admin_panel: false }
  },
  pro: {
    name: 'Pro',
    price: 2000,
    limits: { agents: 20, companies: 10, messages_per_day: -1, local_models: -1, cloud_models: 3, shared_projects: true, federation: false, admin_panel: false }
  },
  max: {
    name: 'Max',
    price: 10000,
    limits: { agents: -1, companies: -1, messages_per_day: -1, local_models: -1, cloud_models: 10, shared_projects: true, federation: true, admin_panel: true }
  },
  enterprise: {
    name: 'Enterprise',
    price: -1,
    limits: { agents: -1, companies: -1, messages_per_day: -1, local_models: -1, cloud_models: -1, shared_projects: true, federation: true, admin_panel: true }
  }
};

function getPlanLimits(plan) {
  return PLANS[plan] || PLANS.free;
}

function requirePlan(minPlan) {
  var order = ['free', 'pro', 'max', 'enterprise'];
  return function(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    var userPlan = req.user.plan || 'free';
    if (order.indexOf(userPlan) < order.indexOf(minPlan)) {
      return res.status(403).json({ error: 'Plan upgrade required. Minimum: ' + minPlan });
    }
    next();
  };
}

function checkLimit(resource) {
  return async function(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    var plan = getPlanLimits(req.user.plan || 'free');
    var limit = plan.limits[resource];
    if (limit === -1) return next();
    req.planLimit = limit;
    req.planName = req.user.plan || 'free';
    next();
  };
}

module.exports = { PLANS, getPlanLimits, requirePlan, checkLimit };
