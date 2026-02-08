/**
 * Runtime validation for domain models using Zod.
 * Validate all inputs before building carrier-specific requests or calling external APIs.
 */

import { z } from "zod";
import type { Address, Package, RateRequest, ServiceLevelFilter } from "./types.js";

const addressLineSchema = z.string().min(1).max(35);
const addressSchema: z.ZodType<Address> = z.object({
  addressLines: z.array(addressLineSchema).min(1).max(3),
  city: z.string().min(1).max(30),
  stateProvinceCode: z.string().min(1).max(5),
  postalCode: z.string().min(1).max(15),
  countryCode: z.string().length(2),
  name: z.string().max(35).optional(),
  residential: z.boolean().optional(),
});

const packageSchema: z.ZodType<Package> = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  dimensionUnit: z.enum(["in", "cm"]),
  weight: z.number().positive(),
  weightUnit: z.enum(["lb", "kg"]),
});

const serviceLevelFilterSchema: z.ZodType<ServiceLevelFilter> = z.object({
  serviceCode: z.string().max(10).optional(),
  description: z.string().optional(),
});

export const rateRequestSchema: z.ZodType<RateRequest> = z.object({
  origin: addressSchema,
  destination: addressSchema,
  package: packageSchema,
  serviceLevel: serviceLevelFilterSchema.optional(),
});

/** Validate a rate request; throws ZodError with details on failure */
export function validateRateRequest(input: unknown): RateRequest {
  return rateRequestSchema.parse(input) as RateRequest;
}

/** Safe parse: returns { success: true, data } or { success: false, error } */
export function parseRateRequest(input: unknown): z.SafeParseReturnType<unknown, RateRequest> {
  return rateRequestSchema.safeParse(input);
}
