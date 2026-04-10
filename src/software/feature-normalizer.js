// BLUN Software Wizard - Feature Normalizer
// Parses data-feature=TYPE attributes from generated HTML and normalizes to feature schema

'use strict';

// Canonical feature types
const FEATURE_TYPES = [
  'auth_flow',
  'payment_checkout',
  'payment_apple_pay',
  'payment_google_pay',
  'data_table',
  'form',
  'dashboard',
  'settings_panel',
  'notification_center',
  'search_filter',
  'file_upload',
  'chart',
  'modal',
  'i18n_switcher',
  'theme_switcher',
  'nav_header',
  'sidebar',
  'footer'
];

// Feature schema factory
function createFeature(type, opts) {
  opts = opts || {};
  return {
    type: type,
    id: opts.id || (type + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    code_fragment: opts.code_fragment || '',
    dependencies: Array.isArray(opts.dependencies) ? opts.dependencies : [],
    editable_regions: Array.isArray(opts.editable_regions) ? opts.editable_regions : []
  };
}

// Extract data-feature sections from generated HTML
// Returns array of { type, id, code_fragment, dependencies, editable_regions }
function parseFeatures(html) {
  if (!html || typeof html !== 'string') return [];

  var features = [];
  // Match <section data-feature="TYPE" ...>...</section> (greedy per block)
  var sectionRe = /<section[^>]+data-feature="([^"]+)"([^>]*)>([\s\S]*?)<\/section>/gi;
  var match;

  while ((match = sectionRe.exec(html)) !== null) {
    var type = match[1].toLowerCase().replace(/-/g, '_');
    var attrs = match[2];
    var fragment = match[0];

    // Extract data-id if present
    var idMatch = attrs.match(/data-id="([^"]+)"/);
    var featureId = idMatch ? idMatch[1] : null;

    // Extract editable regions: elements with data-edit attribute
    var editableRegions = [];
    var editRe = /data-edit="([^"]+)"/g;
    var editMatch;
    while ((editMatch = editRe.exec(fragment)) !== null) {
      editableRegions.push(editMatch[1]);
    }

    // Infer dependencies from payment types
    var dependencies = inferDependencies(type, fragment);

    features.push(createFeature(type, {
      id: featureId,
      code_fragment: fragment,
      dependencies: dependencies,
      editable_regions: editableRegions
    }));
  }

  return features;
}

// Normalize a raw feature list from brief/KI output
// Accepts mixed array of strings (type names) or partial feature objects
function normalizeFeatures(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(function(item) {
    if (typeof item === 'string') {
      var type = item.toLowerCase().replace(/-/g, '_');
      return createFeature(FEATURE_TYPES.includes(type) ? type : 'modal', { id: type });
    }
    if (item && typeof item === 'object') {
      var type = (item.type || 'modal').toLowerCase().replace(/-/g, '_');
      return createFeature(FEATURE_TYPES.includes(type) ? type : type, {
        id: item.id,
        code_fragment: item.code_fragment || item.html || '',
        dependencies: item.dependencies,
        editable_regions: item.editable_regions
      });
    }
    return null;
  }).filter(Boolean);
}

// Infer external dependencies from feature type and fragment content
function inferDependencies(type, fragment) {
  var deps = [];
  if (type === 'payment_checkout' || type === 'payment_apple_pay' || type === 'payment_google_pay') {
    deps.push('stripe.js');
  }
  if (fragment && fragment.includes('stripe')) deps.push('stripe.js');
  if (fragment && fragment.includes('paypal')) deps.push('paypal.js');
  if (fragment && /google.*pay|gpay/i.test(fragment)) deps.push('google-pay-sdk');
  return [...new Set(deps)];
}

// Validate that a feature object conforms to schema
function validateFeature(f) {
  return (
    f &&
    typeof f.type === 'string' &&
    typeof f.id === 'string' &&
    typeof f.code_fragment === 'string' &&
    Array.isArray(f.dependencies) &&
    Array.isArray(f.editable_regions)
  );
}

module.exports = {
  FEATURE_TYPES,
  createFeature,
  parseFeatures,
  normalizeFeatures,
  validateFeature
};
