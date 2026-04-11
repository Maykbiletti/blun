<template>
  <section class="agent-status-grid" aria-label="Agent Status Grid">
    <header class="agent-status-grid__header">
      <div>
        <h2 class="agent-status-grid__title">Agent Status</h2>
        <p class="agent-status-grid__subtitle">
          {{ visibleAgents.length }} agents tracked
        </p>
      </div>
      <div class="agent-status-grid__totals">
        <span class="pill pill--ok">OK {{ summary.ok }}</span>
        <span class="pill pill--warn">Warn {{ summary.warning }}</span>
        <span class="pill pill--error">Error {{ summary.error }}</span>
      </div>
    </header>

    <div v-if="visibleAgents.length" class="agent-status-grid__cards">
      <article
        v-for="agent in visibleAgents"
        :key="agent.id"
        class="agent-status-card"
        :class="`agent-status-card--${normalizeStatus(agent.status)}`"
      >
        <div class="agent-status-card__head">
          <h3 class="agent-status-card__name">{{ agent.name || agent.id }}</h3>
          <span class="agent-status-card__badge">{{ labelForStatus(agent.status) }}</span>
        </div>

        <p class="agent-status-card__detail">{{ agent.message || 'No details provided' }}</p>

        <dl class="agent-status-card__meta">
          <div>
            <dt>Last heartbeat</dt>
            <dd>{{ formatDate(agent.lastHeartbeat) }}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{{ agent.runtime || 'n/a' }}</dd>
          </div>
        </dl>

        <div class="agent-status-card__actions">
          <button type="button" @click="$emit('select', agent)">Open</button>
          <button
            type="button"
            :disabled="normalizeStatus(agent.status) === 'ok'"
            @click="$emit('retry', agent)"
          >
            Retry
          </button>
        </div>
      </article>
    </div>

    <p v-else class="agent-status-grid__empty">No agents available.</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  agents: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['retry', 'select']);

const visibleAgents = computed(() =>
  (props.agents || [])
    .filter((agent) => agent && (agent.id || agent.name))
    .map((agent) => ({
      ...agent,
      status: normalizeStatus(agent.status),
    }))
    .sort((a, b) => severityRank(b.status) - severityRank(a.status)),
);

const summary = computed(() => {
  return visibleAgents.value.reduce(
    (acc, agent) => {
      const key = normalizeStatus(agent.status);
      acc[key] += 1;
      return acc;
    },
    { ok: 0, warning: 0, error: 0 },
  );
});

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'error' || value === 'failed' || value === 'down') return 'error';
  if (value === 'warning' || value === 'degraded' || value === 'slow') return 'warning';
  return 'ok';
}

function labelForStatus(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'error') return 'Error';
  if (normalized === 'warning') return 'Warning';
  return 'OK';
}

function severityRank(status) {
  if (status === 'error') return 3;
  if (status === 'warning') return 2;
  return 1;
}

function formatDate(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
</script>

<style scoped>
.agent-status-grid {
  display: grid;
  gap: 1rem;
}

.agent-status-grid__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.agent-status-grid__title {
  margin: 0;
  font-size: 1.125rem;
}

.agent-status-grid__subtitle {
  margin: 0.25rem 0 0;
  opacity: 0.7;
}

.agent-status-grid__totals {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.pill {
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  background: #e5e7eb;
  color: #111827;
}

.pill--ok { background: #dcfce7; color: #166534; }
.pill--warn { background: #fef3c7; color: #92400e; }
.pill--error { background: #fee2e2; color: #991b1b; }

.agent-status-grid__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}

.agent-status-card {
  border: 1px solid #e5e7eb;
  border-left-width: 4px;
  border-radius: 0.75rem;
  padding: 0.875rem;
  background: #fff;
}

.agent-status-card--ok { border-left-color: #16a34a; }
.agent-status-card--warning { border-left-color: #d97706; }
.agent-status-card--error { border-left-color: #dc2626; }

.agent-status-card__head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.agent-status-card__name {
  margin: 0;
  font-size: 1rem;
}

.agent-status-card__badge {
  font-size: 0.75rem;
  font-weight: 700;
}

.agent-status-card__detail {
  margin: 0.625rem 0;
  min-height: 2.4em;
}

.agent-status-card__meta {
  margin: 0;
  display: grid;
  gap: 0.25rem;
}

.agent-status-card__meta div {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.agent-status-card__meta dt {
  opacity: 0.65;
}

.agent-status-card__meta dd {
  margin: 0;
  font-weight: 500;
}

.agent-status-card__actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

.agent-status-card__actions button {
  border: 1px solid #d1d5db;
  background: #f9fafb;
  border-radius: 0.5rem;
  padding: 0.375rem 0.625rem;
  cursor: pointer;
}

.agent-status-card__actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-status-grid__empty {
  margin: 0;
  opacity: 0.75;
}
</style>
