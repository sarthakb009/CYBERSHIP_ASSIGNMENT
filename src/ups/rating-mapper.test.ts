/**
 * Unit tests: request builder and response parser (no HTTP).
 */

import { describe, it, expect } from "vitest";
import {
  buildUpsRateRequest,
  getUpsRatePath,
  parseUpsRateResponse,
} from "./rating-mapper.js";
import type { RateRequest } from "../domain/types.js";

const sampleRequest: RateRequest = {
  origin: {
    addressLines: ["123 Main St"],
    city: "Timonium",
    stateProvinceCode: "MD",
    postalCode: "21093",
    countryCode: "US",
  },
  destination: {
    addressLines: ["456 Oak Ave"],
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

describe("buildUpsRateRequest", () => {
  it("builds Shop request when no service level", () => {
    const body = buildUpsRateRequest(sampleRequest);
    expect(body.RateRequest.Request?.RequestOption).toBe("Shop");
    expect(body.RateRequest.Shipment.Shipper.Address.City).toBe("Timonium");
    expect(body.RateRequest.Shipment.ShipTo.Address.PostalCode).toBe("30005");
    expect(body.RateRequest.Shipment.Package).toBeDefined();
    const pkg = Array.isArray(body.RateRequest.Shipment.Package)
      ? body.RateRequest.Shipment.Package[0]
      : body.RateRequest.Shipment.Package;
    expect(pkg.Dimensions.Length).toBe("5");
    expect(pkg.PackageWeight.Weight).toBe("1");
  });

  it("builds Rate request when service level provided", () => {
    const withService = {
      ...sampleRequest,
      serviceLevel: { serviceCode: "03", description: "Ground" },
    };
    const body = buildUpsRateRequest(withService);
    expect(body.RateRequest.Request?.RequestOption).toBe("Rate");
    expect(body.RateRequest.Shipment.Service?.Code).toBe("03");
  });

  it("uses residential indicator when set", () => {
    const res = {
      ...sampleRequest,
      destination: { ...sampleRequest.destination, residential: true },
    };
    const body = buildUpsRateRequest(res);
    expect(body.RateRequest.Shipment.ShipTo.Address.ResidentialAddressIndicator).toBe("Y");
  });
});

describe("getUpsRatePath", () => {
  it("returns Shop path when no service level", () => {
    expect(getUpsRatePath(sampleRequest)).toBe("/rating/v2409/Shop");
  });
  it("returns Rate path when service level set", () => {
    expect(
      getUpsRatePath({ ...sampleRequest, serviceLevel: { serviceCode: "03" } })
    ).toBe("/rating/v2409/Rate");
  });
});

describe("parseUpsRateResponse", () => {
  it("parses single RatedShipment into normalized quotes", () => {
    const body = JSON.stringify({
      RateResponse: {
        Response: { TransactionReference: { CustomerContext: "req-1" } },
        RatedShipment: {
          Service: { Code: "03", Description: "Ground" },
          TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "12.50" },
        },
      },
    });
    const { quotes, requestId } = parseUpsRateResponse(body, "ups");
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      serviceCode: "03",
      serviceName: "Ground",
      totalCharge: 12.5,
      currencyCode: "USD",
      carrierId: "ups",
    });
    expect(requestId).toBe("req-1");
  });

  it("parses NegotiatedRateCharges when present", () => {
    const body = JSON.stringify({
      RateResponse: {
        RatedShipment: {
          Service: { Code: "03", Description: "Ground" },
          NegotiatedRateCharges: {
            TotalCharge: { CurrencyCode: "USD", MonetaryValue: "10.00" },
          },
        },
      },
    });
    const { quotes } = parseUpsRateResponse(body, "ups");
    expect(quotes[0].totalCharge).toBe(10);
  });

  it("parses multiple RatedShipments", () => {
    const body = JSON.stringify({
      RateResponse: {
        RatedShipment: [
          {
            Service: { Code: "01", Description: "Next Day Air" },
            TransportationCharges: { MonetaryValue: "25.00" },
          },
          {
            Service: { Code: "03", Description: "Ground" },
            TransportationCharges: { MonetaryValue: "8.00" },
          },
        ],
      },
    });
    const { quotes } = parseUpsRateResponse(body, "ups");
    expect(quotes).toHaveLength(2);
    expect(quotes[0].serviceCode).toBe("01");
    expect(quotes[1].serviceCode).toBe("03");
  });

  it("throws on malformed JSON", () => {
    expect(() => parseUpsRateResponse("not json", "ups")).toThrow("Malformed JSON");
  });

  it("returns empty quotes when no RatedShipment", () => {
    const { quotes } = parseUpsRateResponse(JSON.stringify({ RateResponse: {} }), "ups");
    expect(quotes).toEqual([]);
  });
});
