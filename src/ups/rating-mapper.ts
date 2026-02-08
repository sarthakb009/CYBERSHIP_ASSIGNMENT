/**
 * Maps domain types to UPS Rating API request and UPS response to domain RateResponse.
 * Single place for UPS-specific payload shapes; no raw UPS types leak to callers.
 */

import type { RateRequest, Address, Package } from "../domain/types.js";
import type { UpsRateRequestWrapper, UpsRateResponseWrapper, UpsRateShipment, UpsPackage, UpsRatedShipment } from "./rating-types.js";
import type { RateQuote } from "../domain/types.js";

const RATE_VERSION = "v2409";
const REQUEST_OPTION_SHOP = "Shop";
const REQUEST_OPTION_RATE = "Rate";
const PACKAGING_CODE = "02"; // Customer supplied package
const BILL_SHIPPER_TYPE = "01";
const DIM_IN = "IN";
const DIM_CM = "CM";
const WEIGHT_LBS = "LBS";
const WEIGHT_KGS = "KGS";

function toAddressLine(lines: string[]): string[] {
  return lines.slice(0, 3).map((l) => l.slice(0, 35));
}

function toUpsAddress(addr: Address, name: string): UpsRateShipment["Shipper"] {
  return {
    Name: (addr.name ?? name).slice(0, 35),
    Address: {
      AddressLine: toAddressLine(addr.addressLines),
      City: addr.city.slice(0, 30),
      StateProvinceCode: addr.stateProvinceCode.slice(0, 5),
      PostalCode: addr.postalCode.slice(0, 15),
      CountryCode: addr.countryCode,
      ...(addr.residential ? { ResidentialAddressIndicator: "Y" } : {}),
    },
  };
}

function toUpsPackage(pkg: Package): UpsPackage {
  const dimCode = pkg.dimensionUnit === "in" ? DIM_IN : DIM_CM;
  const weightCode = pkg.weightUnit === "lb" ? WEIGHT_LBS : WEIGHT_KGS;
  return {
    PackagingType: { Code: PACKAGING_CODE, Description: "Package" },
    Dimensions: {
      UnitOfMeasurement: { Code: dimCode, Description: pkg.dimensionUnit === "in" ? "Inches" : "Centimeters" },
      Length: String(pkg.length),
      Width: String(pkg.width),
      Height: String(pkg.height),
    },
    PackageWeight: {
      UnitOfMeasurement: { Code: weightCode, Description: pkg.weightUnit === "lb" ? "Pounds" : "Kilograms" },
      Weight: String(pkg.weight),
    },
  };
}

/**
 * Build UPS Rating API request body from domain RateRequest.
 * Uses Shop when no service level is specified (get all rates); otherwise Rate with specific service.
 */
export function buildUpsRateRequest(request: RateRequest): UpsRateRequestWrapper {
  const shipment: UpsRateShipment = {
    Shipper: toUpsAddress(request.origin, "Shipper"),
    ShipTo: toUpsAddress(request.destination, "ShipTo"),
    ShipFrom: toUpsAddress(request.origin, "ShipFrom"),
    PaymentDetails: {
      ShipmentCharge: [{ Type: BILL_SHIPPER_TYPE, BillShipper: { AccountNumber: "" } }],
    },
    NumOfPieces: "1",
    Package: toUpsPackage(request.package),
  };

  if (request.serviceLevel?.serviceCode) {
    shipment.Service = {
      Code: request.serviceLevel.serviceCode,
      Description: request.serviceLevel.description ?? request.serviceLevel.serviceCode,
    };
  }

  const requestOption = request.serviceLevel?.serviceCode ? REQUEST_OPTION_RATE : REQUEST_OPTION_SHOP;

  return {
    RateRequest: {
      Request: { RequestOption: requestOption },
      Shipment: shipment,
    },
  };
}

/** Path and version for Rating API: /rating/v2409/Shop or /rating/v2409/Rate */
export function getUpsRatePath(request: RateRequest): string {
  const option = request.serviceLevel?.serviceCode ? REQUEST_OPTION_RATE : REQUEST_OPTION_SHOP;
  return `/rating/${RATE_VERSION}/${option}`;
}

/**
 * Parse UPS response into normalized RateQuote[].
 * Handles single RatedShipment or array; uses NegotiatedRateCharges.TotalCharge when present, else TransportationCharges.
 */
export function parseUpsRateResponse(
  body: string,
  carrierId: string
): { quotes: RateQuote[]; requestId?: string } {
  let data: UpsRateResponseWrapper;
  try {
    data = JSON.parse(body) as UpsRateResponseWrapper;
  } catch {
    throw new Error("Malformed JSON in UPS rate response");
  }
  const rated = data.RateResponse?.RatedShipment;
  if (!rated) {
    return { quotes: [], requestId: data.RateResponse?.Response?.TransactionReference?.CustomerContext };
  }
  const list = Array.isArray(rated) ? rated : [rated];
  const quotes: RateQuote[] = list.map((s) => mapRatedShipmentToQuote(s, carrierId));
  return {
    quotes: quotes.filter((q) => q.totalCharge >= 0),
    requestId: data.RateResponse?.Response?.TransactionReference?.CustomerContext,
  };
}

function mapRatedShipmentToQuote(s: UpsRatedShipment, carrierId: string): RateQuote {
  const serviceName = s.Service?.Description ?? s.Service?.Code ?? "Unknown";
  const serviceCode = s.Service?.Code ?? "";
  let totalCharge = 0;
  let currencyCode = "USD";

  const negotiated = s.NegotiatedRateCharges?.TotalCharge;
  if (negotiated?.MonetaryValue !== undefined) {
    totalCharge = parseFloat(negotiated.MonetaryValue);
    currencyCode = negotiated.CurrencyCode ?? currencyCode;
  } else if (s.TransportationCharges?.MonetaryValue !== undefined) {
    totalCharge = parseFloat(s.TransportationCharges.MonetaryValue);
    currencyCode = s.TransportationCharges.CurrencyCode ?? currencyCode;
  }

  let transitDays: number | undefined;
  const days = s.TimeInTransit?.ServiceSummary?.BusinessTransitDays;
  if (days !== undefined && days !== null) {
    const n = parseInt(String(days), 10);
    if (!Number.isNaN(n)) transitDays = n;
  }

  return {
    serviceName,
    serviceCode,
    totalCharge,
    currencyCode,
    transitDays,
    carrierId,
  };
}
