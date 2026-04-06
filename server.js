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
const { startAllBots, activeBots } = require("./src/channels/telegram");

const PORT = parseInt(process.env.BLUN_PORT || "3200", 10);
const API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
// Stripe webhook needs raw body before JSON parser
app.use("/billing/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10mb" }));
app.use(morgan("short"));
app.use(cookieParser());

// Auth middleware
app.use("/api", function (req, res, next) {
  if (req.path === "/health" || req.path === "/admin/health") return next();
  var key = req.headers["x-blun-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key. Set x-blun-key header." });
  }
  next();
});

app.use("/auth", authRoutes);
app.use("/billing", billingRoutes);

app.use("/api", apiRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/skills", skillsRoutes);
app.get("/api/agents/:id/skills", getAgentSkills);

// KI-Organisator routes (auth handled inside)
app.use("/organisator", organisatorRoutes);

// Telegram channel integration (API)
app.use("/telegram/api", telegramRoutes);

// Federation (receive is public, rest requires auth)
app.use("/federation", federationRoutes);

app.get("/federation-dashboard", authenticate, function (req, res) {
  if (!req.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "dashboard", "federation.html"));
});

app.get("/organisator", authenticate, function (req, res) {
  if (!req.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "dashboard", "organisator.html"));
});

app.get("/telegram", authenticate, function (req, res) {
  if (!req.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "dashboard", "telegram.html"));
});

app.get("/login", function (req, res) {
  res.sendFile(path.join(__dirname, "dashboard", "login.html"));
});


app.get("/dashboard", authenticate, function (req, res) {
  if (!req.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "dashboard", "index.html"));
});
app.use("/dashboard", express.static(path.join(__dirname, "dashboard")));

app.get("/", function (req, res) {
  res.json({
    name: "BLUN",
    version: "2.0.0",
    description: "AI Organisator - Open source agent framework",
    endpoints: {
      api: "/api",
      chat: "/api/chat",
      admin: "/api/admin",
      websocket: "ws://localhost:" + PORT + "?role=dashboard",
      health: "/api/admin/health",
    },
  });
});

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
