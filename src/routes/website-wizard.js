const express = require("express");
const router = express.Router();
const { pool } = require("../db");

function esc(s) { return (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function generateImpressum(d) {
  var countries = { AT:"Austria",DE:"Germany",CH:"Switzerland",LI:"Liechtenstein",LU:"Luxembourg",NL:"Netherlands",BE:"Belgium",FR:"France",IT:"Italy",ES:"Spain",UK:"United Kingdom",US:"United States" };
  var lines = [];
  lines.push("<h3>Impressum</h3>");
  lines.push("<p><strong>" + esc(d.companyName) + "</strong></p>");
  lines.push("<p>" + esc(d.street) + "<br>" + esc(d.zip) + " " + esc(d.city) + "</p>");
  lines.push("<p>" + (countries[d.country] || esc(d.country) || "") + "</p>");
  lines.push("<br>");
  lines.push("<p><strong>Kontakt:</strong></p>");
  lines.push("<p>E-Mail: " + esc(d.email) + "</p>");
  lines.push("<p>Telefon: " + esc(d.phone) + "</p>");
  if (d.vat) {
    lines.push("<br>");
    lines.push("<p><strong>UID-Nummer:</strong> " + esc(d.vat) + "</p>");
  }
  lines.push("<br>");
  lines.push("<p><strong>Haftungsausschluss:</strong></p>");
  lines.push("<p>Die Inhalte dieser Website wurden mit groesster Sorgfalt erstellt. Fuer die Richtigkeit, Vollstaendigkeit und Aktualitaet der Inhalte wird jedoch keine Gewaehr uebernommen.</p>");
  return lines.join("\n");
}

function generateDatenschutz(d) {
  var lines = [];
  lines.push("<h3>Datenschutzerklaerung</h3>");
  lines.push("<p><strong>Verantwortlicher:</strong><br>" + esc(d.companyName) + "<br>" + esc(d.street) + ", " + esc(d.zip) + " " + esc(d.city) + "<br>E-Mail: " + esc(d.email) + "</p>");
  lines.push("<br>");
  lines.push("<h4>1. Erhebung und Verarbeitung personenbezogener Daten</h4>");
  lines.push("<p>Beim Besuch unserer Website werden automatisch Informationen allgemeiner Natur erfasst (Server-Logfiles). Diese umfassen den Browsertyp, das verwendete Betriebssystem, den Domainnamen Ihres Internet-Service-Providers, Ihre IP-Adresse und Aehnliches.</p>");
  lines.push("<br>");
  lines.push("<h4>2. Rechtsgrundlage</h4>");
  lines.push("<p>Die Verarbeitung personenbezogener Daten erfolgt auf Grundlage der DSGVO (EU-Datenschutz-Grundverordnung) sowie des oesterreichischen Datenschutzgesetzes (DSG).</p>");
  lines.push("<br>");
  lines.push("<h4>3. Ihre Rechte</h4>");
  lines.push("<p>Sie haben das Recht auf Auskunft, Berichtigung, Loeschung, Einschraenkung der Verarbeitung, Datenuebertragbarkeit und Widerspruch. Kontaktieren Sie uns unter: " + esc(d.email) + "</p>");
  lines.push("<br>");
  lines.push("<h4>4. Cookies</h4>");
  lines.push("<p>Diese Website verwendet Cookies, die fuer den technischen Betrieb erforderlich sind. Weitere Cookies werden nur mit Ihrer Einwilligung gesetzt.</p>");
  lines.push("<br>");
  lines.push("<h4>5. Kontakt</h4>");
  lines.push("<p>Bei Fragen zum Datenschutz kontaktieren Sie uns unter: " + esc(d.email) + "</p>");
  return lines.join("\n");
}

function generateAGB(d) {
  var lines = [];
  lines.push("<h3>Allgemeine Geschaeftsbedingungen (AGB)</h3>");
  lines.push("<p><strong>Betreiber:</strong> " + esc(d.companyName) + "</p>");
  lines.push("<br>");
  lines.push("<h4>1. Geltungsbereich</h4>");
  lines.push("<p>Diese AGB gelten fuer alle Bestellungen ueber unseren Online-Shop.</p>");
  lines.push("<br>");
  lines.push("<h4>2. Vertragsschluss</h4>");
  lines.push("<p>Die Darstellung der Produkte im Shop stellt kein rechtlich bindendes Angebot dar. Durch die Bestellung geben Sie ein verbindliches Angebot ab. Die Auftragsbestaetigung per E-Mail stellt die Annahme dar.</p>");
  lines.push("<br>");
  lines.push("<h4>3. Preise und Zahlung</h4>");
  lines.push("<p>Alle Preise verstehen sich inklusive der gesetzlichen Mehrwertsteuer. Die Zahlung erfolgt per den angebotenen Zahlungsmethoden.</p>");
  lines.push("<br>");
  lines.push("<h4>4. Widerrufsrecht</h4>");
  lines.push("<p>Sie haben das Recht, innerhalb von 14 Tagen ohne Angabe von Gruenden den Vertrag zu widerrufen.</p>");
  lines.push("<br>");
  lines.push("<h4>5. Gerichtsstand</h4>");
  lines.push("<p>Es gilt oesterreichisches Recht. Gerichtsstand ist der Sitz des Betreibers.</p>");
  return lines.join("\n");
}

// POST /api/website-wizard/legal-preview
router.post("/legal-preview", function(req, res) {
  var d = req.body || {};
  var result = {
    impressum: generateImpressum(d),
    datenschutz: generateDatenschutz(d)
  };
  if (d.shop) {
    result.agb = generateAGB(d);
  }
  res.json(result);
});

// POST /api/website-wizard — save wizard data and create project
router.post("/", async function(req, res) {
  try {
    var d = req.body || {};
    var userId = req.user ? req.user.id : null;

    if (!d.companyName || !d.email) {
      return res.status(400).json({ error: "Company name and email are required." });
    }

    var domain = d.domainOwned ? d.existingDomain : d.selectedDomain;

    var result = await pool.query(
      "INSERT INTO website_wizard_projects (user_id, company_name, street, zip, city, country, email, phone, vat, description, style, shop, domain, domain_owned, impressum, datenschutz, agb, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'building',NOW()) RETURNING id",
      [userId, d.companyName, d.street, d.zip, d.city, d.country, d.email, d.phone, d.vat || null, d.description, d.style, d.shop || false, domain, d.domainOwned || false, generateImpressum(d), generateDatenschutz(d), d.shop ? generateAGB(d) : null]
    );

    res.json({ success: true, projectId: result.rows[0].id });
  } catch (err) {
    console.error("[website-wizard] Error:", err.message);
    res.status(500).json({ error: "Failed to create website project." });
  }
});

module.exports = router;
