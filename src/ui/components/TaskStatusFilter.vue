<template>
  <fieldset class="task-status-filter" :disabled="disabled">
    <legend class="task-status-filter__legend">Status</legend>

    <label
      v-for="option in statusOptions"
      :key="option.value"
      class="task-status-filter__option"
    >
      <input
        class="task-status-filter__checkbox"
        type="checkbox"
        :value="option.value"
        :checked="isSelected(option.value)"
        @change="onToggle(option.value, $event)"
      />
      <span class="task-status-filter__label">{{ option.label }}</span>
    </label>
  </fieldset>
</template>

<script setup>
import { computed } from 'vue'

const STATUS_VALUES = ['pending', 'processing', 'completed', 'failed']

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  },
  labels: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const defaultLabels = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed'
}

const normalizedValue = computed(() => {
  if (!Array.isArray(props.modelValue)) {
    return []
  }

  return STATUS_VALUES.filter((status) => props.modelValue.includes(status))
})

const statusOptions = computed(() => {
  return STATUS_VALUES.map((value) => ({
    value,
    label: props.labels[value] || defaultLabels[value]
  }))
})

function isSelected(status) {
  return normalizedValue.value.includes(status)
}

function onToggle(status, event) {
  const selected = new Set(normalizedValue.value)

  if (event.target.checked) {
    selected.add(status)
  } else {
    selected.delete(status)
  }

  const next = STATUS_VALUES.filter((value) => selected.has(value))

  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style scoped>
.task-status-filter {
  border: 0;
  margin: 0;
  padding: 0;
  min-inline-size: 0;
  display: grid;
  gap: 0.5rem;
}

.task-status-filter__legend {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.task-status-filter__option {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.task-status-filter__checkbox {
  margin: 0;
}

.task-status-filter__label {
  line-height: 1.2;
}
</style>
