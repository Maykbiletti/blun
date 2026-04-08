/**
 * Tests fuer Dieter Memory Sync Bot
 * Werner — BLUN.ai
 */

const MemoryStore = require('./memory-store');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), `blun-test-memory-${Date.now()}`);
let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  OK: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}`);
    failed++;
  }
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// --- Tests ---

console.log('=== MemoryStore Tests ===\n');

// Test 1: Initialisierung
console.log('1) Initialisierung');
cleanup();
const store = new MemoryStore(TEST_DIR);
assert(fs.existsSync(TEST_DIR), 'Memory-Dir existiert');
assert(fs.existsSync(path.join(TEST_DIR, 'index.json')), 'Index-Datei existiert');

// Test 2: Remember
console.log('\n2) Remember');
const mem1 = store.remember('Task: AgentMails implementieren', 'telegram:werner', ['task']);
assert(mem1.id.startsWith('mem_'), 'ID hat korrektes Format');
assert(mem1.text === 'Task: AgentMails implementieren', 'Text gespeichert');
assert(mem1.author === 'telegram:werner', 'Author gespeichert');
assert(mem1.tags.includes('task'), 'Tags gespeichert');
assert(fs.existsSync(path.join(TEST_DIR, `${mem1.id}.json`)), 'Datei erstellt');

// Test 3: Recall
console.log('\n3) Recall');
const mem2 = store.remember('Bug: Login geht nicht auf iOS', 'telegram:klaus', ['bug']);
const results = store.recall('AgentMails');
assert(results.length === 1, 'Genau 1 Treffer');
assert(results[0].id === mem1.id, 'Richtiges Memory gefunden');

const results2 = store.recall('Login');
assert(results2.length === 1, 'Bug gefunden');
assert(results2[0].author === 'telegram:klaus', 'Richtiger Author');

// Test 4: List
console.log('\n4) List');
const list = store.list(10);
assert(list.length === 2, '2 Memories in Liste');
assert(list[0].id === mem2.id, 'Neueste zuerst');

// Test 5: Forget
console.log('\n5) Forget');
store.forget(mem2.id);
const listAfter = store.list(10);
assert(listAfter.length === 1, 'Nur noch 1 Memory');
assert(!fs.existsSync(path.join(TEST_DIR, `${mem2.id}.json`)), 'Datei geloescht');

// Test 6: Export/Import
console.log('\n6) Export/Import');
store.remember('Decision: Twilio statt Vonage', 'telegram:greta', ['decision']);
store.remember('Feedback: Tests fehlen', 'telegram:heinrich', ['feedback']);
const exported = store.exportAll();
assert(exported.count === 3, 'Export hat 3 Memories');

const store2 = new MemoryStore(TEST_DIR + '-import');
const imported = store2.importAll(exported.memories);
assert(imported === 3, '3 Memories importiert');

const status = store2.syncStatus();
assert(status.totalMemories === 3, 'Import-Status korrekt');
assert(status.lastSync !== null, 'lastSync gesetzt');

// Test 7: Sync Status
console.log('\n7) Sync Status');
const s = store.syncStatus();
assert(s.totalMemories === 3, 'Korrekte Anzahl');
assert(s.storagePath === TEST_DIR, 'Korrekter Pfad');

// Test 8: Duplikat-Schutz bei Import
console.log('\n8) Duplikat-Schutz');
const imported2 = store2.importAll(exported.memories);
assert(imported2 === 0, 'Keine Duplikate importiert');

// Aufraemen
cleanup();
if (fs.existsSync(TEST_DIR + '-import')) {
  fs.rmSync(TEST_DIR + '-import', { recursive: true, force: true });
}

// --- Ergebnis ---
console.log(`\n=== Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen ===`);
process.exit(failed > 0 ? 1 : 0);
