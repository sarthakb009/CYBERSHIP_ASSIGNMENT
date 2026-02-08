/**
 * UPS carrier adapter: composes OAuth client and Rate operation.
 * Single entry point for "UPS as a carrier"; adding FedEx would be a separate adapter.
 */

import type { CarrierAdapter } from "../carriers/types.js";
import type { IHttpClient } from "../http/client.js";
import { UpsOAuthClient } from "./auth.js";
import { UpsRateOperation } from "./rating.js";

export interface UpsAdapterConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
  transactionSource: string;
  timeoutMs?: number;
  rateTimeoutMs?: number;
}

export function createUpsAdapter(config: UpsAdapterConfig, http: IHttpClient): CarrierAdapter {
  const auth = new UpsOAuthClient(
    {
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenUrl: config.tokenUrl,
      timeoutMs: config.timeoutMs,
    },
    http
  );
  const rate = new UpsRateOperation(
    {
      baseUrl: config.baseUrl,
      transactionSource: config.transactionSource,
      timeoutMs: config.rateTimeoutMs,
    },
    auth,
    http
  );
  return {
    carrierId: "ups",
    rate,
  };
}
