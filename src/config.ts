/**
 * Configuration loaded from environment variables.
 * All secrets and environment-specific values live here — never hardcoded in business logic.
 */

import { z } from "zod";

const configSchema = z.object({
  // UPS OAuth (required for live API calls)
  UPS_CLIENT_ID: z.string().min(1, "UPS_CLIENT_ID is required"),
  UPS_CLIENT_SECRET: z.string().min(1, "UPS_CLIENT_SECRET is required"),
  UPS_BASE_URL: z.string().url().default("https://wwwcie.ups.com"),
  UPS_OAUTH_TOKEN_URL: z.string().url().optional(),

  // Optional
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  HTTP_TIMEOUT_RATE_MS: z.coerce.number().int().positive().default(15_000),
  TRANSACTION_SOURCE: z.string().max(512).default("cybership"),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate config from process.env.
 * In production you might use a dedicated config module (e.g. dotenv + validation at startup).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = {
    UPS_CLIENT_ID: env.UPS_CLIENT_ID ?? "",
    UPS_CLIENT_SECRET: env.UPS_CLIENT_SECRET ?? "",
    UPS_BASE_URL: env.UPS_BASE_URL ?? "https://wwwcie.ups.com",
    UPS_OAUTH_TOKEN_URL: env.UPS_OAUTH_TOKEN_URL,
    HTTP_TIMEOUT_MS: env.HTTP_TIMEOUT_MS,
    HTTP_TIMEOUT_RATE_MS: env.HTTP_TIMEOUT_RATE_MS,
    TRANSACTION_SOURCE: env.TRANSACTION_SOURCE,
  };
  return configSchema.parse(raw);
}

/**
 * For tests: allow partial config so we can stub without real credentials.
 */
const partialConfigSchema = configSchema.partial().extend({
  UPS_CLIENT_ID: z.string().optional(),
  UPS_CLIENT_SECRET: z.string().optional(),
});
export type PartialConfig = z.infer<typeof partialConfigSchema>;

export function loadConfigForTest(env: NodeJS.ProcessEnv = process.env): PartialConfig {
  const raw = {
    UPS_CLIENT_ID: env.UPS_CLIENT_ID,
    UPS_CLIENT_SECRET: env.UPS_CLIENT_SECRET,
    UPS_BASE_URL: env.UPS_BASE_URL ?? "https://wwwcie.ups.com",
    UPS_OAUTH_TOKEN_URL: env.UPS_OAUTH_TOKEN_URL,
    HTTP_TIMEOUT_MS: env.HTTP_TIMEOUT_MS,
    HTTP_TIMEOUT_RATE_MS: env.HTTP_TIMEOUT_RATE_MS,
    TRANSACTION_SOURCE: env.TRANSACTION_SOURCE,
  };
  return partialConfigSchema.parse(raw);
}
