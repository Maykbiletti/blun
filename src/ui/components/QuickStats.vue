<template>
  <section class="quick-stats" aria-label="Quick stats dashboard">
    <header class="quick-stats__header">
      <h2 class="quick-stats__title">Quick Stats</h2>
      <div class="quick-stats__status" :class="connectionClass">
        <span class="quick-stats__dot" aria-hidden="true"></span>
        <span>{{ connectionLabel }}</span>
      </div>
    </header>

    <div class="quick-stats__grid">
      <article class="quick-stats__card">
        <p class="quick-stats__label">Pending Tasks</p>
        <p class="quick-stats__value">{{ formatNumber(stats.pendingTasks) }}</p>
      </article>

      <article class="quick-stats__card">
        <p class="quick-stats__label">Processing</p>
        <p class="quick-stats__value">{{ formatNumber(stats.processing) }}</p>
      </article>

      <article class="quick-stats__card">
        <p class="quick-stats__label">Completed Today</p>
        <p class="quick-stats__value">{{ formatNumber(stats.completedToday) }}</p>
      </article>

      <article class="quick-stats__card">
        <p class="quick-stats__label">Avg Duration</p>
        <p class="quick-stats__value">{{ formatDuration(stats.avgDurationSeconds) }}</p>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const stats = ref({
  pendingTasks: 0,
  processing: 0,
  completedToday: 0,
  avgDurationSeconds: 0
});

const isConnected = ref(false);
const hasConnectionError = ref(false);
let ws;
let reconnectTimer;
let refreshTimer;

const REFRESH_INTERVAL_MS = 10000;

const connectionClass = computed(() => {
  if (isConnected.value) return 'quick-stats__status--online';
  if (hasConnectionError.value) return 'quick-stats__status--error';
  return 'quick-stats__status--offline';
});

const connectionLabel = computed(() => {
  if (isConnected.value) return 'Live';
  if (hasConnectionError.value) return 'Reconnecting';
  return 'Offline';
});

const wsUrl = computed(() => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/quick-stats`;
});

function parsePayload(raw) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    pendingTasks: Number(payload.pendingTasks ?? 0),
    processing: Number(payload.processing ?? 0),
    completedToday: Number(payload.completedToday ?? 0),
    avgDurationSeconds: Number(payload.avgDurationSeconds ?? 0)
  };
}

function applyPayload(payload) {
  stats.value = parsePayload(payload);
}

function safeCloseSocket() {
  if (ws && ws.readyState <= 1) {
    ws.close();
  }
  ws = undefined;
}

function connectWebSocket() {
  safeCloseSocket();
  ws = new WebSocket(wsUrl.value);

  ws.onopen = () => {
    isConnected.value = true;
    hasConnectionError.value = false;
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'quick-stats') {
        applyPayload(message.data ?? message);
      }
      if (message.type === 'quick-stats-refresh-request') {
        ws.send(JSON.stringify({ type: 'quick-stats-refresh' }));
      }
    } catch {
      hasConnectionError.value = true;
    }
  };

  ws.onerror = () => {
    hasConnectionError.value = true;
  };

  ws.onclose = () => {
    isConnected.value = false;
    hasConnectionError.value = true;
    reconnectTimer = window.setTimeout(connectWebSocket, 2000);
  };
}

function startRefreshLoop() {
  refreshTimer = window.setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'quick-stats-refresh' }));
    }
  }, REFRESH_INTERVAL_MS);
}

function stopTimers() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remainingSeconds = Math.round(total % 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

onMounted(() => {
  connectWebSocket();
  startRefreshLoop();
});

onBeforeUnmount(() => {
  stopTimers();
  safeCloseSocket();
});
</script>

<style scoped>
:root {
  --blun-bg-main: #0a0f17;
  --blun-bg-card: #121b2a;
  --blun-bg-card-alt: #1a2537;
  --blun-border: #26344d;
  --blun-text-primary: #e7edf8;
  --blun-text-muted: #93a3bf;
  --blun-accent: #35d3ff;
  --blun-success: #2cd38c;
  --blun-warning: #ffc857;
  --blun-danger: #ff5d73;
}

.quick-stats {
  width: 100%;
  background: radial-gradient(circle at 20% 0%, #15233b 0%, var(--blun-bg-main) 52%, #080d15 100%);
  border: 1px solid var(--blun-border);
  border-radius: 16px;
  padding: 20px;
  color: var(--blun-text-primary);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32);
}

.quick-stats__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.quick-stats__title {
  margin: 0;
  font-size: 1.1rem;
  letter-spacing: 0.02em;
  font-weight: 600;
}

.quick-stats__status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  padding: 6px 10px;
  border: 1px solid var(--blun-border);
  border-radius: 999px;
  background-color: rgba(19, 29, 46, 0.78);
  color: var(--blun-text-muted);
}

.quick-stats__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--blun-warning);
  box-shadow: 0 0 10px rgba(255, 200, 87, 0.5);
}

.quick-stats__status--online {
  color: var(--blun-success);
  border-color: rgba(44, 211, 140, 0.4);
}

.quick-stats__status--online .quick-stats__dot {
  background: var(--blun-success);
  box-shadow: 0 0 12px rgba(44, 211, 140, 0.65);
}

.quick-stats__status--error {
  color: var(--blun-danger);
  border-color: rgba(255, 93, 115, 0.45);
}

.quick-stats__status--error .quick-stats__dot {
  background: var(--blun-danger);
  box-shadow: 0 0 12px rgba(255, 93, 115, 0.5);
}

.quick-stats__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quick-stats__card {
  background: linear-gradient(160deg, var(--blun-bg-card) 0%, var(--blun-bg-card-alt) 100%);
  border: 1px solid var(--blun-border);
  border-radius: 12px;
  padding: 14px;
}

.quick-stats__label {
  margin: 0;
  color: var(--blun-text-muted);
  font-size: 0.82rem;
  line-height: 1.2;
}

.quick-stats__value {
  margin: 10px 0 0;
  font-size: clamp(1.2rem, 2vw, 1.6rem);
  font-weight: 700;
  line-height: 1.1;
  color: var(--blun-accent);
}

@media (max-width: 1100px) {
  .quick-stats__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .quick-stats {
    padding: 14px;
  }

  .quick-stats__header {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .quick-stats__grid {
    grid-template-columns: 1fr;
  }

  .quick-stats__card {
    padding: 12px;
  }
}
</style>
