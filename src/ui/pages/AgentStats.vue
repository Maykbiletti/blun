<template>
  <section class="agent-stats-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Agent Monitoring</p>
        <h1>Agent Performance Stats</h1>
      </div>
      <div class="header-meta">
        <span class="meta-pill">{{ sortedAgents.length }} agents</span>
        <span class="meta-pill">sorted by {{ activeSortLabel }}</span>
      </div>
    </header>

    <div class="table-shell" role="region" aria-label="Agent performance table">
      <table class="stats-table">
        <thead>
          <tr>
            <th>
              <button class="sort-button" @click="setSort('name')">
                Agent
                <span :class="sortIndicatorClass('name')">{{ sortIndicator('name') }}</span>
              </button>
            </th>
            <th>
              <button class="sort-button" @click="setSort('completionRate')">
                Completion Rate
                <span :class="sortIndicatorClass('completionRate')">{{ sortIndicator('completionRate') }}</span>
              </button>
            </th>
            <th>
              <button class="sort-button" @click="setSort('avgDuration')">
                Avg Duration
                <span :class="sortIndicatorClass('avgDuration')">{{ sortIndicator('avgDuration') }}</span>
              </button>
            </th>
            <th>
              <button class="sort-button" @click="setSort('errorCount')">
                Error Count
                <span :class="sortIndicatorClass('errorCount')">{{ sortIndicator('errorCount') }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in sortedAgents" :key="agent.id">
            <td class="name-cell">{{ agent.name }}</td>
            <td>
              <div class="completion-wrap">
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: `${agent.completionRate}%` }" />
                </div>
                <span>{{ formatPercent(agent.completionRate) }}</span>
              </div>
            </td>
            <td>{{ formatDuration(agent.avgDuration) }}</td>
            <td :class="errorToneClass(agent.errorCount)">{{ agent.errorCount }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mobile-cards">
      <article class="agent-card" v-for="agent in sortedAgents" :key="`${agent.id}-card`">
        <h2>{{ agent.name }}</h2>
        <dl>
          <div>
            <dt>Completion Rate</dt>
            <dd>{{ formatPercent(agent.completionRate) }}</dd>
          </div>
          <div>
            <dt>Avg Duration</dt>
            <dd>{{ formatDuration(agent.avgDuration) }}</dd>
          </div>
          <div>
            <dt>Error Count</dt>
            <dd :class="errorToneClass(agent.errorCount)">{{ agent.errorCount }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';

const agents = ref([
  { id: 'agt-1', name: 'Guenter', completionRate: 96.2, avgDuration: 158, errorCount: 1 },
  { id: 'agt-2', name: 'Helmut', completionRate: 92.8, avgDuration: 204, errorCount: 3 },
  { id: 'agt-3', name: 'Sandra', completionRate: 98.1, avgDuration: 142, errorCount: 0 },
  { id: 'agt-4', name: 'Petra', completionRate: 89.4, avgDuration: 221, errorCount: 5 },
  { id: 'agt-5', name: 'Klaus', completionRate: 94.7, avgDuration: 173, errorCount: 2 },
  { id: 'agt-6', name: 'Marlene', completionRate: 91.2, avgDuration: 236, errorCount: 4 },
]);

const sortState = ref({ key: 'completionRate', direction: 'desc' });

const activeSortLabel = computed(() => {
  const labels = {
    name: 'agent name',
    completionRate: 'completion rate',
    avgDuration: 'average duration',
    errorCount: 'error count',
  };

  return `${labels[sortState.value.key]} (${sortState.value.direction})`;
});

const sortedAgents = computed(() => {
  const list = [...agents.value];
  const { key, direction } = sortState.value;
  const factor = direction === 'asc' ? 1 : -1;

  return list.sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name) * factor;
    }

    return (a[key] - b[key]) * factor;
  });
});

function setSort(key) {
  if (sortState.value.key === key) {
    sortState.value.direction = sortState.value.direction === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortState.value.key = key;
  sortState.value.direction = key === 'name' ? 'asc' : 'desc';
}

function sortIndicator(key) {
  if (sortState.value.key !== key) {
    return '↕';
  }

  return sortState.value.direction === 'asc' ? '↑' : '↓';
}

function sortIndicatorClass(key) {
  return {
    indicator: true,
    active: sortState.value.key === key,
  };
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function errorToneClass(errorCount) {
  if (errorCount === 0) {
    return 'tone-ok';
  }

  if (errorCount <= 2) {
    return 'tone-warn';
  }

  return 'tone-bad';
}
</script>

<style scoped>
.agent-stats-page {
  padding: clamp(16px, 2vw, 28px);
  color: #1c2430;
  background: linear-gradient(180deg, #f4f7fb 0%, #ffffff 100%);
  min-height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
  color: #4b6580;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1 {
  margin: 4px 0 0;
  font-size: clamp(1.2rem, 2vw, 1.8rem);
}

.header-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-pill {
  background: #e8eef7;
  color: #2f4660;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.table-shell {
  border: 1px solid #dbe4f1;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 14px 12px;
  border-bottom: 1px solid #eef2f8;
}

th {
  background: #f8faff;
}

.name-cell {
  font-weight: 600;
}

.sort-button {
  border: 0;
  padding: 0;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: #25354a;
  cursor: pointer;
}

.indicator {
  opacity: 0.5;
}

.indicator.active {
  opacity: 1;
}

.completion-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-track {
  position: relative;
  width: 120px;
  height: 8px;
  border-radius: 999px;
  background: #e6edf8;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #2f8fff, #23b36b);
}

.tone-ok {
  color: #1f8a4d;
  font-weight: 700;
}

.tone-warn {
  color: #ca7b16;
  font-weight: 700;
}

.tone-bad {
  color: #bf2237;
  font-weight: 700;
}

.mobile-cards {
  display: none;
}

@media (max-width: 800px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .table-shell {
    display: none;
  }

  .mobile-cards {
    display: grid;
    gap: 12px;
    margin-top: 8px;
  }

  .agent-card {
    background: #fff;
    border: 1px solid #dbe4f1;
    border-radius: 12px;
    padding: 12px;
  }

  .agent-card h2 {
    margin: 0 0 10px;
    font-size: 1rem;
  }

  .agent-card dl {
    margin: 0;
    display: grid;
    gap: 8px;
  }

  .agent-card dt {
    font-size: 0.78rem;
    color: #4f647f;
  }

  .agent-card dd {
    margin: 2px 0 0;
    font-weight: 700;
  }
}
</style>
