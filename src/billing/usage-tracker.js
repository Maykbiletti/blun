// In-Memory Usage Tracker for BLUN Agents
// Tracks token usage per agent and model

const usageMap = new Map();

/**
 * Track usage for an agent
 * @param {string} agentId - Unique agent identifier
 * @param {number} tokens - Token count to add
 * @param {string} model - Model name used
 */
function trackUsage(agentId, tokens, model) {
    if (!usageMap.has(agentId)) {
        usageMap.set(agentId, {
            totalTokens: 0,
            models: new Map()
        });
    }

    const agentUsage = usageMap.get(agentId);
    agentUsage.totalTokens += tokens;

    if (!agentUsage.models.has(model)) {
        agentUsage.models.set(model, 0);
    }
    agentUsage.models.set(model, agentUsage.models.get(model) + tokens);
}

/**
 * Get usage summary for an agent
 * @param {string} agentId - Agent identifier
 * @returns {Object} Usage summary with total tokens and breakdown by model
 */
function getUsage(agentId) {
    if (!usageMap.has(agentId)) {
        return {
            totalTokens: 0,
            models: {}
        };
    }

    const agentUsage = usageMap.get(agentId);
    const models = {};

    for (const [model, tokens] of agentUsage.models) {
        models[model] = tokens;
    }

    return {
        totalTokens: agentUsage.totalTokens,
        models
    };
}

/**
 * Get all agents usage (admin function)
 * @returns {Object} All agents usage data
 */
function getAllUsage() {
    const allUsage = {};

    for (const [agentId] of usageMap) {
        allUsage[agentId] = getUsage(agentId);
    }

    return allUsage;
}

/**
 * Reset usage for an agent
 * @param {string} agentId - Agent identifier
 */
function resetUsage(agentId) {
    usageMap.delete(agentId);
}

/**
 * Reset all usage data
 */
function resetAllUsage() {
    usageMap.clear();
}

module.exports = {
    trackUsage,
    getUsage,
    getAllUsage,
    resetUsage,
    resetAllUsage
};