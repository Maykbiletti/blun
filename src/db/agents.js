const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../blun.db');
const db = new Database(dbPath);

// Prepare statements for better performance
const selectAgentsByFirma = db.prepare(`
    SELECT id, name, role, status, model
    FROM agents
    WHERE firma = ?
`);

const selectAllAgents = db.prepare(`
    SELECT id, name, role, status, model
    FROM agents
`);

const selectAgentById = db.prepare(`
    SELECT *
    FROM agents
    WHERE id = ?
`);

const insertAgent = db.prepare(`
    INSERT INTO agents (name, role, status, model, firma, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
`);

const updateAgent = db.prepare(`
    UPDATE agents
    SET name = ?, role = ?, status = ?, model = ?
    WHERE id = ?
`);

const deleteAgent = db.prepare(`
    DELETE FROM agents
    WHERE id = ?
`);

function getAgentsByFirma(firma) {
    try {
        return selectAgentsByFirma.all(firma);
    } catch (error) {
        console.error('Error getting agents by firma:', error);
        return [];
    }
}

function getAllAgents() {
    try {
        return selectAllAgents.all();
    } catch (error) {
        console.error('Error getting all agents:', error);
        return [];
    }
}

function getAgentById(id) {
    try {
        return selectAgentById.get(id);
    } catch (error) {
        console.error('Error getting agent by ID:', error);
        return null;
    }
}

function createAgent(agent) {
    try {
        const { name, role, status, model, firma } = agent;
        const result = insertAgent.run(name, role, status, model, firma);
        return { id: result.lastInsertRowid, ...agent };
    } catch (error) {
        console.error('Error creating agent:', error);
        throw error;
    }
}

function updateAgentById(id, agent) {
    try {
        const { name, role, status, model } = agent;
        updateAgent.run(name, role, status, model, id);
        return getAgentById(id);
    } catch (error) {
        console.error('Error updating agent:', error);
        throw error;
    }
}

function deleteAgentById(id) {
    try {
        const result = deleteAgent.run(id);
        return result.changes > 0;
    } catch (error) {
        console.error('Error deleting agent:', error);
        return false;
    }
}

module.exports = {
    getAgentsByFirma,
    getAllAgents,
    getAgentById,
    createAgent,
    updateAgentById,
    deleteAgentById
};