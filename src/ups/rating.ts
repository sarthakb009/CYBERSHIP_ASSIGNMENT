/**
 * UPS Rating operation: get rates via Rating API with auth and error handling.
 */

import type { RateRequest, RateResponse } from "../domain/types.js";
import type { CarrierResult } from "../carriers/types.js";
import type { UpsOAuthClient } from "./auth.js";
import type { IHttpClient } from "../http/client.js";
import {
  authError,
  rateLimitError,
  invalidRequestError,
  carrierError,
  timeoutError,
  malformedResponseError,
  CarrierIntegrationError,
} from "../domain/errors.js";
import type { HttpError } from "../http/client.js";
import { buildUpsRateRequest, getUpsRatePath, parseUpsRateResponse } from "./rating-mapper.js";
import type { UpsErrorResponse } from "./rating-types.js";

const CARRIER_ID = "ups";

export interface UpsRateOperationConfig {
  baseUrl: string;
  transactionSource: string;
  timeoutMs?: number;
}

import type { RateOperation } from "../carriers/types.js";

export class UpsRateOperation implements RateOperation {
  constructor(
    private readonly config: UpsRateOperationConfig,
    private readonly auth: UpsOAuthClient,
    private readonly http: IHttpClient
  ) {}

  async getRates(request: RateRequest): Promise<CarrierResult<RateResponse>> {
    try {
      const token = await this.auth.getValidToken();
      const path = getUpsRatePath(request);
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/api${path}`;
      const body = JSON.stringify(buildUpsRateRequest(request));

      const res = await this.http.send({
        method: "POST",
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          transId: generateTransId(),
          transactionSrc: this.config.transactionSource,
        },
        body,
        timeoutMs: this.config.timeoutMs ?? 15_000,
      });

      if (res.status === 401 || res.status === 403) {
        this.auth.invalidateToken();
        return { ok: false, error: authError("UPS returned unauthorized; token invalidated.") };
      }
      if (res.status === 429) {
        const retryAfter = res.headers["retry-after"];
        return {
          ok: false,
          error: rateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined),
        };
      }
      if (res.status >= 400) {
        const err = parseUpsErrorResponse(res.status, res.body);
        return { ok: false, error: err };
      }

      const { quotes, requestId } = parseUpsRateResponse(res.body, CARRIER_ID);
      return {
        ok: true,
        value: { quotes, requestId },
      };
    } catch (err) {
      if (isCarrierIntegrationError(err)) {
        return { ok: false, error: err };
      }
      if (isHttpTimeout(err)) {
        return { ok: false, error: timeoutError("UPS Rating") };
      }
      return {
        ok: false,
        error: malformedResponseError(
          err instanceof Error ? err.message : "Unknown error during rate request",
          err
        ),
      };
    }
  }
}

function generateTransId(): string {
  return `cyb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 32);
}

function parseUpsErrorResponse(status: number, body: string): CarrierIntegrationError {
  try {
    const data = JSON.parse(body) as UpsErrorResponse;
    const errors = data.response?.errors;
    const first = errors?.[0];
    const code = first?.code;
    const message = first?.message ?? data.fault?.faultstring ?? body.slice(0, 200);
    if (status === 400) {
      return invalidRequestError(message, code, first?.message);
    }
    return carrierError(message, status, code, first?.message);
  } catch {
    return carrierError(
      `UPS returned ${status}: ${body.slice(0, 200)}`,
      status
    );
  }
}

function isCarrierIntegrationError(e: unknown): e is CarrierIntegrationError {
  return e instanceof CarrierIntegrationError;
}

function isHttpTimeout(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e) {
    return (e as HttpError).code === "ETIMEDOUT";
  }
  return false;
}
