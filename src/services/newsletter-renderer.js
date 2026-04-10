"use strict";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 40);
}

function withUtm(url, campaign) {
  if (!url || typeof url !== "string") return "#";
  var safeCampaign = toSlug(campaign || "newsletter");
  var separator = url.indexOf("?") === -1 ? "?" : "&";
  return url + separator + "utm_source=blun&utm_medium=email&utm_campaign=" + encodeURIComponent(safeCampaign);
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter(function (section) {
      return section && typeof section === "object" && section.title && section.body;
    })
    .slice(0, 12)
    .map(function (section) {
      return {
        title: String(section.title).trim().substring(0, 120),
        body: String(section.body).trim().substring(0, 2000),
        highlight: !!section.highlight
      };
    });
}

function validateNewsletterPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "payload must be an object" };
  }

  var subject = String(payload.subject || "").trim();
  if (!subject) {
    return { valid: false, error: "subject is required" };
  }

  if (subject.length > 200) {
    return { valid: false, error: "subject must not exceed 200 characters" };
  }

  if (payload.cta_url && !/^https?:\/\//i.test(String(payload.cta_url))) {
    return { valid: false, error: "cta_url must start with http:// or https://" };
  }

  var sections = normalizeSections(payload.sections || []);
  if (!String(payload.body || "").trim() && sections.length === 0) {
    return { valid: false, error: "either body or sections must be provided" };
  }

  return {
    valid: true,
    normalized: {
      subject: subject,
      preheader: String(payload.preheader || "").trim().substring(0, 200),
      intro: String(payload.body || payload.intro || "").trim().substring(0, 5000),
      cta_label: String(payload.cta_label || "Mehr erfahren").trim().substring(0, 60),
      cta_url: String(payload.cta_url || "").trim(),
      sections: sections,
      campaign: String(payload.campaign || subject).trim()
    }
  };
}

function renderNewsletterHtml(payload) {
  var normalizedCheck = validateNewsletterPayload(payload);
  if (!normalizedCheck.valid) {
    return { ok: false, error: normalizedCheck.error };
  }

  var data = normalizedCheck.normalized;
  var ctaUrl = withUtm(data.cta_url, data.campaign);
  var sectionHtml = data.sections.map(function (section) {
    var style = section.highlight
      ? "background:#f4f8ff;border-left:4px solid #2f5cff;padding:12px 16px;border-radius:8px;"
      : "background:#ffffff;border:1px solid #e7e7ef;padding:12px 16px;border-radius:8px;";
    return "<article style='" + style + "margin-bottom:12px;'>" +
      "<h3 style='margin:0 0 8px 0;font-size:18px;line-height:1.3;color:#111827;'>" + escapeHtml(section.title) + "</h3>" +
      "<p style='margin:0;font-size:15px;line-height:1.6;color:#374151;'>" + escapeHtml(section.body) + "</p>" +
      "</article>";
  }).join("");

  var html = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
    "<body style='margin:0;background:#f7f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;'>" +
    "<div style='display:none;max-height:0;overflow:hidden;opacity:0;'>" + escapeHtml(data.preheader) + "</div>" +
    "<table role='presentation' width='100%' cellspacing='0' cellpadding='0'><tr><td align='center' style='padding:24px;'>" +
    "<table role='presentation' width='640' style='max-width:640px;background:#ffffff;border-radius:12px;padding:24px;'>" +
    "<tr><td>" +
    "<h1 style='margin:0 0 16px 0;font-size:28px;line-height:1.2;'>" + escapeHtml(data.subject) + "</h1>" +
    "<p style='margin:0 0 18px 0;font-size:16px;line-height:1.7;color:#374151;'>" + escapeHtml(data.intro) + "</p>" +
    sectionHtml +
    (data.cta_url ? "<p style='margin:20px 0 0 0;'><a href='" + escapeHtml(ctaUrl) + "' style='display:inline-block;background:#111827;color:#ffffff;padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:600;'>" + escapeHtml(data.cta_label) + "</a></p>" : "") +
    "<p style='margin:24px 0 0 0;font-size:12px;color:#6b7280;'>BLUN Newsletter</p>" +
    "</td></tr></table></td></tr></table></body></html>";

  var textParts = [data.subject, "", data.intro, ""];
  data.sections.forEach(function (section) {
    textParts.push(section.title);
    textParts.push(section.body);
    textParts.push("");
  });
  if (data.cta_url) {
    textParts.push(data.cta_label + ": " + ctaUrl);
  }

  return {
    ok: true,
    html: html,
    text: textParts.join("\n").trim(),
    meta: {
      section_count: data.sections.length,
      has_cta: !!data.cta_url,
      campaign: toSlug(data.campaign)
    }
  };
}

module.exports = {
  validateNewsletterPayload: validateNewsletterPayload,
  renderNewsletterHtml: renderNewsletterHtml
};
