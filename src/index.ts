/**
 * Cybership Carrier Integration Service
 *
 * Public API: domain types, service factory, and errors.
 * Carrier adapters (UPS, future FedEx, etc.) are wired via configuration.
 */

export * from "./domain/index.js";
export * from "./carriers/types.js";
export { CarrierService } from "./service/carrier-service.js";
export type { CarrierServiceConfig } from "./service/carrier-service.js";
export { createUpsAdapter } from "./ups/adapter.js";
export type { UpsAdapterConfig } from "./ups/adapter.js";
export { FetchHttpClient } from "./http/client.js";
export type { IHttpClient, HttpRequest, HttpResponse } from "./http/client.js";
export { loadConfig } from "./config.js";
export type { Config } from "./config.js";
