<template>
  <section class="task-monitor-page">
    <header class="page-header">
      <div class="title-wrap">
        <p class="eyebrow">Operations</p>
        <h1>Task Queue Monitor</h1>
      </div>

      <div class="connection-pill" :class="connectionStateClass">
        <span class="dot" />
        <span>{{ connectionLabel }}</span>
      </div>
    </header>

    <section class="stats-grid">
      <article class="stat-card pending">
        <p class="label">Pending</p>
        <p class="value">{{ statusSummary.pending }}</p>
      </article>
      <article class="stat-card processing">
        <p class="label">Processing</p>
        <p class="value">{{ statusSummary.processing }}</p>
      </article>
      <article class="stat-card completed">
        <p class="label">Completed</p>
        <p class="value">{{ statusSummary.completed }}</p>
      </article>
      <article class="stat-card total">
        <p class="label">Total</p>
        <p class="value">{{ tasks.length }}</p>
      </article>
    </section>

    <section class="toolbar">
      <div class="toolbar-left">
        <button
          class="sort-button"
          :class="{ active: sortBy === 'status' }"
          type="button"
          @click="changeSort('status')"
        >
          Sort: Status
          <span class="sort-indicator">{{ sortBy === 'status' ? directionArrow : '' }}</span>
        </button>

        <button
          class="sort-button"
          :class="{ active: sortBy === 'agent' }"
          type="button"
          @click="changeSort('agent')"
        >
          Sort: Agent
          <span class="sort-indicator">{{ sortBy === 'agent' ? directionArrow : '' }}</span>
        </button>

        <button
          class="sort-button"
          :class="{ active: sortBy === 'updatedAt' }"
          type="button"
          @click="changeSort('updatedAt')"
        >
          Sort: Time
          <span class="sort-indicator">{{ sortBy === 'updatedAt' ? directionArrow : '' }}</span>
        </button>
      </div>

      <p class="last-update">Last update: {{ lastUpdateLabel }}</p>
    </section>

    <section class="table-wrap" aria-live="polite">
      <table class="task-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Task</th>
            <th>Status</th>
            <th>Agent</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in sortedTasks" :key="task.id">
            <td class="mono">{{ task.id }}</td>
            <td>
              <p class="task-title">{{ task.title }}</p>
              <p class="task-sub">{{ task.queue || 'default' }}</p>
            </td>
            <td>
              <span class="status-chip" :class="statusClass(task.status)">
                {{ task.status }}
              </span>
            </td>
            <td>{{ task.agent || 'unassigned' }}</td>
            <td class="mono">{{ formatTimestamp(task.updatedAt) }}</td>
          </tr>
          <tr v-if="sortedTasks.length === 0">
            <td colspan="5" class="empty-state">No tasks in queue.</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const tasks = ref([]);
const connectionState = ref('connecting');
const sortBy = ref('updatedAt');
const sortDirection = ref('desc');
const lastUpdateAt = ref(null);

let socket = null;
let reconnectTimer = null;

const statusOrder = {
  pending: 1,
  processing: 2,
  completed: 3,
};

const statusSummary = computed(() => {
  return tasks.value.reduce(
    (acc, task) => {
      const key = normalizeStatus(task.status);
      if (acc[key] !== undefined) {
        acc[key] += 1;
      }
      return acc;
    },
    { pending: 0, processing: 0, completed: 0 },
  );
});

const sortedTasks = computed(() => {
  const list = [...tasks.value];
  list.sort((a, b) => compareTasks(a, b, sortBy.value, sortDirection.value));
  return list;
});

const connectionLabel = computed(() => {
  if (connectionState.value === 'open') return 'Live';
  if (connectionState.value === 'error') return 'Retrying';
  return 'Connecting';
});

const connectionStateClass = computed(() => `state-${connectionState.value}`);
const directionArrow = computed(() => (sortDirection.value === 'asc' ? '↑' : '↓'));
const lastUpdateLabel = computed(() =>
  lastUpdateAt.value ? formatTimestamp(lastUpdateAt.value) : 'waiting for first event',
);

const websocketUrl = buildWebSocketUrl();

function buildWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/task-queue`;
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'processing' || value === 'running' || value === 'in_progress') return 'processing';
  if (value === 'completed' || value === 'done' || value === 'success') return 'completed';
  return 'pending';
}

function normalizeTask(raw) {
  const now = Date.now();
  return {
    id: raw.id || raw.taskId || `task-${Math.random().toString(36).slice(2, 10)}`,
    title: raw.title || raw.name || 'Untitled task',
    queue: raw.queue || raw.channel || 'default',
    status: normalizeStatus(raw.status),
    agent: raw.agent || raw.agentName || raw.worker || '',
    updatedAt: Number(new Date(raw.updatedAt || raw.timestamp || now)),
  };
}

function compareTasks(a, b, key, direction) {
  const sign = direction === 'asc' ? 1 : -1;

  if (key === 'status') {
    const left = statusOrder[normalizeStatus(a.status)] || 99;
    const right = statusOrder[normalizeStatus(b.status)] || 99;
    return (left - right) * sign;
  }

  if (key === 'agent') {
    return a.agent.localeCompare(b.agent) * sign;
  }

  return (a.updatedAt - b.updatedAt) * sign;
}

function changeSort(key) {
  if (sortBy.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortBy.value = key;
  sortDirection.value = 'asc';
}

function upsertTask(rawTask) {
  const normalized = normalizeTask(rawTask);
  const index = tasks.value.findIndex((task) => task.id === normalized.id);

  if (index === -1) {
    tasks.value.unshift(normalized);
  } else {
    tasks.value[index] = { ...tasks.value[index], ...normalized };
  }

  lastUpdateAt.value = Date.now();
}

function hydrateTasks(rawTasks) {
  if (!Array.isArray(rawTasks)) return;
  tasks.value = rawTasks.map(normalizeTask);
  lastUpdateAt.value = Date.now();
}

function handleMessage(event) {
  try {
    const payload = JSON.parse(event.data);

    if (payload.type === 'snapshot') {
      hydrateTasks(payload.tasks);
      return;
    }

    if (payload.type === 'task' && payload.task) {
      upsertTask(payload.task);
      return;
    }

    if (payload.type === 'batch' && Array.isArray(payload.tasks)) {
      payload.tasks.forEach(upsertTask);
      return;
    }
  } catch (error) {
    connectionState.value = 'error';
  }
}

function connect() {
  if (socket) {
    socket.close();
    socket = null;
  }

  connectionState.value = 'connecting';
  socket = new WebSocket(websocketUrl);

  socket.addEventListener('open', () => {
    connectionState.value = 'open';
  });

  socket.addEventListener('message', handleMessage);

  socket.addEventListener('close', () => {
    connectionState.value = 'error';
    reconnectTimer = window.setTimeout(connect, 2000);
  });

  socket.addEventListener('error', () => {
    connectionState.value = 'error';
  });
}

function statusClass(status) {
  return `is-${normalizeStatus(status)}`;
}

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString('de-DE', {
    hour12: false,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

onMounted(() => {
  connect();
});

onBeforeUnmount(() => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  if (socket) {
    socket.close();
  }
});
</script>

<style scoped>
.task-monitor-page {
  min-height: 100vh;
  background: radial-gradient(circle at top left, #1d2a43 0%, #0d1119 45%, #07090d 100%);
  color: #e7edf9;
  padding: 2rem;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8ca8d6;
  margin: 0;
}

h1 {
  margin: 0.2rem 0 0;
  font-size: 1.8rem;
}

.connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  font-size: 0.85rem;
  border: 1px solid transparent;
}

.connection-pill .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
}

.state-open {
  color: #7ef1b3;
  background: #102a1f;
  border-color: #2b7d59;
}

.state-connecting {
  color: #ffd985;
  background: #30240f;
  border-color: #8b6c2f;
}

.state-error {
  color: #ff9e9e;
  background: #311616;
  border-color: #8d3d3d;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.stat-card {
  border-radius: 12px;
  padding: 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-card .label {
  margin: 0;
  font-size: 0.8rem;
  color: #9cb1d5;
}

.stat-card .value {
  margin: 0.5rem 0 0;
  font-weight: 700;
  font-size: 1.4rem;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.9rem;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.sort-button {
  background: #121a27;
  color: #d8e4fb;
  border: 1px solid #2f425f;
  border-radius: 8px;
  padding: 0.46rem 0.7rem;
  cursor: pointer;
}

.sort-button.active {
  border-color: #67b3ff;
  box-shadow: 0 0 0 1px #67b3ff66;
}

.sort-indicator {
  display: inline-block;
  width: 1rem;
  text-align: center;
}

.last-update {
  margin: 0;
  color: #a6b9da;
  font-size: 0.85rem;
}

.table-wrap {
  border: 1px solid #2d3e58;
  border-radius: 12px;
  overflow: auto;
  background: rgba(9, 14, 22, 0.86);
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 780px;
}

.task-table th,
.task-table td {
  padding: 0.72rem 0.8rem;
  border-bottom: 1px solid #1d2a3d;
  text-align: left;
}

.task-table th {
  color: #9eb4da;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(255, 255, 255, 0.02);
}

.task-title {
  margin: 0;
  font-weight: 600;
}

.task-sub {
  margin: 0.2rem 0 0;
  color: #8ea8d1;
  font-size: 0.82rem;
}

.status-chip {
  display: inline-block;
  font-size: 0.74rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.status-chip.is-pending {
  background: #3e320f;
  color: #ffdf91;
}

.status-chip.is-processing {
  background: #0f2d46;
  color: #8acfff;
}

.status-chip.is-completed {
  background: #163321;
  color: #8cf2b0;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.empty-state {
  text-align: center;
  color: #8da6ce;
  padding: 1.4rem;
}

@media (max-width: 720px) {
  .task-monitor-page {
    padding: 1rem;
  }

  h1 {
    font-size: 1.45rem;
  }

  .connection-pill {
    font-size: 0.78rem;
  }
}
</style>
