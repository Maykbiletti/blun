const express = require('express');
const router = express.Router();
const joi = require('joi');
const { v4: uuidv4 } = require('uuid');

// Mock database - in production würde hier echte DB-Anbindung stehen
let conversations = [];

// Validation Schemas
const paginationSchema = joi.object({
  limit: joi.number().integer().min(1).max(50).default(20),
  offset: joi.number().integer().min(0).default(0),
  sortBy: joi.string().valid('created_at', 'updated_at', 'title').default('updated_at'),
  order: joi.string().valid('asc', 'desc').default('desc')
});

const createConversationSchema = joi.object({
  title: joi.string().min(1).max(200).required(),
  description: joi.string().max(1000).optional(),
  participants: joi.array().items(joi.string()).min(1).required(),
  metadata: joi.object().optional()
});

const updateConversationSchema = joi.object({
  title: joi.string().min(1).max(200).optional(),
  description: joi.string().max(1000).optional(),
  metadata: joi.object().optional()
});

const messageSchema = joi.object({
  content: joi.string().min(1).max(10000).required(),
  type: joi.string().valid('text', 'image', 'file').default('text'),
  metadata: joi.object().optional()
});

// GET /conversations - Mit Pagination (max 50 Einträge)
router.get('/', async (req, res) => {
  try {
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    const { limit, offset, sortBy, order } = value;

    // Sortierung anwenden
    const sortedConversations = [...conversations].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (order === 'desc') {
        return new Date(bVal) - new Date(aVal);
      }
      return new Date(aVal) - new Date(bVal);
    });

    // Pagination anwenden
    const paginatedResults = sortedConversations.slice(offset, offset + limit);
    const total = conversations.length;

    res.json({
      data: paginatedResults,
      pagination: {
        limit,
        offset,
        total,
        pages: Math.ceil(total / limit),
        currentPage: Math.floor(offset / limit) + 1,
        hasNext: offset + limit < total,
        hasPrev: offset > 0
      }
    });

  } catch (error) {
    console.error('GET /conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /conversations/:id - Einzelne Conversation
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = conversations.find(c => c.id === id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ data: conversation });

  } catch (error) {
    console.error('GET /conversations/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /conversations - Neue Conversation erstellen
router.post('/', async (req, res) => {
  try {
    const { error, value } = createConversationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    const newConversation = {
      id: uuidv4(),
      ...value,
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active'
    };

    conversations.push(newConversation);

    res.status(201).json({ data: newConversation });

  } catch (error) {
    console.error('POST /conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /conversations/:id - Conversation updaten
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = updateConversationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    const conversationIndex = conversations.findIndex(c => c.id === id);
    if (conversationIndex === -1) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversations[conversationIndex] = {
      ...conversations[conversationIndex],
      ...value,
      updated_at: new Date().toISOString()
    };

    res.json({ data: conversations[conversationIndex] });

  } catch (error) {
    console.error('PUT /conversations/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /conversations/:id - Conversation löschen
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const conversationIndex = conversations.findIndex(c => c.id === id);
    if (conversationIndex === -1) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversations.splice(conversationIndex, 1);

    res.status(204).send();

  } catch (error) {
    console.error('DELETE /conversations/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /conversations/:id/messages - Nachricht zu Conversation hinzufügen
router.post('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = messageSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    const conversationIndex = conversations.findIndex(c => c.id === id);
    if (conversationIndex === -1) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const newMessage = {
      id: uuidv4(),
      ...value,
      author: req.user?.id || 'anonymous', // Falls Auth-Middleware vorhanden
      timestamp: new Date().toISOString()
    };

    conversations[conversationIndex].messages.push(newMessage);
    conversations[conversationIndex].updated_at = new Date().toISOString();

    res.status(201).json({ data: newMessage });

  } catch (error) {
    console.error('POST /conversations/:id/messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /conversations/:id/messages - Nachrichten einer Conversation (mit Pagination)
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = paginationSchema.validate(req.query);

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    const conversation = conversations.find(c => c.id === id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { limit, offset } = value;
    const messages = conversation.messages || [];

    // Nachrichten nach Timestamp sortiert (neueste zuerst)
    const sortedMessages = [...messages].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    const paginatedMessages = sortedMessages.slice(offset, offset + limit);
    const total = messages.length;

    res.json({
      data: paginatedMessages,
      pagination: {
        limit,
        offset,
        total,
        pages: Math.ceil(total / limit),
        currentPage: Math.floor(offset / limit) + 1,
        hasNext: offset + limit < total,
        hasPrev: offset > 0
      }
    });

  } catch (error) {
    console.error('GET /conversations/:id/messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;