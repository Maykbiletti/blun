/**
 * BLUN i18n Loader
 * Lightweight client-side translation loader.
 * Usage: include this script, then call blunI18n.init()
 */
(function() {
  var STORAGE_KEY = "blun_lang";
  var SUPPORTED = ["en", "de", "es", "fr", "pt", "tr"];
  var LABELS = { en: "EN", de: "DE", es: "ES", fr: "FR", pt: "PT", tr: "TR" };

  var translations = {};
  var currentLang = "en";

  function detectLang() {
    var url = new URLSearchParams(window.location.search);
    if (url.has("lang") && SUPPORTED.indexOf(url.get("lang")) !== -1) return url.get("lang");
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    var browser = (navigator.language || "en").slice(0, 2).toLowerCase();
    if (SUPPORTED.indexOf(browser) !== -1) return browser;
    return "en";
  }

  function loadTranslations(lang) {
    return fetch("/api/i18n/" + lang).then(function(res) {
      if (res.ok) return res.json();
      return {};
    }).then(function(data) {
      translations = data;
      currentLang = lang;
      localStorage.setItem(STORAGE_KEY, lang);
    }).catch(function(e) {
      console.warn("i18n: failed to load", lang, e);
    });
  }

  function globeSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(function(el) {
      var key = el.getAttribute("data-i18n");
      if (translations[key] !== undefined) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = translations[key];
        } else {
          el.innerHTML = translations[key];
        }
      }
    });
    document.documentElement.lang = currentLang;
    document.querySelectorAll(".lang-option").forEach(function(btn) {
      btn.classList.toggle("active", btn.dataset.lang === currentLang);
    });
  }

  function createSwitcher() {
    var container = document.querySelector(".lang-switcher");
    if (!container) return;

    var html = '<button class="lang-toggle" aria-label="Change language">' + globeSvg() + ' ' + LABELS[currentLang] + '</button>';
    html += '<div class="lang-dropdown" style="display:none;">';
    for (var i = 0; i < SUPPORTED.length; i++) {
      var l = SUPPORTED[i];
      html += '<button class="lang-option' + (l === currentLang ? ' active' : '') + '" data-lang="' + l + '">' + LABELS[l] + '</button>';
    }
    html += '</div>';
    container.innerHTML = html;

    var toggle = container.querySelector(".lang-toggle");
    var dropdown = container.querySelector(".lang-dropdown");

    toggle.addEventListener("click", function(e) {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
    });

    dropdown.querySelectorAll(".lang-option").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var lang = btn.dataset.lang;
        dropdown.style.display = "none";
        if (lang !== currentLang) {
          loadTranslations(lang).then(function() {
            applyTranslations();
            toggle.innerHTML = globeSvg() + ' ' + LABELS[lang];
          });
        }
      });
    });

    document.addEventListener("click", function() { dropdown.style.display = "none"; });
  }

  window.blunI18n = {
    init: function() {
      currentLang = detectLang();
      return loadTranslations(currentLang).then(function() {
        applyTranslations();
        createSwitcher();
      });
    },
    t: function(key) { return translations[key] || key; },
    lang: function() { return currentLang; },
    setLang: function(lang) {
      if (SUPPORTED.indexOf(lang) !== -1) {
        return loadTranslations(lang).then(function() { applyTranslations(); });
      }
    }
  };
})();
