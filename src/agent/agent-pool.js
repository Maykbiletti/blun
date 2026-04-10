class AgentPool {
    constructor() {
        this.agents = new Map();
        this.busyAgents = new Set();
    }

    register(agent) {
        if (!agent || !agent.id) {
            throw new Error('Agent must have an id');
        }
        this.agents.set(agent.id, agent);
        return agent.id;
    }

    getIdle() {
        const idleAgents = [];
        for (const [id, agent] of this.agents) {
            if (!this.busyAgents.has(id)) {
                idleAgents.push(agent);
            }
        }
        return idleAgents;
    }

    getBusy() {
        const busyAgents = [];
        for (const id of this.busyAgents) {
            const agent = this.agents.get(id);
            if (agent) {
                busyAgents.push(agent);
            }
        }
        return busyAgents;
    }

    markBusy(id) {
        if (!this.agents.has(id)) {
            throw new Error(`Agent with id ${id} not found`);
        }
        this.busyAgents.add(id);
        return true;
    }

    markIdle(id) {
        if (!this.agents.has(id)) {
            throw new Error(`Agent with id ${id} not found`);
        }
        this.busyAgents.delete(id);
        return true;
    }

    getStats() {
        const total = this.agents.size;
        const busy = this.busyAgents.size;
        const idle = total - busy;

        return {
            total,
            busy,
            idle,
            utilizationRate: total > 0 ? (busy / total) * 100 : 0
        };
    }
}

module.exports = AgentPool;