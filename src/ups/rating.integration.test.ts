/**
 * Integration tests: UPS Rating flow end-to-end with stubbed HTTP.
 * Verifies request building, response parsing, auth lifecycle, and error handling.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createUpsAdapter } from "./adapter.js";
import { StubHttpClient } from "../http/stub-client.js";
import type { RateRequest } from "../domain/types.js";
import { CarrierIntegrationError } from "../domain/errors.js";

const baseUrl = "https://wwwcie.ups.com";
const tokenUrl = `${baseUrl}/security/v1/oauth/token`;
const rateUrl = `${baseUrl}/api/rating/v2409/Shop`;

function oauthResponse() {
  return {
    status: 200,
    headers: {},
    body: JSON.stringify({
      access_token: "stub-token",
      token_type: "Bearer",
      expires_in: 3600,
    }),
  };
}

function rateSuccessBody() {
  return JSON.stringify({
    RateResponse: {
      Response: { TransactionReference: { CustomerContext: "tx-1" } },
      RatedShipment: [
        {
          Service: { Code: "03", Description: "Ground" },
          TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "14.25" },
        },
        {
          Service: { Code: "01", Description: "Next Day Air" },
          TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "28.50" },
        },
      ],
    },
  });
}

const sampleRequest: RateRequest = {
  origin: {
    addressLines: ["123 Shipper St"],
    city: "Timonium",
    stateProvinceCode: "MD",
    postalCode: "21093",
    countryCode: "US",
  },
  destination: {
    addressLines: ["456 ShipTo Ave"],
    city: "Alpharetta",
    stateProvinceCode: "GA",
    postalCode: "30005",
    countryCode: "US",
  },
  package: {
    length: 5,
    width: 5,
    height: 5,
    dimensionUnit: "in",
    weight: 1,
    weightUnit: "lb",
  },
};

describe("UPS Rating integration (stubbed)", () => {
  let http: StubHttpClient;

  beforeEach(() => {
    http = new StubHttpClient();
  });

  it("builds correct request and returns normalized quotes", async () => {
    http.setResponses([oauthResponse(), { status: 200, headers: {}, body: rateSuccessBody() }]);
    const adapter = createUpsAdapter(
      {
        baseUrl,
        clientId: "cid",
        clientSecret: "csec",
        transactionSource: "test",
      },
      http
    );
    const result = await adapter.rate.getRates(sampleRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quotes).toHaveLength(2);
      expect(result.value.quotes[0]).toMatchObject({
        serviceCode: "03",
        serviceName: "Ground",
        totalCharge: 14.25,
        currencyCode: "USD",
        carrierId: "ups",
      });
      expect(result.value.requestId).toBe("tx-1");
    }
    const requests = http.getRecordedRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain("oauth/token");
    expect(requests[1].url).toContain("/rating/v2409/Shop");
    expect(requests[1].headers?.Authorization).toBe("Bearer stub-token");
    const rateBody = JSON.parse(requests[1].body ?? "{}");
    expect(rateBody.RateRequest.Shipment.Shipper.Address.City).toBe("Timonium");
    expect(rateBody.RateRequest.Shipment.ShipTo.Address.PostalCode).toBe("30005");
    expect(rateBody.RateRequest.Request.RequestOption).toBe("Shop");
  });

  it("reuses token for second rate call", async () => {
    http.setResponses([
      oauthResponse(),
      { status: 200, headers: {}, body: rateSuccessBody() },
      { status: 200, headers: {}, body: rateSuccessBody() },
    ]);
    const adapter = createUpsAdapter(
      { baseUrl, clientId: "c", clientSecret: "s", transactionSource: "t" },
      http
    );
    await adapter.rate.getRates(sampleRequest);
    await adapter.rate.getRates(sampleRequest);
    expect(http.getRecordedRequests()).toHaveLength(3); // 1 auth + 2 rate (no second auth)
    expect(http.getRecordedRequests()[1].headers?.Authorization).toBe("Bearer stub-token");
    expect(http.getRecordedRequests()[2].headers?.Authorization).toBe("Bearer stub-token");
  });

  it("returns structured error on 400", async () => {
    http.setResponses([
      oauthResponse(),
      {
        status: 400,
        headers: {},
        body: JSON.stringify({
          response: {
            errors: [{ code: "InvalidAddress", message: "Invalid postal code" }],
          },
        }),
      },
    ]);
    const adapter = createUpsAdapter(
      { baseUrl, clientId: "c", clientSecret: "s", transactionSource: "t" },
      http
    );
    const result = await adapter.rate.getRates(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(CarrierIntegrationError);
      expect(result.error.details.code).toBe("INVALID_REQUEST");
      expect(result.error.details.httpStatus).toBe(400);
      expect(result.error.details.carrierCode).toBe("InvalidAddress");
    }
  });

  it("returns rate limit error on 429", async () => {
    http.setResponses([
      oauthResponse(),
      { status: 429, headers: { "retry-after": "30" }, body: "Too Many Requests" },
    ]);
    const adapter = createUpsAdapter(
      { baseUrl, clientId: "c", clientSecret: "s", transactionSource: "t" },
      http
    );
    const result = await adapter.rate.getRates(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.code).toBe("RATE_LIMITED");
      expect(result.error.details.httpStatus).toBe(429);
    }
  });

  it("invalidates token and returns auth error on 401 from rate API", async () => {
    http.setResponses([
      oauthResponse(),
      { status: 401, headers: {}, body: "Unauthorized" },
    ]);
    const adapter = createUpsAdapter(
      { baseUrl, clientId: "c", clientSecret: "s", transactionSource: "t" },
      http
    );
    const result = await adapter.rate.getRates(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.code).toBe("AUTH_FAILED");
    }
  });

  it("returns structured error on 500", async () => {
    http.setResponses([
      oauthResponse(),
      { status: 500, headers: {}, body: "Internal Server Error" },
    ]);
    const adapter = createUpsAdapter(
      { baseUrl, clientId: "c", clientSecret: "s", transactionSource: "t" },
      http
    );
    const result = await adapter.rate.getRates(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.code).toBe("CARRIER_ERROR");
      expect(result.error.details.httpStatus).toBe(500);
    }
  });

  it("returns malformed response error on invalid JSON from rate API", async () => {
    http.setResponses([
      oauthResponse(),
      { status: 200, headers: {}, body: "not json at all" },
    ]);
    const adapter = createUpsAdapter(
      { baseUrl, clientId: "c", clientSecret: "s", transactionSource: "t" },
      http
    );
    const result = await adapter.rate.getRates(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.code).toBe("MALFORMED_RESPONSE");
    }
  });
});
