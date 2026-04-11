<template>
  <section class="agent-status-grid" aria-label="Agent Status Grid">
    <header class="grid-header">
      <h2 class="title">Agents</h2>
      <button
        type="button"
        class="sort-button"
        @click="toggleStatusSort"
        :aria-label="`Sort by status ${sortDirection === 'asc' ? 'ascending' : 'descending'}`"
      >
        Sort by Status
        <span class="sort-indicator">{{ sortDirection === 'asc' ? 'ASC' : 'DESC' }}</span>
      </button>
    </header>

    <div v-if="sortedAgents.length" class="cards-grid">
      <article
        v-for="agent in sortedAgents"
        :key="agent.id || agent.name"
        class="agent-card"
      >
        <div class="card-row">
          <span class="label">Name</span>
          <strong class="value">{{ agent.name || '-' }}</strong>
        </div>

        <div class="card-row">
          <span class="label">Model</span>
          <span class="value">{{ agent.model || '-' }}</span>
        </div>

        <div class="card-row">
          <span class="label">Status</span>
          <span class="value status-pill" :data-status="normalizedStatus(agent.status)">
            {{ agent.status || 'unknown' }}
          </span>
        </div>

        <div class="card-row">
          <span class="label">Current Task</span>
          <span class="value task" :title="agent.currentTask || '-'">{{ agent.currentTask || '-' }}</span>
        </div>

        <div class="card-row">
          <span class="label">Success Rate</span>
          <span class="value">{{ formatSuccessRate(agent.successRate) }}</span>
        </div>
      </article>
    </div>

    <p v-else class="empty-state">No agents available.</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  agents: {
    type: Array,
    default: () => []
  }
});

const sortDirection = ref('asc');

const STATUS_ORDER = {
  online: 1,
  active: 1,
  busy: 2,
  idle: 3,
  paused: 4,
  offline: 5,
  error: 6,
  unknown: 7
};

function normalizedStatus(status) {
  return String(status || 'unknown').toLowerCase().trim();
}

function getStatusWeight(status) {
  const normalized = normalizedStatus(status);
  return STATUS_ORDER[normalized] ?? STATUS_ORDER.unknown;
}

function toggleStatusSort() {
  sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
}

function formatSuccessRate(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'string' && value.includes('%')) {
    return value;
  }

  const numeric = Number(value);

  if (Number.isNaN(numeric)) {
    return '-';
  }

  if (numeric <= 1) {
    return `${(numeric * 100).toFixed(1)}%`;
  }

  return `${numeric.toFixed(1)}%`;
}

const sortedAgents = computed(() => {
  const list = [...props.agents];

  return list.sort((a, b) => {
    const weightA = getStatusWeight(a.status);
    const weightB = getStatusWeight(b.status);

    if (weightA !== weightB) {
      return sortDirection.value === 'asc' ? weightA - weightB : weightB - weightA;
    }

    const nameA = String(a.name || '').toLowerCase();
    const nameB = String(b.name || '').toLowerCase();

    return nameA.localeCompare(nameB);
  });
});
</script>

<style scoped>
.agent-status-grid {
  display: grid;
  gap: 1rem;
}

.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.sort-button {
  border: 1px solid #cfd8e3;
  background: #f8fbff;
  color: #1a2c42;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-button:hover {
  background: #eef5ff;
}

.sort-indicator {
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  opacity: 0.8;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.agent-card {
  border: 1px solid #dce4ef;
  border-radius: 12px;
  background: #ffffff;
  padding: 0.8rem;
  display: grid;
  gap: 0.5rem;
}

.card-row {
  display: grid;
  grid-template-columns: 92px 1fr;
  align-items: center;
  column-gap: 0.5rem;
}

.label {
  color: #5a6b7f;
  font-size: 0.8rem;
}

.value {
  color: #16202b;
  font-size: 0.86rem;
  min-width: 0;
}

.task {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  justify-self: start;
  display: inline-flex;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid transparent;
  text-transform: capitalize;
}

.status-pill[data-status='online'],
.status-pill[data-status='active'] {
  color: #0d6b39;
  border-color: #8ce0b5;
  background: #e9f9f0;
}

.status-pill[data-status='busy'] {
  color: #8a5300;
  border-color: #ffd08a;
  background: #fff4e5;
}

.status-pill[data-status='idle'],
.status-pill[data-status='paused'] {
  color: #284b8f;
  border-color: #aac2f0;
  background: #edf3ff;
}

.status-pill[data-status='offline'],
.status-pill[data-status='error'],
.status-pill[data-status='unknown'] {
  color: #6a2d35;
  border-color: #efb0ba;
  background: #fff0f3;
}

.empty-state {
  margin: 0;
  padding: 1rem;
  border: 1px dashed #cfd8e3;
  border-radius: 10px;
  color: #58687c;
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .grid-header {
    flex-direction: column;
    align-items: stretch;
  }

  .card-row {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
}
</style>
