const SENSITIVE_KEY = /(?:api[_-]?key|authorization|credential|password|secret|session|token)/iu;

export const REDACTED_VALUE = "[REDACTED]";

export const redactSensitiveValues = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED_VALUE : redactSensitiveValues(nestedValue),
      ]),
    );
  }

  return value;
};
