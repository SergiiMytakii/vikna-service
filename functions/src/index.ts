import * as logger from "firebase-functions/logger";
import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {
  buildCheckoutPayload,
  checkoutActionUrl,
  createSignatureSha1,
  decodeBase64ToJson,
  encodePayloadToBase64,
  getHttpsProtocol,
  normalizeCheckoutInput,
  normalizeUrl,
  verifySignature,
} from "./lib/liqpay";

setGlobalOptions({maxInstances: 10, region: "europe-west1"});

const LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const PROD_ORIGINS = [
  "https://vikna-service.run.place",
  "https://vikna-service.netlify.app",
];

export const createCheckoutPayload = onRequest((request, response) => {
  applyCors(request.headers.origin, response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    response.status(403).json({error: "Origin is not allowed"});
    return;
  }

  const publicKey = process.env.LIQPAY_PUBLIC_KEY;
  const privateKey = process.env.LIQPAY_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    logger.error("liqpay_keys_missing", {
      hasPublicKey: Boolean(publicKey),
      hasPrivateKey: Boolean(privateKey),
    });

    response.status(500).json({
      error: "Сервер не налаштований для проведення платежів",
    });
    return;
  }

  try {
    const normalized = normalizeCheckoutInput(request.body ?? {});
    const siteUrl = normalizeUrl(
      process.env.SITE_URL || "https://vikna-service.run.place"
    );
    const functionsBaseUrl = normalizeUrl(resolveFunctionsBaseUrl(request));

    const payload = buildCheckoutPayload(
      normalized,
      publicKey,
      `${siteUrl}/payment/result`,
      `${functionsBaseUrl}/liqpayCallback`
    );

    const data = encodePayloadToBase64(payload);
    const signature = createSignatureSha1(data, privateKey);

    response.status(200).json({
      actionUrl: checkoutActionUrl,
      data,
      signature,
      orderId: payload.order_id,
      amount: payload.amount,
      currency: payload.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Помилка запиту";
    response.status(400).json({error: message});
  }
});

export const liqpayCallback = onRequest((request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  if (!privateKey) {
    logger.error("liqpay_private_key_missing");
    response.status(500).send("private key missing");
    return;
  }

  const parsed = parseCallbackBody(request);
  if (!parsed) {
    response.status(400).send("missing data/signature");
    return;
  }

  const validation = verifySignature(parsed.data, parsed.signature, privateKey);
  if (!validation.isValid) {
    logger.warn("liqpay_callback_invalid_signature", {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });

    response.status(400).send("invalid signature");
    return;
  }

  try {
    const decoded = decodeBase64ToJson(parsed.data) as Record<string, unknown>;

    logger.info("liqpay_callback_verified", {
      orderId: decoded.order_id,
      status: decoded.status,
      amount: decoded.amount,
      currency: decoded.currency,
      signatureAlgorithm: validation.algorithm,
      liqpayOrderId: decoded.liqpay_order_id,
    });

    response.status(200).send("ok");
  } catch (error) {
    logger.error("liqpay_callback_decode_failed", {
      error: error instanceof Error ? error.message : "Unknown decode error",
    });

    response.status(400).send("invalid data");
  }
});

function parseCallbackBody(
  request: Parameters<Parameters<typeof onRequest>[0]>[0]
): {data: string; signature: string} | null {
  const body = request.body as
    | {data?: unknown; signature?: unknown}
    | undefined;

  if (typeof body?.data === "string" && typeof body?.signature === "string") {
    return {data: body.data, signature: body.signature};
  }

  const rawBody = request.rawBody?.toString("utf8");
  if (!rawBody) {
    return null;
  }

  const params = new URLSearchParams(rawBody);
  const data = params.get("data");
  const signature = params.get("signature");

  if (!data || !signature) {
    return null;
  }

  return {data, signature};
}

function applyCors(
  origin: string | undefined,
  response: Parameters<Parameters<typeof onRequest>[0]>[1]
): void {
  response.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");

  if (origin && isAllowedOrigin(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
  }
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  const configured = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((item) => item.trim())
    : [];

  const allowed = new Set([...LOCAL_ORIGINS, ...PROD_ORIGINS, ...configured]);
  return allowed.has(origin);
}

function resolveFunctionsBaseUrl(
  request: Parameters<Parameters<typeof onRequest>[0]>[0]
): string {
  if (process.env.FUNCTIONS_BASE_URL) {
    return process.env.FUNCTIONS_BASE_URL;
  }

  const protocol = getHttpsProtocol(
    request.protocol,
    request.headers["x-forwarded-proto"]
  );
  const host = request.get("host") || "";

  if (!host) {
    return "https://europe-west1-vikna-service-prod.cloudfunctions.net";
  }

  return `${protocol}://${host}`;
}
