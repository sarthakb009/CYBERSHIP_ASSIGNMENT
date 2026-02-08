/**
 * Integration tests: CarrierService with validation and stubbed UPS adapter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CarrierService } from "./carrier-service.js";
import { createUpsAdapter } from "../ups/adapter.js";
import { StubHttpClient } from "../http/stub-client.js";
import { CarrierIntegrationError } from "../domain/errors.js";

const baseUrl = "https://wwwcie.ups.com";

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
      RatedShipment: {
        Service: { Code: "03", Description: "Ground" },
        TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "11.99" },
      },
    },
  });
}

describe("CarrierService integration", () => {
  let http: StubHttpClient;
  let service: CarrierService;

  beforeEach(() => {
    http = new StubHttpClient();
    http.setResponses([oauthResponse(), { status: 200, headers: {}, body: rateSuccessBody() }]);
    const adapter = createUpsAdapter(
      {
        baseUrl,
        clientId: "c",
        clientSecret: "s",
        transactionSource: "t",
      },
      http
    );
    service = new CarrierService({
      carriers: new Map([["ups", adapter]]),
      defaultCarrierIds: ["ups"],
    });
  });

  it("validates request and returns quotes for valid input", async () => {
    const result = await service.getRates({
      origin: {
        addressLines: ["123 Main"],
        city: "Timonium",
        stateProvinceCode: "MD",
        postalCode: "21093",
        countryCode: "US",
      },
      destination: {
        addressLines: ["456 Oak"],
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
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quotes).toHaveLength(1);
      expect(result.value.quotes[0].totalCharge).toBe(11.99);
      expect(result.value.quotes[0].carrierId).toBe("ups");
    }
  });

  it("returns validation error for invalid input", async () => {
    const result = await service.getRates({
      origin: { addressLines: [], city: "X", stateProvinceCode: "MD", postalCode: "21093", countryCode: "US" },
      destination: {
        addressLines: ["456 Oak"],
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
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(CarrierIntegrationError);
      expect(result.error.details.code).toBe("VALIDATION_ERROR");
    }
    expect(http.getRecordedRequests()).toHaveLength(0);
  });

  it("returns error for unknown carrier", async () => {
    const result = await service.getRates(
      {
        origin: {
          addressLines: ["123"],
          city: "A",
          stateProvinceCode: "MD",
          postalCode: "21093",
          countryCode: "US",
        },
        destination: {
          addressLines: ["456"],
          city: "B",
          stateProvinceCode: "GA",
          postalCode: "30005",
          countryCode: "US",
        },
        package: {
          length: 1,
          width: 1,
          height: 1,
          dimensionUnit: "in",
          weight: 1,
          weightUnit: "lb",
        },
      },
      { carrierId: "fedex" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.code).toBe("VALIDATION_ERROR");
  });
});
