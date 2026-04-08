/**
 * Memory Store fuer Dieter — Persistente Erinnerungen mit JSON-Dateien
 * BLUN.ai Agent-Team — Werner (Mobile & Desktop Dev)
 */

const fs = require('fs');
const path = require('path');

class MemoryStore {
  constructor(memoryPath) {
    this.memoryPath = memoryPath || path.join(__dirname, 'memories');
    this.indexFile = path.join(this.memoryPath, 'index.json');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.memoryPath)) {
      fs.mkdirSync(this.memoryPath, { recursive: true });
    }
    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify({ memories: [], lastSync: null }, null, 2));
    }
  }

  _loadIndex() {
    const raw = fs.readFileSync(this.indexFile, 'utf-8');
    return JSON.parse(raw);
  }

  _saveIndex(index) {
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
  }

  _memoryFile(id) {
    return path.join(this.memoryPath, `${id}.json`);
  }

  /**
   * Neue Erinnerung speichern
   * @param {string} text - Inhalt der Erinnerung
   * @param {string} author - Wer hat es geschrieben (chatId oder Name)
   * @param {string[]} tags - Optionale Tags
   * @returns {object} Die gespeicherte Erinnerung
   */
  remember(text, author, tags = []) {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const memory = {
      id,
      text,
      author,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(this._memoryFile(id), JSON.stringify(memory, null, 2));

    const index = this._loadIndex();
    index.memories.push({ id, preview: text.slice(0, 100), tags, createdAt: memory.createdAt });
    this._saveIndex(index);

    return memory;
  }

  /**
   * Erinnerung per Stichwort suchen
   * @param {string} query - Suchbegriff
   * @returns {object[]} Gefundene Erinnerungen
   */
  recall(query) {
    const index = this._loadIndex();
    const queryLower = query.toLowerCase();

    const matches = index.memories.filter(m =>
      m.preview.toLowerCase().includes(queryLower) ||
      (m.tags && m.tags.some(t => t.toLowerCase().includes(queryLower)))
    );

    return matches.map(m => {
      const filePath = this._memoryFile(m.id);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      return m;
    });
  }

  /**
   * Alle Erinnerungen auflisten
   * @param {number} limit - Max Anzahl (default 20)
   * @returns {object[]} Liste der Erinnerungen
   */
  list(limit = 20) {
    const index = this._loadIndex();
    return index.memories.slice(-limit).reverse();
  }

  /**
   * Erinnerung loeschen
   * @param {string} id - Memory ID
   * @returns {boolean} Erfolgreich?
   */
  forget(id) {
    const filePath = this._memoryFile(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const index = this._loadIndex();
    index.memories = index.memories.filter(m => m.id !== id);
    this._saveIndex(index);
    return true;
  }

  /**
   * Alle Erinnerungen als Export (fuer Sync)
   * @returns {object} Kompletter Memory-Dump
   */
  exportAll() {
    const index = this._loadIndex();
    const all = index.memories.map(m => {
      const filePath = this._memoryFile(m.id);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      return null;
    }).filter(Boolean);

    return {
      count: all.length,
      exportedAt: new Date().toISOString(),
      memories: all
    };
  }

  /**
   * Import von externem Memory-Dump (fuer Sync)
   * @param {object[]} memories - Array von Memory-Objekten
   * @returns {number} Anzahl importierter Erinnerungen
   */
  importAll(memories) {
    let imported = 0;
    const index = this._loadIndex();
    const existingIds = new Set(index.memories.map(m => m.id));

    for (const mem of memories) {
      if (!existingIds.has(mem.id)) {
        fs.writeFileSync(this._memoryFile(mem.id), JSON.stringify(mem, null, 2));
        index.memories.push({
          id: mem.id,
          preview: mem.text.slice(0, 100),
          tags: mem.tags || [],
          createdAt: mem.createdAt
        });
        imported++;
      }
    }

    index.lastSync = new Date().toISOString();
    this._saveIndex(index);
    return imported;
  }

  /**
   * Sync-Status
   */
  syncStatus() {
    const index = this._loadIndex();
    return {
      totalMemories: index.memories.length,
      lastSync: index.lastSync,
      storagePath: this.memoryPath
    };
  }
}

module.exports = MemoryStore;
