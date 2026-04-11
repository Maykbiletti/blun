const express = require("express");
const { pool } = require("../../db");

const router = express.Router();

function resolvePaymentStatus(invoiceStatus, subscriptionStatus) {
  if (invoiceStatus === "paid" || invoiceStatus === "succeeded") return "paid";
  if (invoiceStatus === "open" || invoiceStatus === "draft") return "pending";
  if (invoiceStatus === "past_due" || invoiceStatus === "payment_failed" || invoiceStatus === "uncollectible") return "failed";

  if (subscriptionStatus === "active") return "paid";
  if (subscriptionStatus === "incomplete" || subscriptionStatus === "cancelling") return "pending";
  if (subscriptionStatus === "cancelled" || subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") return "failed";

  return "unknown";
}

router.get("/health", async function(req, res) {
  try {
    var subscriptionSummaryResult = await pool.query(
      "SELECT COALESCE(status, 'unknown') AS status, COUNT(*)::int AS count FROM subscriptions GROUP BY status"
    );

    var latestSubscriptionResult = await pool.query(
      "SELECT id, user_id, company_id, plan, status, created_at, updated_at FROM subscriptions ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1"
    );

    var openInvoicesResult = await pool.query(
      "SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_cents), 0)::bigint AS amount_cents FROM invoices WHERE status IN ('open', 'draft', 'past_due', 'payment_failed', 'uncollectible')"
    );

    var openInvoiceListResult = await pool.query(
      "SELECT id, user_id, stripe_invoice_id, amount_cents, currency, status, created_at FROM invoices WHERE status IN ('open', 'draft', 'past_due', 'payment_failed', 'uncollectible') ORDER BY created_at DESC LIMIT 25"
    );

    var invoiceTotalsResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM invoices"
    );

    var latestInvoiceResult = await pool.query(
      "SELECT id, user_id, stripe_invoice_id, amount_cents, currency, status, created_at FROM invoices ORDER BY created_at DESC LIMIT 1"
    );

    var latestSubscription = latestSubscriptionResult.rows[0] || null;
    var latestInvoice = latestInvoiceResult.rows[0] || null;

    var paymentStatus = resolvePaymentStatus(
      latestInvoice ? latestInvoice.status : null,
      latestSubscription ? latestSubscription.status : null
    );

    var openInvoiceCount = parseInt(openInvoicesResult.rows[0]?.count || 0, 10);
    var openInvoiceAmountCents = Number(openInvoicesResult.rows[0]?.amount_cents || 0);

    var hasIssues = paymentStatus === "failed" || openInvoiceCount > 0;

    res.json({
      status: hasIssues ? "degraded" : "healthy",
      timestamp: new Date().toISOString(),
      billing_status: {
        subscriptions: subscriptionSummaryResult.rows,
        latest_subscription: latestSubscription,
      },
      open_invoices: {
        count: openInvoiceCount,
        total_amount_cents: openInvoiceAmountCents,
        invoices: openInvoiceListResult.rows,
      },
      payment_status: {
        current: paymentStatus,
        latest_invoice_status: latestInvoice ? latestInvoice.status : null,
        latest_invoice: latestInvoice,
      },
      totals: {
        invoices: parseInt(invoiceTotalsResult.rows[0]?.total || 0, 10),
      },
    });
  } catch (err) {
    console.error("[billing-health] endpoint error:", err.message);
    res.status(500).json({
      status: "error",
      error: "Failed to fetch billing health",
      details: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
