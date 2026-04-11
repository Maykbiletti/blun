<template>
  <article class="agent-card" :class="`is-${normalizedStatus}`" :aria-label="`Agent ${name} ist ${normalizedStatus}`">
    <header class="agent-card__header">
      <span class="agent-card__status" :title="statusLabel" aria-hidden="true">
        <span class="agent-card__dot"></span>
      </span>
      <h3 class="agent-card__name">{{ name }}</h3>
    </header>

    <p class="agent-card__meta">
      <span class="agent-card__meta-label">Task</span>
      <span class="agent-card__task-id">{{ taskIdText }}</span>
    </p>
  </article>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'idle',
    validator: (value) => ['online', 'busy', 'idle'].includes(String(value).toLowerCase()),
  },
  taskId: {
    type: [String, Number],
    default: null,
  },
});

const normalizedStatus = computed(() => String(props.status || 'idle').toLowerCase());

const statusLabel = computed(() => {
  if (normalizedStatus.value === 'online') return 'Online';
  if (normalizedStatus.value === 'busy') return 'Beschaeftigt';
  return 'Idle';
});

const taskIdText = computed(() => {
  if (props.taskId === null || props.taskId === undefined || props.taskId === '') {
    return 'keine aktive Task';
  }
  return String(props.taskId);
});
</script>

<style scoped>
.agent-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  border: 1px solid #d9dee8;
  border-radius: 10px;
  background: #ffffff;
}

.agent-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.agent-card__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
}

.agent-card__dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 999px;
  background: #9ca3af;
}

.agent-card__name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #1f2937;
}

.agent-card__meta {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.agent-card__meta-label {
  color: #6b7280;
}

.agent-card__task-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  color: #111827;
}

.agent-card.is-online .agent-card__dot {
  background: #16a34a;
}

.agent-card.is-busy .agent-card__dot {
  background: #ea580c;
}

.agent-card.is-idle .agent-card__dot {
  background: #9ca3af;
}
</style>
