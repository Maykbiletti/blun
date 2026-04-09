/**
 * Form Validator Component
 * Real-time validation, error display, field highlighting
 * Features: multiple validators, custom rules, debouncing, field grouping, accessibility
 */

class FormValidator {
  constructor(options = {}) {
    this.options = {
      selector: options.selector || null, // CSS selector or form element
      debounceDelay: options.debounceDelay || 300,
      showErrorsOnBlur: options.showErrorsOnBlur !== false, // default: true
      showErrorsOnChange: options.showErrorsOnChange !== false, // default: true
      validateOnSubmit: options.validateOnSubmit !== false, // default: true
      highlightErrors: options.highlightErrors !== false, // default: true
      onValidate: options.onValidate || null,
      onFieldValidate: options.onFieldValidate || null,
      customMessages: options.customMessages || {},
      ...options
    };

    this.form = null;
    this.fields = new Map(); // fieldName -> { element, rules, errors, debounceTimer }
    this.rules = {
      required: (value) => value && value.trim().length > 0,
      email: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      minLength: (value, len) => !value || value.length >= len,
      maxLength: (value, len) => !value || value.length <= len,
      pattern: (value, pattern) => !value || new RegExp(pattern).test(value),
      match: (value, otherFieldName) => {
        const otherField = this.fields.get(otherFieldName);
        return !otherField || otherField.element.value === value;
      },
      custom: (value, validator) => {
        if (typeof validator === 'function') {
          return validator(value);
        }
        return true;
      }
    };

    this.defaultMessages = {
      required: 'Dieses Feld ist erforderlich',
      email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
      minLength: 'Mindestens {0} Zeichen erforderlich',
      maxLength: 'Maximal {0} Zeichen erlaubt',
      pattern: 'Ungültiges Format',
      match: 'Werte stimmen nicht überein',
      custom: 'Validierung fehlgeschlagen'
    };

    this.isValid = true;
    this.fieldErrors = new Map(); // fieldName -> [errors]

    this.init();
  }

  init() {
    if (typeof this.options.selector === 'string') {
      this.form = document.querySelector(this.options.selector);
    } else {
      this.form = this.options.selector;
    }

    if (!this.form) {
      console.error('Form not found:', this.options.selector);
      return;
    }

    // Scan for fields with data-validate attribute
    const fieldsToValidate = this.form.querySelectorAll('[data-validate]');
    fieldsToValidate.forEach((field) => {
      this.addField(field.name || field.id, field, this.parseValidators(field));
    });

    // Attach form submit listener
    if (this.options.validateOnSubmit) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  addField(fieldName, element, validators = []) {
    if (!fieldName || !element) {
      console.warn('Invalid field configuration', fieldName, element);
      return;
    }

    const fieldConfig = {
      element,
      validators,
      errors: [],
      debounceTimer: null,
      isDirty: false,
      isTouched: false
    };

    this.fields.set(fieldName, fieldConfig);

    // Attach event listeners
    if (this.options.showErrorsOnChange) {
      element.addEventListener('input', (e) => this.handleFieldChange(fieldName, e));
    }

    if (this.options.showErrorsOnBlur) {
      element.addEventListener('blur', (e) => this.handleFieldBlur(fieldName, e));
    }

    // Set initial aria attributes
    element.setAttribute('aria-invalid', 'false');
    element.setAttribute('aria-describedby', `error-${fieldName}`);
  }

  parseValidators(element) {
    const validateAttr = element.getAttribute('data-validate') || '';
    const validators = [];

    // Parse data-validate attribute: "required|email|minLength:8"
    const rules = validateAttr.split('|');

    rules.forEach((rule) => {
      const [type, ...params] = rule.split(':');

      if (type === 'required') {
        validators.push({ type: 'required', message: this.getMessage('required') });
      } else if (type === 'email') {
        validators.push({ type: 'email', message: this.getMessage('email') });
      } else if (type === 'minLength' && params[0]) {
        const len = parseInt(params[0], 10);
        validators.push({
          type: 'minLength',
          value: len,
          message: this.getMessage('minLength').replace('{0}', len)
        });
      } else if (type === 'maxLength' && params[0]) {
        const len = parseInt(params[0], 10);
        validators.push({
          type: 'maxLength',
          value: len,
          message: this.getMessage('maxLength').replace('{0}', len)
        });
      } else if (type === 'pattern' && params[0]) {
        validators.push({
          type: 'pattern',
          value: params.join(':'), // handle patterns with colons
          message: this.getMessage('pattern')
        });
      } else if (type === 'match' && params[0]) {
        validators.push({
          type: 'match',
          value: params[0],
          message: this.getMessage('match')
        });
      }

      // Check for custom data attributes
      if (element.hasAttribute(`data-${type}-message`)) {
        validators[validators.length - 1].message = element.getAttribute(`data-${type}-message`);
      }
    });

    return validators;
  }

  handleFieldChange(fieldName, event) {
    const fieldConfig = this.fields.get(fieldName);
    if (!fieldConfig) return;

    fieldConfig.isDirty = true;

    // Debounce validation
    clearTimeout(fieldConfig.debounceTimer);
    fieldConfig.debounceTimer = setTimeout(() => {
      this.validateField(fieldName);
    }, this.options.debounceDelay);
  }

  handleFieldBlur(fieldName, event) {
    const fieldConfig = this.fields.get(fieldName);
    if (!fieldConfig) return;

    fieldConfig.isTouched = true;
    this.validateField(fieldName);
  }

  handleSubmit(event) {
    if (!this.validateForm()) {
      event.preventDefault();
      this.showAllErrors();
    }
  }

  validateField(fieldName) {
    const fieldConfig = this.fields.get(fieldName);
    if (!fieldConfig) return;

    const { element, validators } = fieldConfig;
    const value = element.value;
    const errors = [];

    // Run all validators
    validators.forEach((validator) => {
      let isValid = false;

      if (validator.type === 'required') {
        isValid = this.rules.required(value);
      } else if (validator.type === 'email') {
        isValid = this.rules.email(value);
      } else if (validator.type === 'minLength') {
        isValid = this.rules.minLength(value, validator.value);
      } else if (validator.type === 'maxLength') {
        isValid = this.rules.maxLength(value, validator.value);
      } else if (validator.type === 'pattern') {
        isValid = this.rules.pattern(value, validator.value);
      } else if (validator.type === 'match') {
        isValid = this.rules.match(value, validator.value);
      } else if (validator.type === 'custom') {
        isValid = this.rules.custom(value, validator.value);
      }

      if (!isValid) {
        errors.push(validator.message);
      }
    });

    // Update field state
    fieldConfig.errors = errors;
    this.fieldErrors.set(fieldName, errors);

    // Update UI
    this.updateFieldDisplay(fieldName, errors);

    // Fire callback
    if (this.options.onFieldValidate) {
      this.options.onFieldValidate({
        fieldName,
        isValid: errors.length === 0,
        errors,
        isDirty: fieldConfig.isDirty,
        isTouched: fieldConfig.isTouched
      });
    }

    return errors.length === 0;
  }

  updateFieldDisplay(fieldName, errors) {
    const fieldConfig = this.fields.get(fieldName);
    if (!fieldConfig) return;

    const { element } = fieldConfig;
    const errorElement = this.getOrCreateErrorElement(fieldName);
    const hasErrors = errors.length > 0;

    // Update aria attributes
    element.setAttribute('aria-invalid', hasErrors ? 'true' : 'false');

    if (hasErrors && fieldConfig.isTouched) {
      // Show errors
      errorElement.textContent = errors.join(', ');
      errorElement.classList.add('show');

      if (this.options.highlightErrors) {
        element.classList.add('field-error');
      }
    } else {
      // Hide errors
      errorElement.classList.remove('show');

      if (this.options.highlightErrors) {
        element.classList.remove('field-error');
      }
    }
  }

  getOrCreateErrorElement(fieldName) {
    let errorElement = document.getElementById(`error-${fieldName}`);

    if (!errorElement) {
      const fieldConfig = this.fields.get(fieldName);
      const { element } = fieldConfig;

      errorElement = document.createElement('div');
      errorElement.id = `error-${fieldName}`;
      errorElement.className = 'field-error-message';
      errorElement.setAttribute('role', 'alert');
      errorElement.setAttribute('aria-live', 'polite');

      // Insert after field
      element.parentNode.insertBefore(errorElement, element.nextSibling);
    }

    return errorElement;
  }

  validateForm() {
    let formIsValid = true;

    this.fields.forEach((fieldConfig, fieldName) => {
      fieldConfig.isTouched = true;
      const isFieldValid = this.validateField(fieldName);
      if (!isFieldValid) {
        formIsValid = false;
      }
    });

    this.isValid = formIsValid;

    if (this.options.onValidate) {
      this.options.onValidate({
        isValid: formIsValid,
        errors: Object.fromEntries(this.fieldErrors),
        values: this.getFormValues()
      });
    }

    return formIsValid;
  }

  showAllErrors() {
    this.fields.forEach((fieldConfig, fieldName) => {
      fieldConfig.isTouched = true;
      this.updateFieldDisplay(fieldName, fieldConfig.errors);
    });
  }

  getFormValues() {
    const values = {};
    this.fields.forEach((fieldConfig, fieldName) => {
      values[fieldName] = fieldConfig.element.value;
    });
    return values;
  }

  getFieldValue(fieldName) {
    const fieldConfig = this.fields.get(fieldName);
    return fieldConfig ? fieldConfig.element.value : null;
  }

  setFieldValue(fieldName, value) {
    const fieldConfig = this.fields.get(fieldName);
    if (fieldConfig) {
      fieldConfig.element.value = value;
      fieldConfig.isDirty = true;
      this.validateField(fieldName);
    }
  }

  addCustomRule(fieldName, rule) {
    const fieldConfig = this.fields.get(fieldName);
    if (fieldConfig) {
      fieldConfig.validators.push({
        type: 'custom',
        value: rule.validator,
        message: rule.message || 'Validierung fehlgeschlagen'
      });
    }
  }

  getErrors(fieldName = null) {
    if (fieldName) {
      return this.fieldErrors.get(fieldName) || [];
    }
    return Object.fromEntries(this.fieldErrors);
  }

  hasErrors(fieldName = null) {
    if (fieldName) {
      const errors = this.fieldErrors.get(fieldName) || [];
      return errors.length > 0;
    }
    return Array.from(this.fieldErrors.values()).some((errors) => errors.length > 0);
  }

  reset() {
    this.fields.forEach((fieldConfig, fieldName) => {
      fieldConfig.element.value = '';
      fieldConfig.errors = [];
      fieldConfig.isDirty = false;
      fieldConfig.isTouched = false;
      fieldConfig.element.classList.remove('field-error');

      const errorElement = document.getElementById(`error-${fieldName}`);
      if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
      }
    });

    this.fieldErrors.clear();
    this.isValid = true;
  }

  destroy() {
    this.fields.forEach((fieldConfig) => {
      clearTimeout(fieldConfig.debounceTimer);
    });
    this.fields.clear();
    this.fieldErrors.clear();
  }

  getMessage(type) {
    return this.options.customMessages[type] || this.defaultMessages[type] || '';
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormValidator;
}
