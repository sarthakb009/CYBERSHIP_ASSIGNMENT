/**
 * Carrier abstraction: adapters implement these interfaces.
 * Adding FedEx or another operation (e.g. tracking) does not require changing existing carrier code.
 */

import type { RateRequest, RateResponse } from "../domain/types.js";
import type { CarrierIntegrationError } from "../domain/errors.js";

/** Result of an operation that can fail with a structured error */
export type CarrierResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CarrierIntegrationError };

/** Operation that requires auth and returns a result */
export interface RateOperation {
  /** Get rates for the given request. Auth is handled transparently by the adapter. */
  getRates(request: RateRequest): Promise<CarrierResult<RateResponse>>;
}

/** A carrier adapter exposes one or more operations (rate, track, label, etc.) */
export interface CarrierAdapter {
  readonly carrierId: string;
  /** Rate shopping operation */
  readonly rate: RateOperation;
  // Future: track?: TrackingOperation; label?: LabelOperation; ...
}
