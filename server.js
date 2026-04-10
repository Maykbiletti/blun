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
const agentChatRoutes = require("./src/routes/agent-chat-route");
const performanceRoutes = require("./src/routes/performance-route");
const toolsRoutes = require("./src/routes/tools-route");
const voiceRoutes = require("./src/routes/voice");
const blunCodeRoutes = require("./src/routes/blun-code");
const monitorRoutes = require("./src/routes/monitor");
const adminPlansRoutes = require("./src/routes/admin-plans");
const tenantApiRoutes = require("./src/routes/tenant-api");
const i18nRoutes = require("./src/routes/i18n");
const teamsRoutes = require("./src/routes/teams");
const connectionsRoutes = require("./src/routes/connections");
const projectsRoutes = require("./src/routes/projects");
const dashboardStatsRoutes = require("./src/routes/dashboard-stats");
const deployRoutes = require("./src/routes/deploy");
const agentCommRoutes = require("./src/routes/agent-comm");
const statsRoutes = require("./src/routes/stats-route");
const healthDetailedRoutes = require("./src/routes/health-detailed");
const usageTrackingRoutes = require("./src/routes/usage-tracking");
const { router: companiesRoutes, companyContext } = require("./src/routes/companies");
const { startAllBots, activeBots } = require("./src/channels/telegram");

const PORT = parseInt(process.env.BLUN_PORT || "3200", 10);
const API_KEY = process.env.BLUN_API_KEY;
if (!API_KEY) {
  console.error('FATAL: BLUN_API_KEY environment variable not set. Server cannot start without proper API key.');
  process.exit(1);
}

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
app.get("/sitemap.xml", function(req, res) { res.type("application/xml").sendFile(__dirname + "/dashboard/sitemap.xml"); });
app.get("/robots.txt", function(req, res) { res.type("text/plain").sendFile(__dirname + "/dashboard/robots.txt"); });
app.get("/favicon.svg", function(req, res) { res.type("image/svg+xml").sendFile(__dirname + "/dashboard/favicon.svg"); });
app.get("/favicon.png", function(req, res) { res.type("image/png").sendFile(__dirname + "/dashboard/favicon.png"); });
app.get("/favicon.ico", function(req, res) { res.type("image/png").sendFile(__dirname + "/dashboard/favicon.png"); });
app.get("/apple-touch-icon.png", function(req, res) { res.sendFile(__dirname + "/dashboard/apple-touch-icon.png"); });
app.get("/icon-192.png", function(req, res) { res.sendFile(__dirname + "/dashboard/icon-192.png"); });
app.get("/icon-512.png", function(req, res) { res.sendFile(__dirname + "/dashboard/icon-512.png"); });
app.get("/datenschutz", (req, res) => { res.sendFile(__dirname + "/dashboard/datenschutz.html"); });
app.get("/agb", (req, res) => { res.sendFile(__dirname + "/dashboard/agb.html"); });
app.get("/contact", function(req, res) { res.sendFile(__dirname + "/dashboard/contact.html"); });
app.get("/feature/websites", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-websites.html"); });app.get("/feature/software", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-software.html"); });app.get("/feature/assistants", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-assistants.html"); });app.get("/feature/compare", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-compare.html"); });app.get("/feature/local-ai", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-local-ai.html"); });app.get("/feature/everything", function(req, res) { res.sendFile(__dirname + "/dashboard/feature-everything.html"); });

// Security Headers: Helmet + CSP
app.use(helmet({
  contentSecurityPolicy: false, _disabled_contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'sameorigin' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true
}));

// CORS: Whitelist Auth-Domains
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3200',
      'http://localhost:3000',
      'https://blun.ai',
      'https://www.blun.ai',
      'https://beta.blun.ai',
      'http://100.91.112.46:3200',
      'http://65.21.76.124:3200'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-blun-key', 'x-api-key']
};
app.use(cors(corsOptions));
// Stripe webhook needs raw body before JSON parser
app.use("/billing/webhook", express.raw({ type: "application/json" }));

app.use(require("express-fileupload")({ limits: { fileSize: 5 * 1024 * 1024 } }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("short"));
app.use(cookieParser());

// Security middleware — before all routes
const inputSanitizer = require("./src/middleware/input-sanitizer");
const inputValidator = require("./src/middleware/input-validator");
const rateLimiter = require("./src/middleware/rate-limiter");
const requestLogger = require("./src/middleware/request-logger");
const errorHandler = require("./src/middleware/error-handler");
const rateLimit = require("./src/middleware/rate-limit");
app.use(inputValidator);
app.use(inputSanitizer);
app.use(rateLimiter);

app.use("/", tenantApiRoutes);
app.use("/api/i18n", i18nRoutes);
// Auth middleware — accept cookie session OR x-blun-key header
app.use("/api", function (req, res, next) {
  if (req.path === "/health" || req.path === "/admin/health" || req.path === "/contact" || req.path === "/newsletter/subscribe" || req.path === "/newsletter/unsubscribe") return next();
  // SECURITY: Localhost bypass only in development mode mit zusätzlicher Prüfung
  if (process.env.NODE_ENV === 'development') {
    var remoteAddr = req.socket.remoteAddress || req.connection.remoteAddress || "";
    var userAgent = req.headers['user-agent'] || "";
    // Nur für echte localhost-Requests und bekannte Development-Tools
    if ((remoteAddr === "127.0.0.1" || remoteAddr === "::1") &&
        (userAgent.includes('node') || userAgent.includes('curl') || userAgent.includes('Postman'))) {
      req.user = {id:1, email:"system@blun.ai", role:"admin", name:"Development"};
      return next();
    }
  }
  // Check API key first (for programmatic access)
  var key = req.headers["x-blun-key"] || req.headers["x-api-key"];
  if (key && key === API_KEY) return next();
  // Otherwise use session-based auth
  authenticate(req, res, function () {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required. Send x-blun-key header or login." });
    }
    next();
  });
});

var { tenantContext } = require("./src/middleware/tenant");
app.use("/api", tenantContext);


app.use("/auth", authRoutes);
app.use("/billing", billingRoutes);
app.use("/admin-panel", adminPanelRoutes);
app.use("/privacy", privacyRoutes);
app.use("/canvas", authenticate, canvasRoutes);
app.use("/websites", websitesRoutes);
app.use("/software", softwareRoutes);
app.use("/api/website-wizard", websiteWizardRoutes);
app.get("/api/rate-limit-status", function(req, res) { try { var engine = require("./src/agent-engine"); res.json(engine.getRateLimitStatus ? engine.getRateLimitStatus() : {}); } catch(e) { res.json({ error: e.message }); } });

// Multi-KI Status + Query API
app.get("/api/multi-ki/status", async function(req, res) {
  try {
    var ai = require("./src/ai/ai-provider");
    var providers = Object.keys(ai.PROVIDERS);
    var models = Object.entries(ai.MODEL_REGISTRY).map(function(e) { return { id: e[0], provider: e[1].provider, active: e[1].active !== false, capabilities: e[1].capabilities, quality: e[1].qualityScore, cost: e[1].costScore, speed: e[1].latencyScore, local: e[1].local || false }; });
    // Inject running local models (llama-server processes) — makes them selectable in dropdown
    try {
      var execSync = require("child_process").execSync;
      var ps = "";
      try { ps = execSync("ps aux | grep llama-server | grep -v grep", { encoding: "utf8" }); } catch(_) {}
      var seen = {};
      ps.split("\n").forEach(function(line) {
        var m = line.match(/-m\s+(\S+\.gguf)/);
        if (!m) return;
        var file = m[1].split("/").pop().replace(/\.gguf$/, "");
        if (seen[file]) return;
        seen[file] = true;
        if (!models.find(function(x){ return x.id === file; })) {
          models.push({ id: file, provider: "local", active: true, capabilities: ["chat","code"], quality: 6, cost: 1, speed: 7, local: true, running: true });
        }
      });
      if (!providers.includes("local")) providers.push("local");
    } catch(_) {}
    res.json({ providers: providers, models: models });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/multi-ki/query", async function(req, res) {
  try {
    var ai = require("./src/ai/ai-provider");
    var result = await ai.query({ prompt: req.body.prompt, role: req.body.role, taskType: req.body.taskType, priority: req.body.priority, localOnly: req.body.localOnly, model: req.body.model, maxTokens: req.body.maxTokens, temperature: req.body.temperature });
    res.json({ text: result.text, model: result._model, provider: result._provider, taskType: result._taskType, latencyMs: result._latencyMs, tokensIn: result.tokensIn, tokensOut: result.tokensOut, fallback: result._fallback || false });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/available-providers", async function(req, res) { try { var { query } = require("./src/db"); var rows = await query("SELECT DISTINCT provider FROM ai_connections WHERE status = 'active'"); res.json({ providers: rows.map(function(r) { return r.provider; }) }); } catch(e) { res.json({ providers: [] }); } });
app.use("/api/models", modelsRoutes);
app.use("/api/profile", authenticate, profileRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/blun-code/message", function(req,res,next){ if(req.method==="POST") monitorRoutes.incrementRequestCounter(); next(); });
app.use("/api/blun-code", blunCodeRoutes);
app.use("/api/monitor", monitorRoutes);
app.use("/api/admin/plans", adminPlansRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/companies", companyContext, companiesRoutes);
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
app.use("/api/agent-chat", agentChatRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/tools", toolsRoutes);

// Telegram channel integration (API)
app.use("/telegram/api", telegramRoutes);

// Federation (receive is public, rest requires auth)
app.use("/federation", federationRoutes);
app.use("/api/dashboard-stats", dashboardStatsRoutes);
app.use("/api/deploy", deployRoutes);
app.use("/api/agent-comm", agentCommRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/health-detailed", healthDetailedRoutes);
app.use("/api/usage-tracking", usageTrackingRoutes);

// --- Page routes (authenticated) ---
function authPage(path, file, adminOnly) {
  app.get(path, authenticate, function (req, res) {
    // Auth handled client-side
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

// Dieter PWA — standalone, no auth required
app.use(require('express').static(__dirname + '/dashboard/dieter', { index: false }));
app.get('/blun', (req, res) => { res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); res.set('Pragma', 'no-cache'); res.sendFile(__dirname + '/dashboard/dieter/blun-loader.html'); });
app.get('/test-login', (req, res) => { res.set('Cache-Control', 'no-cache, no-store'); res.sendFile(__dirname + '/dashboard/dieter/login-test.html'); });
app.get('/app', (req, res) => { res.set('Cache-Control', 'no-cache, no-store'); res.sendFile(__dirname + '/dashboard/dieter/index.html'); });
app.get('/app/*', (req, res) => { res.set('Cache-Control', 'no-cache, no-store'); res.sendFile(__dirname + '/dashboard/dieter/index.html'); });
app.get('/dieter', (req, res) => res.sendFile(__dirname + '/dashboard/dieter/index.html'));
app.get('/dieter/', (req, res) => res.sendFile(__dirname + '/dashboard/dieter/index.html'));
app.get('/dieter/manifest.json', (req, res) => res.sendFile(__dirname + '/dashboard/dieter/manifest.json'));
app.get('/dieter/sw.js', (req, res) => { res.setHeader('Service-Worker-Allowed', '/dieter'); res.sendFile(__dirname + '/dashboard/dieter/sw.js'); });
authPage("/monitor", "monitor.html", true);
authPage("/admin-plans", "admin-plans.html", true);

app.get("/login", function (req, res) { res.redirect("/dashboard/"); return;
});

app.get("/dashboard", function (req, res) { res.set("Cache-Control","no-cache,no-store");
  // Auth handled client-side
  res.sendFile(__dirname + "/dashboard/index.html");
});

app.use("/uploads", express.static(path.join(__dirname, "dashboard/uploads")));
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
  // Schema integrity check — ensure all required columns exist
  try {
    var schemaMigrations = [
      "ALTER TABLE blun_agents ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ",
      "ALTER TABLE blun_agents ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT ''",
      "ALTER TABLE blun_agents ADD COLUMN IF NOT EXISTS title VARCHAR(200) DEFAULT ''",
      "ALTER TABLE blun_agents ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'",
      "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS result TEXT",
      "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ"
    ];
    for (var i = 0; i < schemaMigrations.length; i++) {
      await pool.query(schemaMigrations[i]);
    }
    console.log("[schema] All required columns verified (" + schemaMigrations.length + " checks)");
  } catch(schemaErr) {
    console.error("[schema] Migration warning:", schemaErr.message);
  }

  } catch (err) {
    console.error("[redis] Failed to connect:", err.message);
    process.exit(1);
  }

  // Start all enabled Telegram bots
  try { await startAllBots(); } catch (err) { console.error("[telegram] Boot error:", err.message); }

  // Auto-start all active agents
  try {
    var engine = require("./src/agent-engine");
    var agents = await pool.query("SELECT id, name FROM blun_agents WHERE status IN ('active', 'working', 'paused')");
    for (var i = 0; i < agents.rows.length; i++) {
      engine.startAgent(agents.rows[i].id);
    }
    console.log("[agents] Started " + agents.rows.length + " active agents");
    // Multi-KI Provider Abstraction Layer init
    try {
      var { initMultiKI } = require("./src/ai/init");
      var { query: dbQ } = require("./src/db");
      await initMultiKI(dbQ);
    } catch(mkiErr) { console.error("[multi-ki] Init error:", mkiErr.message); }
  } catch(err) { console.error("[agents] Auto-start error:", err.message); }

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


// Dashboard SPA routes - serve index.html for all /dashboard/* paths
['agents','operator','chat','livelog','models','settings','companies'].forEach(function(p){
  app.get('/dashboard/'+p, function(req,res){ res.set('Cache-Control','no-cache,no-store'); res.sendFile(__dirname+'/dashboard/index.html'); });
});
