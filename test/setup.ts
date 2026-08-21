import "@testing-library/jest-dom/vitest";

process.env.APP_BASE_URL = "http://localhost:3000";
process.env.AUTH_RATE_LIMIT_PEPPER = "synthetic-test-rate-limit-pepper-32-characters";
process.env.AI_CREDENTIAL_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.AI_CREDENTIAL_MASTER_KEY_VERSION = "1";
