// BLUN Tenant Context Middleware 2026-04-10
// Loads the authenticated user's company memberships and sets the active company.
// Runs AFTER authenticate so req.user is populated.

var { query, queryOne } = require("../db");

async function tenantContext(req, res, next) {
  try {
    if (!req.user || !req.user.id) return next();

    // Load all memberships for the user
    var memberships = await query(
      "SELECT cm.company_id, cm.role, c.name FROM company_members cm " +
      "JOIN companies c ON c.id = cm.company_id " +
      "WHERE cm.user_id = $1 ORDER BY cm.created_at",
      [req.user.id]
    );
    req.companyIds = memberships.map(function (m) { return m.company_id; });
    req.companies = memberships;

    // Determine active company id:
    // 1) explicit header x-company-id (must be in memberships unless admin)
    // 2) session.active_company_id
    // 3) first membership
    var hdr = req.headers["x-company-id"];
    var active = null;

    if (hdr) {
      var hId = parseInt(hdr, 10);
      if (!isNaN(hId)) {
        if (req.user.role === "admin" || req.companyIds.indexOf(hId) >= 0) {
          active = hId;
        }
      }
    }

    if (!active && req.sessionToken) {
      try {
        var srow = await queryOne(
          "SELECT active_company_id FROM sessions WHERE token = $1",
          [req.sessionToken]
        );
        if (srow && srow.active_company_id) {
          var sId = srow.active_company_id;
          if (req.user.role === "admin" || req.companyIds.indexOf(sId) >= 0) {
            active = sId;
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (!active && req.companyIds.length > 0) {
      active = req.companyIds[0];
    }

    req.activeCompanyId = active;
    return next();
  } catch (err) {
    console.error("[tenant] context error:", err.message);
    return next();
  }
}

// Helper used by routes to enforce tenant scoping in WHERE clauses.
// Returns the id to filter by, or throws if non-admin has no company.
function requireCompanyId(req) {
  if (req.user && req.user.role === "admin") {
    // Admin: honor explicit header/active, else return null (= no filter)
    var hdr = req.headers["x-company-id"];
    if (hdr) { var h = parseInt(hdr, 10); if (!isNaN(h)) return h; }
    return req.activeCompanyId || null;
  }
  if (!req.activeCompanyId) {
    var e = new Error("no active company");
    e.status = 403;
    throw e;
  }
  return req.activeCompanyId;
}

module.exports = { tenantContext, requireCompanyId };
