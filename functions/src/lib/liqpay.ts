import {createHash, randomBytes} from "crypto";

const LIQPAY_CHECKOUT_ACTION_URL = "https://www.liqpay.ua/api/3/checkout";

export type LiqPayPayload = Record<string, string | number | boolean | object>;
export type PaymentMethod =
  | "full"
  | "paypart"
  | "moment_part";

export interface CheckoutInput {
  productType: string;
  quantity: number;
  unitPrice: number;
  paymentMethod?: PaymentMethod | string;
  installmentCount?: number;
}

export interface NormalizedCheckoutInput {
  productType: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paymentMethod: PaymentMethod;
  installmentCount?: number;
  serviceRate?: number;
  clientSurchargeRate?: number;
}

export interface SignatureVerificationResult {
  isValid: boolean;
  algorithm: "sha1" | "sha3-256" | null;
}

export const checkoutActionUrl = LIQPAY_CHECKOUT_ACTION_URL;
const SELLER_COVERAGE_RATE = 5;
const SERVICE_RATE_BY_INSTALLMENTS: Record<number, number> = {
  2: 2.3,
  3: 2.5,
  4: 3.6,
  5: 5.3,
  6: 6.5,
  7: 7.7,
  8: 8.8,
  9: 9.9,
  10: 11.2,
  11: 12.5,
  12: 13.7,
  13: 14.8,
  14: 16,
  15: 17,
  16: 18.1,
  17: 19.1,
  18: 20.1,
  19: 21.1,
  20: 22.3,
  21: 23.2,
  22: 24.3,
  23: 25.3,
  24: 26.3,
  25: 27.3,
};

export function normalizeCheckoutInput(
  input: Partial<CheckoutInput>
): NormalizedCheckoutInput {
  const productType = `${input.productType ?? ""}`.trim();
  const quantity = Number(input.quantity);
  const unitPrice = Number(input.unitPrice);
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);

  if (!productType) {
    throw new Error("Поле 'тип товару' є обов'язковим");
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
    throw new Error("Площа має бути додатним числом від 0.01 до 10000 м²");
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Ціна має бути додатним числом");
  }

  const quantityHundredths = toSquareMetersHundredths(quantity);
  const unitPriceCents = toMoneyCents(unitPrice);
  // unitPriceCents * quantityHundredths gives 1/100 of a cent.
  // Round it back to cents.
  const baseAmountCents = Math.round(
    (unitPriceCents * quantityHundredths) / 100
  );
  const installmentPricing = getInstallmentPricing(
    paymentMethod,
    input.installmentCount
  );
  const amountCents = Math.round(
    (baseAmountCents * (100 + installmentPricing.clientSurchargeRate)) / 100
  );

  return {
    productType,
    quantity: quantityHundredths / 100,
    unitPrice: unitPriceCents / 100,
    amount: amountCents / 100,
    paymentMethod,
    installmentCount: installmentPricing.installmentCount,
    serviceRate: installmentPricing.serviceRate,
    clientSurchargeRate: installmentPricing.clientSurchargeRate,
  };
}

export function buildCheckoutPayload(
  normalized: NormalizedCheckoutInput,
  publicKey: string,
  resultUrl: string,
  serverUrl: string
): LiqPayPayload {
  const description =
    `${normalized.productType} (${buildDescriptionSuffix(normalized)})`;
  const orderId = generateOrderId();
  const resultUrlWithOrder = appendOrderIdToResultUrl(resultUrl, orderId);

  const paytypes = toLiqPayPaytypes(normalized.paymentMethod);

  return {
    version: 3,
    public_key: publicKey,
    action: "pay",
    amount: normalized.amount,
    currency: "UAH",
    description,
    order_id: orderId,
    language: "uk",
    ...(paytypes ? {paytypes} : {}),
    result_url: resultUrlWithOrder,
    server_url: serverUrl,
  };
}

export function buildStatusPayload(
  orderId: string,
  publicKey: string
): LiqPayPayload {
  return {
    action: "status",
    version: 3,
    public_key: publicKey,
    order_id: orderId,
  };
}

export function encodePayloadToBase64(payload: LiqPayPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodeBase64ToJson(data: string): unknown {
  return JSON.parse(Buffer.from(data, "base64").toString("utf8"));
}

export function createSignatureSha1(data: string, privateKey: string): string {
  return Buffer.from(
    createHash("sha1").update(`${privateKey}${data}${privateKey}`).digest()
  ).toString("base64");
}

export function createSignatureSha3(data: string, privateKey: string): string {
  return Buffer.from(
    createHash("sha3-256").update(`${privateKey}${data}${privateKey}`).digest()
  ).toString("base64");
}

export function verifySignature(
  data: string,
  signature: string,
  privateKey: string
): SignatureVerificationResult {
  const sha1 = createSignatureSha1(data, privateKey);
  if (sha1 === signature) {
    return {isValid: true, algorithm: "sha1"};
  }

  const sha3 = createSignatureSha3(data, privateKey);
  if (sha3 === signature) {
    return {isValid: true, algorithm: "sha3-256"};
  }

  return {isValid: false, algorithm: null};
}

export function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getHttpsProtocol(
  fallbackProtocol: string,
  forwardedHeader: string | string[] | undefined
): string {
  if (Array.isArray(forwardedHeader) && forwardedHeader.length > 0) {
    return forwardedHeader[0] === "https" ? "https" : "http";
  }

  if (typeof forwardedHeader === "string" && forwardedHeader.length > 0) {
    return forwardedHeader.split(",")[0].trim() === "https" ? "https" : "http";
  }

  return fallbackProtocol === "https" ? "https" : "http";
}

function generateOrderId(): string {
  const entropy = randomBytes(5).toString("hex");
  return `VS-${Date.now()}-${entropy}`;
}

function appendOrderIdToResultUrl(resultUrl: string, orderId: string): string {
  const separator = resultUrl.includes("?") ? "&" : "?";
  return `${resultUrl}${separator}order_id=${encodeURIComponent(orderId)}`;
}

function toLiqPayPaytypes(paymentMethod: PaymentMethod): string | undefined {
  switch (paymentMethod) {
  case "paypart":
    return "paypart,moment_part";
  case "moment_part":
    return "moment_part";
  case "full":
  default:
    return undefined;
  }
}

function buildDescriptionSuffix(normalized: NormalizedCheckoutInput): string {
  const areaText = `${formatSquareMeters(normalized.quantity)} м²`;
  if (!normalized.installmentCount) {
    return areaText;
  }

  return `${areaText}, ${normalized.installmentCount} платежів`;
}

function getInstallmentPricing(
  paymentMethod: PaymentMethod,
  installmentCountRaw: unknown
): {
  installmentCount?: number;
  serviceRate?: number;
  clientSurchargeRate: number;
} {
  if (paymentMethod !== "paypart" && paymentMethod !== "moment_part") {
    return {clientSurchargeRate: 0};
  }

  const installmentCount =
    installmentCountRaw === undefined || installmentCountRaw === null
      ? 6
      : Number(installmentCountRaw);
  if (!Number.isInteger(installmentCount)) {
    throw new Error("Кількість платежів має бути цілим числом від 2 до 25");
  }

  const serviceRate = SERVICE_RATE_BY_INSTALLMENTS[installmentCount];
  if (serviceRate === undefined) {
    throw new Error("Кількість платежів має бути в діапазоні від 2 до 25");
  }

  if (installmentCount <= 4) {
    return {
      installmentCount,
      serviceRate,
      clientSurchargeRate: 0,
    };
  }

  return {
    installmentCount,
    serviceRate,
    clientSurchargeRate: Math.max(0, serviceRate - SELLER_COVERAGE_RATE),
  };
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  const method = `${value ?? "full"}`.trim().toLowerCase();

  switch (method) {
  case "paypart":
  case "moment_part":
  case "full":
  case "all":
    return method === "all" ? "full" : method;
  default:
    return "full";
  }
}

function toSquareMetersHundredths(value: number): number {
  const hundredths = Math.round(value * 100);
  const delta = Math.abs(value * 100 - hundredths);

  if (delta > 0.000001) {
    throw new Error("Площа може містити не більше 2 знаків після коми");
  }

  if (hundredths <= 0) {
    throw new Error("Площа має бути більшою за 0");
  }

  return hundredths;
}

function toMoneyCents(value: number): number {
  const cents = Math.round(value * 100);
  const delta = Math.abs(value * 100 - cents);

  if (delta > 0.000001) {
    throw new Error("Ціна має містити не більше 2 знаків після коми");
  }

  return cents;
}

function formatSquareMeters(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
