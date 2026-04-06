// BLUN - AI Organisator | MIT License
/**
 * Website Generation Engine
 * Handles template rendering, AI content generation, static file output, nginx config
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SITES_DIR = "/var/www/blun-sites";
const NGINX_SITES = "/etc/nginx/sites-enabled";
const TEMPLATES_DIR = path.join(__dirname, "templates");

// Ensure output dirs exist
try { fs.mkdirSync(SITES_DIR, { recursive: true }); } catch(e) {}

const TEMPLATES = [
  {
    slug: "landing-page",
    name: "Landing Page",
    description: "Single page with hero section, features grid, and call-to-action",
    sections: ["hero", "features", "cta", "footer"]
  },
  {
    slug: "portfolio",
    name: "Portfolio",
    description: "Grid gallery with about section and contact form",
    sections: ["hero", "gallery", "about", "contact", "footer"]
  },
  {
    slug: "business",
    name: "Business",
    description: "Company page with services, team members, and contact",
    sections: ["hero", "services", "team", "contact", "footer"]
  },
  {
    slug: "blog",
    name: "Blog",
    description: "Article listing with single post layout",
    sections: ["header", "featured", "posts", "sidebar", "footer"]
  },
  {
    slug: "shop",
    name: "Shop",
    description: "Product grid with cart placeholder and checkout",
    sections: ["header", "products", "cart", "footer"]
  }
];

function getTemplates() {
  return TEMPLATES;
}

function getTemplateBySlug(slug) {
  return TEMPLATES.find(function (t) { return t.slug === slug; });
}

/**
 * AI-assisted content generation (placeholder)
 */
async function generateContent(templateSlug, siteName, description) {
  var tpl = getTemplateBySlug(templateSlug);
  if (!tpl) throw new Error("Unknown template: " + templateSlug);

  var content = {
    siteName: siteName,
    description: description,
    template: templateSlug,
    sections: {},
    colors: { primary: "#f59e0b", background: "#0a0a0a", card: "#1a1a1a", text: "#ffffff", muted: "#a1a1aa" },
    font: "Inter"
  };

  if (templateSlug === "landing-page") {
    content.sections = {
      hero: { headline: siteName, subheadline: description || "Build something extraordinary", cta_text: "Get Started", cta_url: "#features" },
      features: { title: "Features", items: [
        { title: "Fast", description: "Lightning-fast performance out of the box" },
        { title: "Secure", description: "Enterprise-grade security built in" },
        { title: "Scalable", description: "Grows with your business seamlessly" }
      ]},
      cta: { title: "Ready to get started?", description: "Join thousands of satisfied customers", button_text: "Start Free Trial", button_url: "#" },
      footer: { text: siteName + " - All rights reserved" }
    };
  } else if (templateSlug === "portfolio") {
    content.sections = {
      hero: { headline: siteName, subheadline: description || "Creative Portfolio" },
      gallery: { title: "My Work", items: [
        { title: "Project 1", image: "", category: "Design" },
        { title: "Project 2", image: "", category: "Development" },
        { title: "Project 3", image: "", category: "Branding" },
        { title: "Project 4", image: "", category: "Design" },
        { title: "Project 5", image: "", category: "Development" },
        { title: "Project 6", image: "", category: "Branding" }
      ]},
      about: { title: "About Me", text: description || "A passionate creator dedicated to crafting beautiful digital experiences." },
      contact: { title: "Get in Touch", email: "hello@example.com" },
      footer: { text: siteName }
    };
  } else if (templateSlug === "business") {
    content.sections = {
      hero: { headline: siteName, subheadline: description || "Professional solutions for your business" },
      services: { title: "Our Services", items: [
        { title: "Consulting", description: "Expert guidance for your business strategy" },
        { title: "Development", description: "Custom software solutions tailored to your needs" },
        { title: "Support", description: "24/7 dedicated support for all clients" }
      ]},
      team: { title: "Our Team", members: [
        { name: "Alex Johnson", role: "CEO", bio: "Visionary leader with 15+ years experience" },
        { name: "Sarah Chen", role: "CTO", bio: "Tech expert driving innovation" },
        { name: "Mike Roberts", role: "COO", bio: "Operations specialist ensuring smooth delivery" }
      ]},
      contact: { title: "Contact Us", email: "info@example.com", phone: "+1 234 567 890", address: "123 Business Ave" },
      footer: { text: siteName + " - All rights reserved" }
    };
  } else if (templateSlug === "blog") {
    content.sections = {
      header: { title: siteName, tagline: description || "Thoughts and ideas" },
      featured: { title: "Featured Post", headline: "Welcome to " + siteName, excerpt: "This is the first post on our new blog.", date: new Date().toISOString().split("T")[0] },
      posts: { items: [
        { title: "Getting Started", excerpt: "A guide to help you begin your journey", date: new Date().toISOString().split("T")[0], category: "Guide" },
        { title: "Best Practices", excerpt: "Tips and tricks for success", date: new Date().toISOString().split("T")[0], category: "Tips" },
        { title: "Looking Ahead", excerpt: "What the future holds", date: new Date().toISOString().split("T")[0], category: "Opinion" }
      ]},
      sidebar: { about: "A blog about " + (description || "interesting topics"), categories: ["Guide", "Tips", "Opinion", "News"] },
      footer: { text: siteName }
    };
  } else if (templateSlug === "shop") {
    content.sections = {
      header: { title: siteName, tagline: description || "Quality products" },
      products: { items: [
        { name: "Product 1", price: "29.99", description: "High-quality essential item", image: "" },
        { name: "Product 2", price: "49.99", description: "Premium selection for professionals", image: "" },
        { name: "Product 3", price: "19.99", description: "Affordable everyday solution", image: "" },
        { name: "Product 4", price: "99.99", description: "Top-tier premium offering", image: "" }
      ]},
      cart: { empty_text: "Your cart is empty" },
      footer: { text: siteName + " - All rights reserved" }
    };
  }

  return content;
}

/**
 * Render HTML from content + template
 */
function renderSite(site) {
  var content = typeof site.content === "string" ? JSON.parse(site.content) : site.content;
  var templateFile = path.join(TEMPLATES_DIR, content.template + ".html");

  if (!fs.existsSync(templateFile)) {
    throw new Error("Template file not found: " + templateFile);
  }

  var html = fs.readFileSync(templateFile, "utf8");

  html = html.replace(/\{\{siteName\}\}/g, content.siteName || site.name);
  html = html.replace(/\{\{description\}\}/g, content.description || "");
  html = html.replace(/\{\{primary\}\}/g, (content.colors && content.colors.primary) || "#f59e0b");
  html = html.replace(/\{\{background\}\}/g, (content.colors && content.colors.background) || "#0a0a0a");
  html = html.replace(/\{\{card\}\}/g, (content.colors && content.colors.card) || "#1a1a1a");
  html = html.replace(/\{\{textColor\}\}/g, (content.colors && content.colors.text) || "#ffffff");
  html = html.replace(/\{\{muted\}\}/g, (content.colors && content.colors.muted) || "#a1a1aa");
  html = html.replace(/\{\{font\}\}/g, content.font || "Inter");
  html = html.replace(/\{\{sectionsJSON\}\}/g, JSON.stringify(content.sections || {}).replace(/</g, "\\u003c"));

  return html;
}

/**
 * Publish site: generate static files + nginx config
 */
async function publish(site) {
  var siteDir = path.join(SITES_DIR, String(site.id));
  fs.mkdirSync(siteDir, { recursive: true });

  var html = renderSite(site);
  fs.writeFileSync(path.join(siteDir, "index.html"), html, "utf8");

  var subdomain = "site-" + site.id;
  var serverName = subdomain + ".blun.ai";
  if (site.custom_domain) {
    serverName = site.custom_domain + " " + serverName;
  }

  var nginxConf = "server {\n" +
    "    listen 80;\n" +
    "    server_name " + serverName + ";\n" +
    "    root " + siteDir + ";\n" +
    "    index index.html;\n\n" +
    "    location / {\n" +
    "        try_files $uri $uri/ /index.html;\n" +
    "    }\n\n" +
    "    # SSL placeholder - certbot --nginx -d " + subdomain + ".blun.ai\n" +
    "}\n";

  var confPath = path.join(NGINX_SITES, "blun-site-" + site.id + ".conf");
  fs.writeFileSync(confPath, nginxConf, "utf8");

  try { execSync("nginx -t && nginx -s reload", { timeout: 5000 }); } catch(e) {
    console.error("[websites] nginx reload failed:", e.message);
  }

  return "https://" + subdomain + ".blun.ai";
}

async function unpublish(siteId) {
  var siteDir = path.join(SITES_DIR, String(siteId));
  var confPath = path.join(NGINX_SITES, "blun-site-" + siteId + ".conf");
  try { fs.rmSync(siteDir, { recursive: true, force: true }); } catch(e) {}
  try { fs.unlinkSync(confPath); } catch(e) {}
  try { execSync("nginx -t && nginx -s reload", { timeout: 5000 }); } catch(e) {}
}

async function configureDomain(siteId, domain) {
  var siteDir = path.join(SITES_DIR, String(siteId));
  var serverName = domain + " site-" + siteId + ".blun.ai";

  var nginxConf = "server {\n" +
    "    listen 80;\n" +
    "    server_name " + serverName + ";\n" +
    "    root " + siteDir + ";\n" +
    "    index index.html;\n\n" +
    "    location / {\n" +
    "        try_files $uri $uri/ /index.html;\n" +
    "    }\n\n" +
    "    # SSL: certbot --nginx -d " + domain + "\n" +
    "}\n";

  var confPath = path.join(NGINX_SITES, "blun-site-" + siteId + ".conf");
  fs.writeFileSync(confPath, nginxConf, "utf8");
  try { execSync("nginx -t && nginx -s reload", { timeout: 5000 }); } catch(e) {
    console.error("[websites] nginx reload for domain failed:", e.message);
  }
}

module.exports = { getTemplates, getTemplateBySlug, generateContent, renderSite, publish, unpublish, configureDomain };
