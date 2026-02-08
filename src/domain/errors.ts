/**
 * Structured errors for the carrier integration layer.
 * Callers receive meaningful, actionable errors — no swallowed exceptions.
 */

export type CarrierErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "CARRIER_ERROR"
  | "VALIDATION_ERROR";

export interface CarrierErrorDetails {
  code: CarrierErrorCode;
  message: string;
  /** HTTP status when applicable (4xx, 5xx) */
  httpStatus?: number;
  /** Raw carrier error code or message for debugging */
  carrierCode?: string;
  carrierMessage?: string;
  /** Request/correlation id if available */
  requestId?: string;
  /** Underlying cause for logging (e.g. original Error) */
  cause?: unknown;
}

export class CarrierIntegrationError extends Error {
  readonly details: CarrierErrorDetails;

  constructor(details: CarrierErrorDetails) {
    super(details.message);
    this.name = "CarrierIntegrationError";
    this.details = details;
    Object.setPrototypeOf(this, CarrierIntegrationError.prototype);
  }

  get code(): CarrierErrorCode {
    return this.details.code;
  }

  get httpStatus(): number | undefined {
    return this.details.httpStatus;
  }

  /** Serialize for API responses or logging */
  toJSON(): CarrierErrorDetails {
    return { ...this.details, cause: undefined };
  }
}

/** Build auth failure error */
export function authError(message: string, cause?: unknown): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "AUTH_FAILED",
    message,
    cause,
  });
}

/** Build rate limit error (429) */
export function rateLimitError(retryAfter?: number): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "RATE_LIMITED",
    message: retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter}s`
      : "Rate limit exceeded",
    httpStatus: 429,
  });
}

/** Build invalid request (400) */
export function invalidRequestError(
  message: string,
  carrierCode?: string,
  carrierMessage?: string
): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "INVALID_REQUEST",
    message,
    httpStatus: 400,
    carrierCode,
    carrierMessage,
  });
}

/** Build network/timeout error */
export function networkError(message: string, cause?: unknown): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "NETWORK_ERROR",
    message,
    cause,
  });
}

export function timeoutError(operation: string): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "TIMEOUT",
    message: `Request timed out: ${operation}`,
  });
}

/** Malformed response from carrier */
export function malformedResponseError(
  message: string,
  cause?: unknown
): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "MALFORMED_RESPONSE",
    message,
    cause,
  });
}

/** Generic carrier/server error (5xx or carrier-specific) */
export function carrierError(
  message: string,
  httpStatus?: number,
  carrierCode?: string,
  carrierMessage?: string
): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "CARRIER_ERROR",
    message,
    httpStatus,
    carrierCode,
    carrierMessage,
  });
}

/** Validation error (input validation before calling carrier) */
export function validationError(message: string, cause?: unknown): CarrierIntegrationError {
  return new CarrierIntegrationError({
    code: "VALIDATION_ERROR",
    message,
    cause,
  });
}
