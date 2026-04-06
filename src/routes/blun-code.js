// BLUN - AI Organisator | MIT License
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const crypto = require("crypto");

// In-memory session store (replace with DB later)
const sessions = new Map();

// Available coding models (mock)
const MODELS = [
  { id: "claude", name: "Claude", color: "#3b82f6", provider: "Anthropic" },
  { id: "gpt", name: "GPT", color: "#22c55e", provider: "OpenAI" },
  { id: "gemini", name: "Gemini", color: "#a855f7", provider: "Google" },
];

// Mock response generator
function mockResponse(model, message) {
  const responses = {
    claude: [
      "Analyzing the code structure... I see a potential improvement in the error handling.",
      "Here is a cleaner implementation:\n```js\nfunction process(data) {\n  if (!data) throw new Error('No data');\n  return data.map(item => transform(item));\n}\n```",
      "I reviewed the architecture. The separation of concerns looks good, but consider extracting the validation logic into a middleware.",
    ],
    gpt: [
      "Looking at this from a performance angle — the current approach has O(n^2) complexity. Let me suggest a hash-map approach.",
      "Refactored version:\n```js\nconst cache = new Map();\nfunction lookup(key) {\n  if (cache.has(key)) return cache.get(key);\n  const val = compute(key);\n  cache.set(key, val);\n  return val;\n}\n```",
      "The test coverage is at 73%. Missing edge cases: null input, empty arrays, and timeout scenarios.",
    ],
    gemini: [
      "Cross-referencing with best practices — this pattern matches the Repository pattern. Consider adding an interface layer.",
      "Optimized version with type safety:\n```ts\ninterface Config {\n  timeout: number;\n  retries: number;\n}\nfunction createClient(config: Config) {\n  return { fetch: (url: string) => fetchWithRetry(url, config) };\n}\n```",
      "Documentation gap detected. Adding JSDoc comments would improve maintainability by 40% based on code complexity metrics.",
    ],
  };
  const pool = responses[model.id] || responses.claude;
  return pool[Math.floor(Math.random() * pool.length)];
}

// GET /api/blun-code/models — list available models
router.get("/models", requireAuth, (req, res) => {
  res.json(MODELS);
});

// POST /api/blun-code/session — create new coding session
router.post("/session", requireAuth, (req, res) => {
  const id = crypto.randomUUID();
  const session = {
    id,
    userId: req.user.id,
    project: req.body.project || "Untitled Project",
    models: req.body.models || ["claude"],
    messages: [],
    createdAt: new Date().toISOString(),
  };
  sessions.set(id, session);
  res.json(session);
});

// GET /api/blun-code/session/:id — get session history
router.get("/session/:id", requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
  res.json(session);
});

// POST /api/blun-code/message — send message to model(s)
router.post("/message", requireAuth, async (req, res) => {
  const { sessionId, message, models } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  const targetModels = (models || ["claude"]).map(id => MODELS.find(m => m.id === id)).filter(Boolean);
  if (!targetModels.length) return res.status(400).json({ error: "No valid models selected" });

  let session = sessionId ? sessions.get(sessionId) : null;
  if (!session) {
    const id = crypto.randomUUID();
    session = { id, userId: req.user.id, project: "Quick Session", models: models || ["claude"], messages: [], createdAt: new Date().toISOString() };
    sessions.set(id, session);
  }

  session.messages.push({ role: "user", content: message, ts: new Date().toISOString() });

  const responses = [];
  for (const model of targetModels) {
    // Simulate delay (200-800ms)
    await new Promise(r => setTimeout(r, 200 + Math.random() * 600));
    const content = mockResponse(model, message);
    const entry = { role: "assistant", model: model.id, modelName: model.name, color: model.color, content, ts: new Date().toISOString() };
    session.messages.push(entry);
    responses.push(entry);
  }

  res.json({ sessionId: session.id, responses });
});

// POST /api/blun-code/marathon — start marathon mode
router.post("/marathon", requireAuth, async (req, res) => {
  const { tasks } = req.body;
  if (!tasks || !Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: "Tasks array required" });

  const id = crypto.randomUUID();
  const assignments = tasks.map((task, i) => {
    const model = MODELS[i % MODELS.length];
    return { task, model: model.id, modelName: model.name, color: model.color, status: "running" };
  });

  // Simulate all tasks completing
  const results = [];
  for (const a of assignments) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    results.push({ ...a, status: "done", result: mockResponse(MODELS.find(m => m.id === a.model), a.task) });
  }

  res.json({ marathonId: id, results });
});

module.exports = router;
