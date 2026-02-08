/**
 * Carrier integration service facade: validates input, delegates to carrier adapters,
 * returns normalized results. Callers never see carrier-specific types or raw API shapes.
 */

import type { RateResponse } from "../domain/types.js";
import { parseRateRequest, validationError } from "../domain/index.js";
import type { CarrierAdapter } from "../carriers/types.js";
import type { CarrierResult } from "../carriers/types.js";

export interface CarrierServiceConfig {
  /** Registered adapters by carrier id (e.g. { ups: upsAdapter }) */
  carriers: Map<string, CarrierAdapter>;
  /** Which carrier(s) to use for rate requests when not specified (default: all) */
  defaultCarrierIds?: string[];
}

/**
 * Service that routes rate requests to one or more carriers and returns normalized quotes.
 */
export class CarrierService {
  constructor(private readonly config: CarrierServiceConfig) {}

  /**
   * Get rates from the specified carrier (or default carriers).
   * Validates request before any external call. Returns structured errors on failure.
   */
  async getRates(
    request: unknown,
    options?: { carrierId?: string }
  ): Promise<CarrierResult<RateResponse>> {
    const parseResult = parseRateRequest(request);
    if (!parseResult.success) {
      const msg = parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return { ok: false, error: validationError(msg, parseResult.error) };
    }
    const validRequest = parseResult.data;

    const carrierId = options?.carrierId ?? this.config.defaultCarrierIds?.[0];
    if (!carrierId) {
      return {
        ok: false,
        error: validationError("No carrier specified and no default carrier configured"),
      };
    }
    const adapter = this.config.carriers.get(carrierId);
    if (!adapter) {
      return {
        ok: false,
        error: validationError(`Unknown carrier: ${carrierId}`),
      };
    }
    return adapter.rate.getRates(validRequest);
  }

  /**
   * Get rates from all configured carriers and merge quotes (e.g. for shopping).
   * Each carrier's quotes are tagged with carrierId. Failures from one carrier
   * can be isolated or aggregated depending on policy.
   */
  async getRatesFromAllCarriers(request: unknown): Promise<{
    quotes: RateResponse["quotes"];
    errors: Array<{ carrierId: string; error: import("../domain/errors.js").CarrierIntegrationError }>;
  }> {
    const parseResult = parseRateRequest(request);
    if (!parseResult.success) {
      const msg = parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw validationError(msg, parseResult.error);
    }
    const validRequest = parseResult.data;
    const quotes: RateResponse["quotes"] = [];
    const errors: Array<{ carrierId: string; error: import("../domain/errors.js").CarrierIntegrationError }> = [];
    const carrierIds = this.config.defaultCarrierIds ?? Array.from(this.config.carriers.keys());
    for (const id of carrierIds) {
      const adapter = this.config.carriers.get(id);
      if (!adapter) continue;
      const result = await adapter.rate.getRates(validRequest);
      if (result.ok) {
        result.value.quotes.forEach((q) => quotes.push({ ...q, carrierId: id }));
      } else {
        errors.push({ carrierId: id, error: result.error });
      }
    }
    return { quotes, errors };
  }
}
