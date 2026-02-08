/**
 * Domain types for the carrier integration service.
 * Callers work only with these; carrier-specific shapes stay inside adapters.
 */

/** Normalized address used across all carriers */
export interface Address {
  /** Full street address lines */
  addressLines: string[];
  city: string;
  /** State/province code (e.g. CA, NY) */
  stateProvinceCode: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** Optional name for the location */
  name?: string;
  /** Residential delivery indicator */
  residential?: boolean;
}

/** Normalized package dimensions and weight */
export interface Package {
  /** Length in the unit specified by dimensionUnit */
  length: number;
  width: number;
  height: number;
  /** Dimension unit: 'in' (inches) or 'cm' */
  dimensionUnit: "in" | "cm";
  /** Weight in the unit specified by weightUnit */
  weight: number;
  /** Weight unit: 'lb' (pounds) or 'kg' */
  weightUnit: "lb" | "kg";
}

/** Optional service level filter (carrier-specific code; adapter maps to carrier codes) */
export interface ServiceLevelFilter {
  /** Carrier service code (e.g. "03" for UPS Ground). Interpretation is carrier-specific. */
  serviceCode?: string;
  /** Human-readable description for logging/display */
  description?: string;
}

/** Request for rate shopping — carrier-agnostic */
export interface RateRequest {
  origin: Address;
  destination: Address;
  package: Package;
  /** If provided, rate for this service only; otherwise "shop" for all services */
  serviceLevel?: ServiceLevelFilter;
}

/** A single normalized rate quote */
export interface RateQuote {
  /** Display name of the service (e.g. "UPS Ground") */
  serviceName: string;
  /** Carrier-specific service code for downstream use (e.g. label purchase) */
  serviceCode: string;
  /** Total charge amount in the specified currency */
  totalCharge: number;
  /** ISO 4217 currency code */
  currencyCode: string;
  /** Optional transit days (business days) */
  transitDays?: number;
  /** Carrier id (e.g. "ups") for multi-carrier responses */
  carrierId?: string;
}

/** Successful rate response — list of quotes */
export interface RateResponse {
  quotes: RateQuote[];
  /** Request id or correlation id if the carrier returns one */
  requestId?: string;
}

/** Supported carriers (extensible) */
export type CarrierId = "ups" | "fedex" | "usps" | "dhl";
