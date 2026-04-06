// BLUN Support Chat — Knowledge Base

var knowledgeBase = [
  { keywords: ["what", "blun", "was", "ist"], category: "general",
    en: "BLUN is an open-source AI agent framework. It lets you create, manage and orchestrate AI agents with skills, tools and multi-model support. Self-hosted, privacy-first, built in Austria.",
    de: "BLUN ist ein Open-Source AI-Agent-Framework. Damit kannst du KI-Agenten mit Skills, Tools und Multi-Modell-Unterstuetzung erstellen und orchestrieren. Self-hosted, Privacy-first, aus Oesterreich." },
  { keywords: ["price", "pricing", "cost", "plan", "preis", "kosten", "free", "gratis", "kostenlos"],
    category: "pricing",
    en: "BLUN is open source and free to self-host. We offer managed hosting plans starting at EUR 29/month with included compute credits. Enterprise plans with SLA are available on request.",
    de: "BLUN ist Open Source und kostenlos zum Selbst-Hosten. Managed-Hosting-Plaene starten ab EUR 29/Monat mit inkludierten Compute-Credits. Enterprise-Plaene mit SLA auf Anfrage." },
  { keywords: ["feature", "features", "funktion", "funktionen", "can", "kann", "what can"],
    category: "features",
    en: "BLUN features: Multi-agent orchestration, Model Race (parallel model comparison), Website Builder, Software Builder, Code Canvas, Skill system, Federation (agent-to-agent communication), Telegram integration, KI-Organisator, privacy dashboard, and more.",
    de: "BLUN-Funktionen: Multi-Agent-Orchestrierung, Model Race (paralleler Modellvergleich), Website Builder, Software Builder, Code Canvas, Skill-System, Federation (Agent-zu-Agent-Kommunikation), Telegram-Integration, KI-Organisator, Datenschutz-Dashboard und mehr." },
  { keywords: ["model race", "race", "modell", "compare", "vergleich"],
    category: "features",
    en: "Model Race sends your prompt to multiple AI models simultaneously and shows all responses side by side. You pick the best answer. Supports OpenAI, Anthropic, Google, Mistral, and local models.",
    de: "Model Race sendet deinen Prompt gleichzeitig an mehrere KI-Modelle und zeigt alle Antworten nebeneinander. Du waehlst die beste. Unterstuetzt OpenAI, Anthropic, Google, Mistral und lokale Modelle." },
  { keywords: ["website", "builder", "webseite", "homepage", "site"],
    category: "features",
    en: "The Website Builder lets you describe a website in natural language. BLUN generates the full HTML/CSS/JS, hosts it instantly, and gives you a live URL. Edit by chatting with your agent.",
    de: "Der Website Builder erstellt Webseiten per natuerlicher Sprache. BLUN generiert HTML/CSS/JS, hostet sofort und gibt dir eine Live-URL. Bearbeitung per Chat mit deinem Agenten." },
  { keywords: ["software", "builder", "app", "application", "anwendung", "program"],
    category: "features",
    en: "The Software Builder creates full applications from a description. It generates backend, frontend, database schema and deployment config. Currently supports Node.js and Python projects.",
    de: "Der Software Builder erstellt komplette Anwendungen aus einer Beschreibung. Er generiert Backend, Frontend, Datenbankschema und Deployment-Config. Aktuell Node.js und Python." },
  { keywords: ["canvas", "code canvas", "editor", "code"],
    category: "features",
    en: "Code Canvas is a collaborative code editor where you and your AI agent work on code together in real time. Syntax highlighting, version history, and instant preview included.",
    de: "Code Canvas ist ein kollaborativer Code-Editor, in dem du und dein KI-Agent gemeinsam in Echtzeit an Code arbeiten. Syntax-Highlighting, Versionshistorie und Sofort-Vorschau inklusive." },
  { keywords: ["federation", "federat", "connect", "verbind", "agent-to-agent", "dezentral"],
    category: "features",
    en: "Federation enables agent-to-agent communication across different BLUN instances. Agents can discover, message and collaborate with agents on other servers. Fully decentralized.",
    de: "Federation ermoeglicht Agent-zu-Agent-Kommunikation ueber verschiedene BLUN-Instanzen. Agenten koennen sich finden, Nachrichten senden und mit Agenten auf anderen Servern zusammenarbeiten. Voll dezentral." },
  { keywords: ["skill", "skills", "plugin", "plugins", "erweiter"],
    category: "features",
    en: "Skills are modular capabilities you can attach to any agent. Browse the skill store or create your own. Skills can access APIs, databases, files, and external tools.",
    de: "Skills sind modulare Faehigkeiten, die du jedem Agenten zuweisen kannst. Durchsuche den Skill-Store oder erstelle eigene. Skills koennen auf APIs, Datenbanken, Dateien und externe Tools zugreifen." },
  { keywords: ["telegram", "bot", "chat", "messenger"],
    category: "features",
    en: "Connect your BLUN agents to Telegram. Each agent gets its own bot. Users chat naturally and the agent responds with full skill access. Multi-bot support included.",
    de: "Verbinde deine BLUN-Agenten mit Telegram. Jeder Agent bekommt seinen eigenen Bot. Nutzer chatten natuerlich und der Agent antwortet mit vollem Skill-Zugriff. Multi-Bot-Unterstuetzung inklusive." },
  { keywords: ["install", "setup", "start", "deploy", "installier", "einricht", "anfang", "how to", "getting started"],
    category: "setup",
    en: "Clone the repo: git clone https://github.com/blun-ai/blun. Run npm install, copy .env.example to .env, configure your DB and Redis, then npm start. Full docs at blun.ai/docs.",
    de: "Repo klonen: git clone https://github.com/blun-ai/blun. Dann npm install, .env.example nach .env kopieren, DB und Redis konfigurieren, npm start. Vollstaendige Doku auf blun.ai/docs." },
  { keywords: ["privacy", "dsgvo", "gdpr", "datenschutz", "data", "daten", "sicher"],
    category: "privacy",
    en: "BLUN is self-hosted, so your data stays on your servers. We provide a built-in privacy dashboard for GDPR compliance: data export, deletion, consent management. No data leaves your instance.",
    de: "BLUN ist self-hosted, deine Daten bleiben auf deinen Servern. Wir bieten ein eingebautes Datenschutz-Dashboard fuer DSGVO-Konformitaet: Datenexport, Loeschung, Einwilligungsverwaltung. Keine Daten verlassen deine Instanz." },
  { keywords: ["account", "konto", "register", "registrier", "login", "anmeld", "password", "passwort"],
    category: "account",
    en: "Create an account at the login page. After registration you can create agents, manage skills, and access all features. Password reset is available via email.",
    de: "Erstelle ein Konto auf der Login-Seite. Nach der Registrierung kannst du Agenten erstellen, Skills verwalten und alle Funktionen nutzen. Passwort-Reset per E-Mail moeglich." },
  { keywords: ["organisator", "organis", "task", "aufgabe", "project", "projekt", "manage"],
    category: "features",
    en: "The KI-Organisator is an AI-powered project manager. It breaks down tasks, assigns them to agents, tracks progress, and reports status. Think of it as an AI scrum master.",
    de: "Der KI-Organisator ist ein KI-gestuetzter Projektmanager. Er zerlegt Aufgaben, weist sie Agenten zu, verfolgt den Fortschritt und berichtet den Status. Wie ein KI-Scrum-Master." },
  { keywords: ["open source", "opensource", "license", "lizenz", "github", "repo"],
    category: "general",
    en: "BLUN is released under the MIT License. The full source code is available on GitHub. Contributions are welcome. Self-hosting is and will always be free.",
    de: "BLUN steht unter der MIT-Lizenz. Der vollstaendige Quellcode ist auf GitHub verfuegbar. Beitraege sind willkommen. Self-Hosting ist und bleibt kostenlos." },
  { keywords: ["support", "help", "hilfe", "contact", "kontakt", "team", "email"],
    category: "general",
    en: "You can reach our team at hello@blun.ai or through the Telegram community. We typically respond within a few hours during business days.",
    de: "Du erreichst unser Team unter hello@blun.ai oder ueber die Telegram-Community. Wir antworten typischerweise innerhalb weniger Stunden an Werktagen." },
  { keywords: ["agent", "agenten", "create agent", "erstell"],
    category: "features",
    en: "Agents are the core of BLUN. Each agent has its own model, system prompt, skills, and memory. Create unlimited agents, each specialized for different tasks.",
    de: "Agenten sind der Kern von BLUN. Jeder Agent hat sein eigenes Modell, System-Prompt, Skills und Speicher. Erstelle unbegrenzt Agenten, jeder spezialisiert fuer verschiedene Aufgaben." },
];

function detectLanguage(text) {
  var germanWords = ["ich", "du", "wie", "was", "ist", "und", "der", "die", "das", "ein", "eine", "kann", "habe", "nicht", "fuer", "mit", "auf", "von", "den", "dem", "mir", "mich", "dir", "dich", "wir", "ihr", "sie", "es", "bin", "bitte", "danke", "hallo", "guten", "morgen", "tag", "abend"];
  var words = text.toLowerCase().split(/\s+/);
  var count = 0;
  for (var i = 0; i < words.length; i++) {
    if (germanWords.indexOf(words[i]) !== -1) count++;
  }
  return count >= 1 ? "de" : "en";
}

function findAnswer(userMessage) {
  var msg = userMessage.toLowerCase().replace(/[?!.,;:]/g, "");
  var words = msg.split(/\s+/);
  var lang = detectLanguage(userMessage);

  var bestMatch = null;
  var bestScore = 0;

  for (var i = 0; i < knowledgeBase.length; i++) {
    var entry = knowledgeBase[i];
    var score = 0;
    for (var j = 0; j < entry.keywords.length; j++) {
      var kw = entry.keywords[j].toLowerCase();
      if (msg.indexOf(kw) !== -1) score += kw.length;
      for (var k = 0; k < words.length; k++) {
        if (words[k] === kw) score += 2;
        else if (words[k].indexOf(kw) !== -1 || kw.indexOf(words[k]) !== -1) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestScore >= 3) {
    return { answer: lang === "de" ? bestMatch.de : bestMatch.en, category: bestMatch.category, lang: lang };
  }

  if (lang === "de") {
    return { answer: "Das kann ich leider nicht beantworten. Ich verbinde dich mit unserem Team -- schreib uns an hello@blun.ai oder starte einen Chat in unserer Telegram-Community.", category: "fallback", lang: "de" };
  }
  return { answer: "I am not able to answer that. Let me connect you with our team -- reach us at hello@blun.ai or join our Telegram community.", category: "fallback", lang: "en" };
}

module.exports = { findAnswer, detectLanguage };
