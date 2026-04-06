const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const i18nDir = path.join(__dirname, "..", "i18n");
const supportedLangs = ["en", "de", "es", "fr", "pt", "tr"];
const cache = {};

// Pre-load all language files
for (const lang of supportedLangs) {
  const file = path.join(i18nDir, lang + ".json");
  if (fs.existsSync(file)) {
    cache[lang] = JSON.parse(fs.readFileSync(file, "utf8"));
  }
}

// GET /api/i18n/detect — auto-detect language from Accept-Language header
router.get("/detect", (req, res) => {
  const accept = req.headers["accept-language"] || "";
  let detected = "en";
  for (const lang of supportedLangs) {
    if (accept.toLowerCase().includes(lang)) {
      detected = lang;
      break;
    }
  }
  res.json({ lang: detected, supported: supportedLangs });
});

// GET /api/i18n/languages — list supported languages
router.get("/languages", (req, res) => {
  res.json({ languages: supportedLangs });
});

// GET /api/i18n/:lang — return language file
router.get("/:lang", (req, res) => {
  const lang = req.params.lang.toLowerCase();
  if (cache[lang]) {
    res.json(cache[lang]);
  } else if (cache.en) {
    res.json(cache.en);
  } else {
    res.status(404).json({ error: "Language not found" });
  }
});

module.exports = router;
