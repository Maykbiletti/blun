var multer = require("multer");
var path = require("path");
var fs = require("fs");
var upload = multer({ dest: path.join(__dirname, "../../uploads"), limits: { fileSize: 50 * 1024 * 1024 } });

module.exports = function(router, query) {
  router.post("/agents/:id/upload", upload.single("file"), async function(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "No file" });
      var agentId = req.params.id;
      var fname = req.file.originalname || "upload";
      var raw = fs.readFileSync(req.file.path, "utf8");
      var ext = fname.split(".").pop().toLowerCase();
      var text = "";
      if (ext === "json") {
        try {
          var obj = JSON.parse(raw);
          if (obj.messages && Array.isArray(obj.messages)) {
            var lines = [];
            obj.messages.forEach(function(m) {
              var from = m.from || m.sender || "?";
              var txt = typeof m.text === "string" ? m.text : (m.text_entities ? m.text_entities.map(function(e){return e.text}).join("") : JSON.stringify(m.text));
              if ((from + ": " + txt).length > 5) lines.push(from + ": " + txt);
            });
            text = lines.join("\n");
          } else if (Array.isArray(obj)) {
            text = obj.map(function(item) { return JSON.stringify(item); }).join("\n");
          } else {
            text = JSON.stringify(obj, null, 2);
          }
        } catch(e) { text = raw; }
      } else if (ext === "html" || ext === "htm") {
        text = raw.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        text = raw;
      }
      if (text.length > 100000) text = text.substring(0, 100000) + "... (gekuerzt)";
      var memKey = "upload_" + fname.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50) + "_" + Date.now();
      var chunks = [];
      var CHUNK = 4000;
      for (var i = 0; i < text.length; i += CHUNK) chunks.push(text.substring(i, i + CHUNK));
      for (var j = 0; j < Math.min(chunks.length, 25); j++) {
        var key = chunks.length > 1 ? memKey + "_part" + (j+1) : memKey;
        await query("INSERT INTO agent_memory (agent_id, key, content, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, key, chunks[j]]);
      }
      try { fs.unlinkSync(req.file.path); } catch(e) {}
      res.json({ ok: true, filename: fname, size: text.length, chunks: Math.min(chunks.length, 25), key: memKey });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
};
