// BLUN - AI Organisator | MIT License

require("dotenv").config();
/**
 * BLUN — Event-Driven AI Agent Framework
 *
 * Main entry point. Sets up Express HTTP server with WebSocket upgrade,
 * Redis pub/sub for inter-process communication, and PostgreSQL for persistence.
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const path = require("path");

const { pool } = require("./src/db");
const { pub } = require("./src/redis");
const { attachWS } = require("./src/ws");

const apiRoutes = require("./src/routes/api");
const chatRoutes = require("./src/routes/chat");
const adminRoutes = require("./src/routes/admin");
const authRoutes = require("./src/routes/auth");
const { authenticate } = require("./src/middleware/auth");
const billingRoutes = require("./src/routes/billing");
const { router: skillsRoutes, getAgentSkills } = require("./src/routes/skills");
const organisatorRoutes = require("./src/routes/organisator");
const telegramRoutes = require("./src/routes/telegram");
const federationRoutes = require("./src/routes/federation");
const adminPanelRoutes = require("./src/routes/admin-panel");
const privacyRoutes = require("./src/routes/privacy");
const canvasRoutes = require("./src/routes/canvas");
const supportChatRoutes = require("./src/routes/support-chat");
const websitesRoutes = require("./src/routes/websites");
const softwareRoutes = require("./src/routes/software");
const websiteWizardRoutes = require("./src/routes/website-wizard");
const modelsRoutes = require("./src/routes/models");
const profileRoutes = require("./src/routes/profile");
const contactRoutes = require("./src/routes/contact");
const newsletterRoutes = require("./src/routes/newsletter");
const voiceRoutes = require("./src/routes/voice");
const blunCodeRoutes = require("./src/routes/blun-code");
const monitorRoutes = require("./src/routes/monitor");
const adminPlansRoutes = require("./src/routes/admin-plans");
const i18nRoutes = require("./src/routes/i18n");
const teamsRoutes = require("./src/routes/teams");
const connectionsRoutes = require("./src/routes/connections");
const { startAllBots, activeBots } = require("./src/channels/telegram");

const PORT = parseInt(process.env.BLUN_PORT || "3200", 10);
const API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";

const app = express();

// Landing page route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/dashboard/landing.html');
});

// Impressum page (public)
app.get("/:lang(en|de|es|fr|pt|tr)", function(req, res) { res.redirect("/?lang=" + req.params.lang); });
app.get("/impressum", (req, res) => {
  res.sendFile(__dirname + "/dashboard/impressum.html");
});
app.get("/datenschutz", (req, res) => { res.sendFile(__dirname + "/dashboard/datenschutz.html"); });
app.get("/contact", function(req, res) { res.sendFile(__dirname + "/dashboard/contact.html"); });
app.get("/feature/websites", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-websites.html"); });app.get("/feature/software", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-software.html"); });app.get("/feature/assistants", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-assistants.html"); });app.get("/feature/compare", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-compare.html"); });app.get("/feature/local-ai", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-local-ai.html"); });app.get("/feature/everything", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-everything.html"); });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
// Stripe webhook needs raw body before JSON parser
app.use("/billing/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10mb" }));
app.use(morgan("short"));
app.use(cookieParser());

app.use("/api/i18n", i18nRoutes);
// Auth middleware — accept cookie session OR x-blun-key header
app.use("/api", function (req, res, next) {
  if (req.path === "/health" || req.path === "/admin/health" || req.path === "/contact" || req.path === "/newsletter/subscribe" || req.path === "/newsletter/unsubscribe") return next();
  // Check API key first (for programmatic access)
  var key = req.headers["x-blun-key"];
  if (key && key === API_KEY) return next();
  // Otherwise use session-based auth
  authenticate(req, res, function () {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required. Send x-blun-key header or login." });
    }
    next();
  });
});

app.use("/auth", authRoutes);
app.use("/billing", billingRoutes);
app.use("/admin-panel", adminPanelRoutes);
app.use("/privacy", privacyRoutes);
app.use("/canvas", authenticate, canvasRoutes);
app.use("/websites", websitesRoutes);
app.use("/software", softwareRoutes);
app.use("/api/website-wizard", websiteWizardRoutes);
app.use("/api/models", modelsRoutes);
app.use("/api/profile", authenticate, profileRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/blun-code/message", function(req,res,next){ if(req.method==="POST") monitorRoutes.incrementRequestCounter(); next(); });
app.use("/api/blun-code", blunCodeRoutes);
app.use("/api/monitor", monitorRoutes);
app.use("/api/admin/plans", adminPlansRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/support", supportChatRoutes);
app.get("/support-widget.js", function(req, res) { res.sendFile(__dirname + "/dashboard/support-widget.js"); });
app.get("/i18n-loader.js", function(req, res) { res.sendFile(__dirname + "/dashboard/i18n-loader.js"); });

app.use("/api", apiRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/skills", skillsRoutes);
app.get("/api/agents/:id/skills", getAgentSkills);

// KI-Organisator routes (auth handled inside)
app.use("/api/organisator", organisatorRoutes);

// Telegram channel integration (API)
app.use("/telegram/api", telegramRoutes);

// Federation (receive is public, rest requires auth)
app.use("/federation", federationRoutes);

// --- Page routes (authenticated) ---
function authPage(path, file, adminOnly) {
  app.get(path, authenticate, function (req, res) {
    if (!req.user) return res.redirect("/login");
    if (adminOnly && req.user.role !== "admin" && req.user.role !== "owner") return res.redirect("/dashboard");
    res.sendFile(__dirname + "/dashboard/" + file);
  });
}

authPage("/federation-dashboard", "federation.html");
authPage("/organisator", "organisator.html");
authPage("/admin-panel", "admin-panel.html", true);
authPage("/newsletter", "newsletter.html", true);
authPage("/privacy-settings", "privacy.html");
authPage("/canvas", "canvas.html");
authPage("/telegram", "telegram.html");
authPage("/profile", "profile.html");
authPage("/voice", "voice.html");
authPage("/dashboard/websites", "websites.html");
authPage("/dashboard/software", "software.html");
authPage("/dashboard/website-wizard", "website-wizard.html");
authPage("/dashboard/models", "models.html");
authPage("/dashboard/blun-code", "blun-code.html");
authPage("/dashboard/teams", "teams.html");
authPage("/dashboard/connections", "connections.html");
authPage("/dashboard/billing", "billing.html");
authPage("/monitor", "monitor.html", true);
authPage("/admin-plans", "admin-plans.html", true);

app.get("/login", function (req, res) {
  res.sendFile(__dirname + "/dashboard/login.html");
});

app.get("/dashboard", authenticate, function (req, res) {
  if (!req.user) return res.redirect("/login");
  res.sendFile(__dirname + "/dashboard/index.html");
});

app.use("/dashboard", express.static(path.join(__dirname, "dashboard")));

app.use(function (err, req, res, _next) {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

var server = http.createServer(app);
attachWS(server);

async function start() {
  try {
    var result = await pool.query("SELECT NOW() AS ts");
    console.log("[db] Connected to PostgreSQL — " + result.rows[0].ts);
  } catch (err) {
    console.error("[db] Failed to connect to PostgreSQL:", err.message);
    console.error("[db] Run: npm run db:init");
    process.exit(1);
  }

  try {
    var pong = await pub.ping();
    console.log("[redis] Connected — " + pong);
  } catch (err) {
    console.error("[redis] Failed to connect:", err.message);
    process.exit(1);
  }

  // Start all enabled Telegram bots
  try { await startAllBots(); } catch (err) { console.error("[telegram] Boot error:", err.message); }

  server.listen(PORT, function () {
    console.log("");
    console.log("  BLUN v2.0.0 — AI Organisator");
    console.log("  HTTP + WebSocket on port " + PORT);
    console.log("  API Key: " + API_KEY.slice(0, 8) + "...");
    console.log("");
  });
}

process.on("SIGTERM", function () { shutdown("SIGTERM"); });
process.on("SIGINT", function () { shutdown("SIGINT"); });

async function shutdown(signal) {
  console.log("\n[server] " + signal + " received — shutting down...");
  server.close();
  // Stop all Telegram bots
  try { for (var [,b] of activeBots) b.stop(); } catch(e) {}
  await pool.end();
  await pub.quit();
  process.exit(0);
}

start();

