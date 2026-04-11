<template>
  <div class="task-progress" role="progressbar" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="progressValue" :aria-label="ariaLabel">
    <div class="task-progress__track">
      <Transition name="bar-fill" mode="out-in">
        <div
          :key="normalizedStatus"
          class="task-progress__fill"
          :class="`task-progress__fill--${normalizedStatus}`"
          :style="fillStyle"
        />
      </Transition>
      <div
        v-if="normalizedStatus === 'processing'"
        class="task-progress__shine"
        aria-hidden="true"
      />
    </div>

    <Transition name="status-fade" mode="out-in">
      <span :key="normalizedStatus" class="task-progress__label">
        {{ statusLabel }}
      </span>
    </Transition>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: {
    type: String,
    required: true,
    validator: (value) => ['pending', 'processing', 'completed'].includes(value),
  },
  pendingValue: {
    type: Number,
    default: 8,
  },
  processingValue: {
    type: Number,
    default: 58,
  },
  completedValue: {
    type: Number,
    default: 100,
  },
  labels: {
    type: Object,
    default: () => ({
      pending: 'Pending',
      processing: 'Processing',
      completed: 'Completed',
    }),
  },
  ariaLabel: {
    type: String,
    default: 'Task progress',
  },
});

const normalizedStatus = computed(() => {
  if (['pending', 'processing', 'completed'].includes(props.status)) {
    return props.status;
  }

  return 'pending';
});

const progressValue = computed(() => {
  if (normalizedStatus.value === 'completed') {
    return clamp(props.completedValue);
  }

  if (normalizedStatus.value === 'processing') {
    return clamp(props.processingValue);
  }

  return clamp(props.pendingValue);
});

const statusLabel = computed(() => {
  return props.labels[normalizedStatus.value] || normalizedStatus.value;
});

const fillStyle = computed(() => ({
  width: `${progressValue.value}%`,
}));

function clamp(value) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Number(value)));
}
</script>

<style scoped>
.task-progress {
  display: grid;
  gap: 0.5rem;
  width: 100%;
}

.task-progress__track {
  position: relative;
  height: 0.75rem;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.task-progress__fill {
  height: 100%;
  border-radius: inherit;
  transition: width 340ms cubic-bezier(0.25, 0.9, 0.35, 1);
}

.task-progress__fill--pending {
  background: linear-gradient(90deg, #9ca3af 0%, #d1d5db 100%);
}

.task-progress__fill--processing {
  background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
}

.task-progress__fill--completed {
  background: linear-gradient(90deg, #16a34a 0%, #4ade80 100%);
}

.task-progress__shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.38) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: translateX(-120%);
  animation: task-progress-shine 1.2s ease-in-out infinite;
  pointer-events: none;
}

.task-progress__label {
  font-size: 0.78rem;
  line-height: 1;
  font-weight: 600;
  color: #374151;
}

.bar-fill-enter-active,
.bar-fill-leave-active {
  transition: opacity 200ms ease;
}

.bar-fill-enter-from,
.bar-fill-leave-to {
  opacity: 0.65;
}

.status-fade-enter-active,
.status-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(2px);
}

@keyframes task-progress-shine {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(120%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-progress__fill,
  .bar-fill-enter-active,
  .bar-fill-leave-active,
  .status-fade-enter-active,
  .status-fade-leave-active {
    transition: none;
  }

  .task-progress__shine {
    animation: none;
  }
}
</style>
