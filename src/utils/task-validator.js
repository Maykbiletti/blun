"use strict";

const TASK_SCHEMA = {
  type: "object",
  required: ["title", "description"],
  additionalProperties: false,
  properties: {
    id: { type: ["string", "number"] },
    title: { type: "string", minLength: 3, maxLength: 160 },
    description: { type: "string", minLength: 3, maxLength: 8000 },
    status: { type: "string", enum: ["pending", "in_progress", "processing", "done", "failed", "cancelled"] },
    priority: { type: "integer", minimum: 0, maximum: 5 },
    agentId: { type: ["string", "number"] },
    companyId: { type: ["string", "number"] },
    department: { type: "string", minLength: 2, maxLength: 120 },
    tags: {
      type: "array",
      minItems: 0,
      maxItems: 30,
      items: { type: "string", minLength: 1, maxLength: 40 }
    },
    metadata: { type: "object", additionalProperties: true },
    parentTaskId: { type: ["string", "number", "null"] },
    dueDate: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    subtasks: {
      type: "array",
      minItems: 0,
      maxItems: 200,
      items: {
        type: "object",
        required: ["title"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 160 },
          done: { type: "boolean" }
        }
      }
    }
  }
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const normalized = date.toISOString();
  return normalized === value || value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
}

function normalizeTypes(type) {
  return Array.isArray(type) ? type : [type];
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return isPlainObject(value);
  return typeof value === type;
}

function validatePrimitiveRules(value, fieldSchema, path, errors) {
  if (typeof value === "string") {
    if (typeof fieldSchema.minLength === "number" && value.length < fieldSchema.minLength) {
      errors.push(`${path} must have at least ${fieldSchema.minLength} characters`);
    }
    if (typeof fieldSchema.maxLength === "number" && value.length > fieldSchema.maxLength) {
      errors.push(`${path} must have at most ${fieldSchema.maxLength} characters`);
    }
    if (fieldSchema.format === "date-time" && !isIsoDateTime(value)) {
      errors.push(`${path} must be a valid ISO date-time string`);
    }
  }

  if (typeof value === "number") {
    if (typeof fieldSchema.minimum === "number" && value < fieldSchema.minimum) {
      errors.push(`${path} must be >= ${fieldSchema.minimum}`);
    }
    if (typeof fieldSchema.maximum === "number" && value > fieldSchema.maximum) {
      errors.push(`${path} must be <= ${fieldSchema.maximum}`);
    }
  }

  if (Array.isArray(fieldSchema.enum) && !fieldSchema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${fieldSchema.enum.join(", ")}`);
  }
}

function validateArrayRules(value, fieldSchema, path, errors) {
  if (!Array.isArray(value)) return;

  if (typeof fieldSchema.minItems === "number" && value.length < fieldSchema.minItems) {
    errors.push(`${path} must contain at least ${fieldSchema.minItems} item(s)`);
  }
  if (typeof fieldSchema.maxItems === "number" && value.length > fieldSchema.maxItems) {
    errors.push(`${path} must contain at most ${fieldSchema.maxItems} item(s)`);
  }

  if (!fieldSchema.items) return;

  for (let i = 0; i < value.length; i += 1) {
    validateBySchema(value[i], fieldSchema.items, `${path}[${i}]`, errors);
  }
}

function validateObjectRules(value, fieldSchema, path, errors) {
  if (!isPlainObject(value)) return;

  const required = Array.isArray(fieldSchema.required) ? fieldSchema.required : [];
  for (const reqKey of required) {
    if (!(reqKey in value)) {
      errors.push(`${path}.${reqKey} is required`);
    }
  }

  if (fieldSchema.additionalProperties === false && fieldSchema.properties) {
    const allowed = new Set(Object.keys(fieldSchema.properties));
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  const properties = fieldSchema.properties || {};
  for (const [key, propSchema] of Object.entries(properties)) {
    if (key in value) {
      validateBySchema(value[key], propSchema, `${path}.${key}`, errors);
    }
  }
}

function validateBySchema(value, schema, path, errors) {
  const acceptedTypes = normalizeTypes(schema.type);
  const validType = acceptedTypes.some((type) => matchesType(value, type));

  if (!validType) {
    errors.push(`${path} must be of type: ${acceptedTypes.join(" | ")}`);
    return;
  }

  validatePrimitiveRules(value, schema, path, errors);
  validateArrayRules(value, schema, path, errors);
  validateObjectRules(value, schema, path, errors);
}

function validateTask(task) {
  const errors = [];
  validateBySchema(task, TASK_SCHEMA, "task", errors);
  return {
    valid: errors.length === 0,
    errors
  };
}

function assertValidTask(task) {
  const result = validateTask(task);
  if (!result.valid) {
    const err = new Error(`Task validation failed: ${result.errors.join("; ")}`);
    err.code = "TASK_VALIDATION_ERROR";
    err.details = result.errors;
    throw err;
  }
  return task;
}

module.exports = {
  TASK_SCHEMA,
  validateTask,
  assertValidTask
};
