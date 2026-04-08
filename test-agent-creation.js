/**
 * REGRESSION TEST: Agent-Erstellungs-Pipeline
 * Testet: codex_local Konfiguration, Haiku-Modell-Zuweisung, Fehlerhandling
 * Ausführung: node /root/blun/test-agent-creation.js
 */

const { query, queryOne } = require('./src/db');
const { Organisator } = require('./src/organisator/engine');

const TESTS = [];
const RESULTS = { passed: 0, failed: 0, skipped: 0 };

function test(name, fn) {
  TESTS.push({ name, fn });
}

async function runTests() {
  console.log('\n=== AGENT-ERSTELLUNGS-PIPELINE REGRESSION TESTS ===\n');

  for (const t of TESTS) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
      RESULTS.passed++;
    } catch (err) {
      console.log(`✗ ${t.name}`);
      console.log(`  Fehler: ${err.message}`);
      RESULTS.failed++;
    }
  }

  console.log(`\n=== ERGEBNISSE ===`);
  console.log(`Bestanden: ${RESULTS.passed}`);
  console.log(`Fehlgeschlagen: ${RESULTS.failed}`);
  console.log(`Übersprungen: ${RESULTS.skipped}\n`);

  process.exit(RESULTS.failed > 0 ? 1 : 0);
}

// ============================================
// TEST 1: codex_local Konfiguration Standard
// ============================================
test('T1: Agent mit codex_local Adapter wird erstellt', async () => {
  const testName = 'test-agent-' + Date.now();

  // Stelle sicher, dass eine Company existiert
  let company = await queryOne("SELECT * FROM companies LIMIT 1");
  if (!company) {
    company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *",
      ['test-company-' + Date.now(), {}]);
  }

  // Agent mit API erstellen
  const agent = await queryOne(
    "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [company.id, testName, 'general', 'codex_local', [], {}]
  );

  if (agent.adapter_type !== 'codex_local') {
    throw new Error(`Erwartung: adapter_type='codex_local', erhalten: '${agent.adapter_type}'`);
  }

  // Cleanup
  await query("DELETE FROM agents WHERE id = $1", [agent.id]);
});

// ============================================
// TEST 2: Haiku-Modell wird bei API-Erstellung gesetzt
// ============================================
test('T2: Agent mit explicit Haiku-Modell über API', async () => {
  const testName = 'haiku-agent-' + Date.now();

  let company = await queryOne("SELECT * FROM companies LIMIT 1");
  if (!company) {
    company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *",
      ['test-company-' + Date.now(), {}]);
  }

  const agent = await queryOne(
    "INSERT INTO agents (company_id, name, role, title, model, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [company.id, testName, 'general', 'Agent', 'claude-haiku-4-5', 'codex_local', [], {}]
  );

  if (agent.model !== 'claude-haiku-4-5') {
    throw new Error(`Erwartung: model='claude-haiku-4-5', erhalten: '${agent.model}'`);
  }

  // Cleanup
  await query("DELETE FROM agents WHERE id = $1", [agent.id]);
});

// ============================================
// TEST 3: BUG REPORT - CLI-Erstellung setzt kein Modell
// ============================================
test('T3: CLI-Erstellung ignoriert Modell (BUG)', async () => {
  const testName = 'cli-agent-' + Date.now();

  let company = await queryOne("SELECT * FROM companies LIMIT 1");
  if (!company) {
    company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *",
      ['test-company-' + Date.now(), {}]);
  }

  // Simuliere CLI-Erstellung: setzt kein model-Feld
  const agent = await queryOne(
    "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [company.id, testName, 'general', 'codex_local', [], {}]
  );

  // Dies sollte NULL sein - das ist das BUG
  if (agent.model !== null && agent.model !== undefined && agent.model !== '') {
    console.log(`  ⚠ CLI erstellt Agents ohne model-Feld (derzeit: ${agent.model})`);
  } else {
    throw new Error(`CLI-Agents haben kein Modell gesetzt - sollten standardmäßig Haiku sein`);
  }

  // Cleanup
  await query("DELETE FROM agents WHERE id = $1", [agent.id]);
});

// ============================================
// TEST 4: Fehlerhandling - fehlender Name
// ============================================
test('T4: Fehlerhandling bei fehlender Agent-Name', async () => {
  try {
    const agent = await queryOne(
      "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [1, '', 'general', 'codex_local', [], {}]  // leerer Name
    );

    // Wenn wir hier ankommen, sollte die Datenbank einen NOT NULL Fehler werfen
    throw new Error('Leerer Agent-Name sollte abgelehnt werden');
  } catch (err) {
    if (err.message.includes('null') || err.message.includes('constraint')) {
      // Erwartet - DB validation
      // Cleanup nicht nötig, INSERT ist fehlgeschlagen
    } else if (err.message.includes('Agent-Name sollte abgelehnt')) {
      throw err;
    }
  }
});

// ============================================
// TEST 5: Fehlerhandling - ungültige Company
// ============================================
test('T5: Fehlerhandling bei ungültiger Company-ID', async () => {
  try {
    const invalidCompanyId = 999999;
    const agent = await queryOne(
      "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [invalidCompanyId, 'test-agent', 'general', 'codex_local', [], {}]
    );

    // Wenn wir hier ankommen, sollte FK-Constraint verletzt sein
    throw new Error('Ungültige Company-ID sollte abgelehnt werden');
  } catch (err) {
    if (err.message.includes('foreign key') || err.message.includes('FK') || err.message.includes('references')) {
      // Erwartet - FK constraint violation
    } else if (err.message.includes('sollte abgelehnt')) {
      throw err;
    }
  }
});

// ============================================
// TEST 6: Config-Objekt wird korrekt gespeichert
// ============================================
test('T6: Agent-Config wird als JSON gespeichert', async () => {
  const testName = 'config-agent-' + Date.now();
  const testConfig = { workspace: '/tmp/test', extraArgs: ['--debug'] };

  let company = await queryOne("SELECT * FROM companies LIMIT 1");
  if (!company) {
    company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *",
      ['test-company-' + Date.now(), {}]);
  }

  const agent = await queryOne(
    "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [company.id, testName, 'general', 'codex_local', [], testConfig]
  );

  // Config sollte als JSON Objekt zurückkommen
  if (!agent.config || typeof agent.config !== 'object') {
    throw new Error(`Config sollte Objekt sein, erhalten: ${typeof agent.config}`);
  }

  if (agent.config.workspace !== '/tmp/test') {
    throw new Error(`Config.workspace sollte '/tmp/test' sein, erhalten: '${agent.config.workspace}'`);
  }

  // Cleanup
  await query("DELETE FROM agents WHERE id = $1", [agent.id]);
});

// ============================================
// TEST 7: Adapter-Typ Validierung
// ============================================
test('T7: Ungültiger Adapter-Typ wird abgelehnt oder ignoriert', async () => {
  const testName = 'invalid-adapter-' + Date.now();

  let company = await queryOne("SELECT * FROM companies LIMIT 1");
  if (!company) {
    company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *",
      ['test-company-' + Date.now(), {}]);
  }

  // Versuche invalid adapter zu setzen
  const agent = await queryOne(
    "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [company.id, testName, 'general', 'invalid_adapter_type', [], {}]
  );

  // Dies könnte entweder akzeptiert oder abgelehnt werden
  // Wenn akzeptiert, dann sollte runtime.js das handlen
  console.log(`  ℹ Adapter-Typ 'invalid_adapter_type' wurde akzeptiert (sollte zur Laufzeit fehlschlagen)`);

  // Cleanup
  await query("DELETE FROM agents WHERE id = $1", [agent.id]);
});

// ============================================
// TEST 8: Tools-Array wird korrekt gespeichert
// ============================================
test('T8: Tools-Array wird korrekt gespeichert', async () => {
  const testName = 'tools-agent-' + Date.now();
  const testTools = ['tool1', 'tool2', 'tool3'];

  let company = await queryOne("SELECT * FROM companies LIMIT 1");
  if (!company) {
    company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *",
      ['test-company-' + Date.now(), {}]);
  }

  const agent = await queryOne(
    "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [company.id, testName, 'general', 'codex_local', testTools, {}]
  );

  if (!Array.isArray(agent.tools) || agent.tools.length !== 3) {
    throw new Error(`Tools sollte Array mit 3 Elementen sein, erhalten: ${JSON.stringify(agent.tools)}`);
  }

  // Cleanup
  await query("DELETE FROM agents WHERE id = $1", [agent.id]);
});

// Starte Tests
(async () => {
  try {
    await runTests();
  } catch (err) {
    console.error('Kritischer Fehler:', err);
    process.exit(1);
  }
})();
