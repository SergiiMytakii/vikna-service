import * as logger from "firebase-functions/logger";
import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {defineSecret} from "firebase-functions/params";
import {
  buildCheckoutPayload,
  buildStatusPayload,
  checkoutActionUrl,
  createSignatureSha1,
  decodeBase64ToJson,
  encodePayloadToBase64,
  getHttpsProtocol,
  type LiqPayPayload,
  normalizeCheckoutInput,
  normalizeUrl,
  verifySignature,
} from "./lib/liqpay";
import {
  buildPaypartsCheckoutUrl,
  buildPaypartsCreatePaymentRequest,
  buildPaypartsProducts,
  buildPaypartsStateRequest,
  createPaypartsOrderId,
  createPaypartsPayment,
  getPaypartsPaymentState,
  normalizePaypartsBaseUrl,
  toPaypartsMerchantType,
  verifyPaypartsCallbackSignature,
  verifyPaypartsCreateResponseSignature,
  verifyPaypartsStateResponseSignature,
  type PaypartsCallbackPayload,
} from "./lib/payparts";

setGlobalOptions({maxInstances: 10, region: "europe-west1"});

const LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const PROD_ORIGINS = [
  "https://vikna-service.run.place",
  "https://vikna-service.netlify.app",
  "https://vikna-service-prod.web.app",
  "https://vikna-service-prod.firebaseapp.com",
];
const LIQPAY_API_URL = "https://www.liqpay.ua/api/request";
const PAYPARTS_DEFAULT_BASE_URL = "https://payparts2.privatbank.ua/ipp/v2";
const PAYPARTS_DEMO_STORE_ID = "4AAD1369CF734B64B70F";
const PAYPARTS_DEMO_PASSWORD = "75bef16bfdce4d0e9c0ad5a19b9940df";
const INSTALLMENT_PAYTYPES = new Set(["paypart", "moment_part"]);
const LIQPAY_PUBLIC_KEY_SECRET = defineSecret("LIQPAY_PUBLIC_KEY");
const LIQPAY_PRIVATE_KEY_SECRET = defineSecret("LIQPAY_PRIVATE_KEY");
const PAYPARTS_STORE_ID_SECRET = defineSecret("PAYPARTS_STORE_ID");
const PAYPARTS_PASSWORD_SECRET = defineSecret("PAYPARTS_PASSWORD");

export const createCheckoutPayload = onRequest({
  secrets: [
    LIQPAY_PUBLIC_KEY_SECRET,
    LIQPAY_PRIVATE_KEY_SECRET,
    PAYPARTS_STORE_ID_SECRET,
    PAYPARTS_PASSWORD_SECRET,
  ],
}, async (request, response) => {
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

  try {
    const normalized = normalizeCheckoutInput(request.body ?? {});
    const siteUrl = normalizeUrl(
      process.env.SITE_URL || "https://vikna-service.run.place"
    );
    const functionsBaseUrl = normalizeUrl(resolveFunctionsBaseUrl(request));
    const installmentMethod =
      normalized.paymentMethod === "paypart" ||
      normalized.paymentMethod === "moment_part"
        ? normalized.paymentMethod
        : null;

    if (installmentMethod) {
      const storeId = getConfigValue(
        PAYPARTS_STORE_ID_SECRET,
        "PAYPARTS_STORE_ID"
      );
      const password = getConfigValue(
        PAYPARTS_PASSWORD_SECRET,
        "PAYPARTS_PASSWORD"
      );
      const hasLivePayparts = hasLivePaypartsCredentials(storeId, password);
      const shouldUsePayparts = hasLivePayparts;

      if (shouldUsePayparts && storeId && password) {
        if (normalized.amount < 300) {
          response.status(400).json({
            error: "Мінімальна сума для кредиту становить 300 грн.",
          });
          return;
        }

        const paypartsBaseUrl = normalizePaypartsBaseUrl(
          process.env.PAYPARTS_BASE_URL || PAYPARTS_DEFAULT_BASE_URL
        );
        const paypartsSiteUrl = resolvePaypartsSiteUrl(siteUrl);
        const paypartsCallbackBaseUrl = resolvePaypartsCallbackBaseUrl(
          functionsBaseUrl
        );
        const merchantType = toPaypartsMerchantType(installmentMethod);
        const orderId = createPaypartsOrderId(merchantType);
        const partsCount = resolvePaypartsPartsCount(
          installmentMethod,
          (request.body as {installmentCount?: unknown} | undefined)
            ?.installmentCount
        );
        const createRequest = buildPaypartsCreatePaymentRequest({
          storeId,
          password,
          orderId,
          amount: normalized.amount,
          partsCount,
          merchantType,
          products: buildPaypartsProducts(
            normalized.productType,
            normalized.quantity,
            normalized.amount
          ),
          responseUrl: `${paypartsCallbackBaseUrl}/paypartsCallback`,
          redirectUrl:
            `${paypartsSiteUrl}/payment/result` +
            "?provider=payparts" +
            `&method=${encodeURIComponent(installmentMethod)}` +
            `&order_id=${encodeURIComponent(orderId)}`,
        });
        const createResponse = await createPaypartsPayment(
          createRequest,
          paypartsBaseUrl
        );
        const responseOrderId =
          toStringOrEmpty(createResponse.orderId) || orderId;
        const responseState = toUpperString(createResponse.state);
        const responseToken = toStringOrEmpty(createResponse.token);
        const responseMessage = toStringOrEmpty(createResponse.message);
        const signatureValid = verifyPaypartsCreateResponseSignature(
          createResponse,
          password
        );

        if (!signatureValid) {
          logger.error("payparts_create_invalid_signature", {
            orderId: responseOrderId,
            state: responseState,
          });
          response.status(502).json({
            error: "Не вдалося підтвердити відповідь банку. Спробуйте ще раз.",
          });
          return;
        }

        if (responseState !== "SUCCESS" || !responseToken) {
          response.status(400).json({
            error:
              responseMessage ||
              "Банк відхилив створення кредитної заявки.",
          });
          return;
        }

        response.status(200).json({
          provider: "payparts",
          redirectUrl: buildPaypartsCheckoutUrl(responseToken, paypartsBaseUrl),
          orderId: responseOrderId,
          amount: normalized.amount,
          currency: "UAH",
        });
        return;
      }

      logger.warn("payparts_fallback_to_liqpay", {
        paymentMethod: installmentMethod,
        hasStoreId: Boolean(storeId),
        hasPassword: Boolean(password),
        reason: explainPaypartsFallback(storeId, password),
      });
    }

    const publicKey = getConfigValue(
      LIQPAY_PUBLIC_KEY_SECRET,
      "LIQPAY_PUBLIC_KEY"
    );
    const privateKey = getConfigValue(
      LIQPAY_PRIVATE_KEY_SECRET,
      "LIQPAY_PRIVATE_KEY"
    );
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

export const liqpayCallback = onRequest({
  secrets: [LIQPAY_PUBLIC_KEY_SECRET, LIQPAY_PRIVATE_KEY_SECRET],
}, async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  const publicKey = getConfigValue(
    LIQPAY_PUBLIC_KEY_SECRET,
    "LIQPAY_PUBLIC_KEY"
  );
  const privateKey = getConfigValue(
    LIQPAY_PRIVATE_KEY_SECRET,
    "LIQPAY_PRIVATE_KEY"
  );
  if (!publicKey || !privateKey) {
    logger.error("liqpay_keys_missing_for_callback", {
      hasPublicKey: Boolean(publicKey),
      hasPrivateKey: Boolean(privateKey),
    });
    response.status(500).send("keys missing");
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
    const status = toLowerString(decoded.status);
    const paytype = toLowerString(decoded.paytype);
    const orderId = toStringOrEmpty(decoded.order_id);
    const amount = toPositiveNumber(decoded.amount);

    logger.info("liqpay_callback_verified", {
      orderId,
      status,
      amount: amount ?? decoded.amount,
      paytype: paytype || undefined,
      currency: decoded.currency,
      signatureAlgorithm: validation.algorithm,
      liqpayOrderId: decoded.liqpay_order_id,
    });

    if (
      status === "hold_wait" &&
      INSTALLMENT_PAYTYPES.has(paytype) &&
      orderId &&
      amount !== null
    ) {
      try {
        const completionPayload: LiqPayPayload = {
          action: "hold_completion",
          version: 3,
          public_key: publicKey,
          order_id: orderId,
          amount,
        };
        const completion = await callLiqPayApi(completionPayload, privateKey);

        logger.info("liqpay_hold_completion_requested", {
          source: "callback",
          orderId,
          statusBefore: status,
          paytype,
          completionStatus: completion.status,
          completionResult: completion.result,
          completionErrorCode: completion.err_code,
          completionErrorDescription: completion.err_description,
        });
      } catch (error) {
        logger.error("liqpay_hold_completion_failed", {
          source: "callback",
          orderId,
          statusBefore: status,
          paytype,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    response.status(200).send("ok");
  } catch (error) {
    logger.error("liqpay_callback_decode_failed", {
      error: error instanceof Error ? error.message : "Unknown decode error",
    });

    response.status(400).send("invalid data");
  }
});

export const paypartsCallback = onRequest({
  secrets: [PAYPARTS_STORE_ID_SECRET, PAYPARTS_PASSWORD_SECRET],
}, (request, response) => {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  const password = getConfigValue(
    PAYPARTS_PASSWORD_SECRET,
    "PAYPARTS_PASSWORD"
  );
  if (!password) {
    logger.error("payparts_password_missing_for_callback");
    response.status(500).send("password missing");
    return;
  }

  const payload = parsePaypartsCallbackBody(request);
  if (!payload) {
    response.status(400).send("invalid body");
    return;
  }

  const signatureValid = verifyPaypartsCallbackSignature(payload, password);
  if (!signatureValid) {
    logger.warn("payparts_callback_invalid_signature", {
      orderId: toStringOrEmpty(payload.orderId),
      paymentState: toUpperString(payload.paymentState),
      ip: request.ip,
    });
    response.status(400).send("invalid signature");
    return;
  }

  logger.info("payparts_callback_verified", {
    orderId: toStringOrEmpty(payload.orderId),
    storeId: toStringOrEmpty(payload.storeId || payload.storeIdentifier),
    paymentState: toUpperString(payload.paymentState),
    message: toStringOrEmpty(payload.message) || undefined,
  });

  response.status(200).send("ok");
});

export const getInstallmentSettings = onRequest({
  secrets: [PAYPARTS_STORE_ID_SECRET, PAYPARTS_PASSWORD_SECRET],
}, (request, response) => {
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

  const storeId = getConfigValue(
    PAYPARTS_STORE_ID_SECRET,
    "PAYPARTS_STORE_ID"
  );
  const password = getConfigValue(
    PAYPARTS_PASSWORD_SECRET,
    "PAYPARTS_PASSWORD"
  );
  const hasLivePayparts = hasLivePaypartsCredentials(storeId, password);
  const shouldUsePayparts = hasLivePayparts;

  response.status(200).json({
    creditProvider: shouldUsePayparts ? "payparts" : "liqpay",
    showMomentPart: shouldUsePayparts,
  });
});

export const getPaymentStatus = onRequest({
  secrets: [
    LIQPAY_PUBLIC_KEY_SECRET,
    LIQPAY_PRIVATE_KEY_SECRET,
    PAYPARTS_STORE_ID_SECRET,
    PAYPARTS_PASSWORD_SECRET,
  ],
}, async (request, response) => {
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

  const requestBody = request.body as
    | {orderId?: string; provider?: string}
    | undefined;
  const orderId = `${requestBody?.orderId ?? ""}`.trim();
  if (!orderId) {
    response.status(400).json({error: "orderId is required"});
    return;
  }

  const provider = resolvePaymentProvider(orderId, requestBody?.provider);

  if (provider === "payparts") {
    const storeId = getConfigValue(
      PAYPARTS_STORE_ID_SECRET,
      "PAYPARTS_STORE_ID"
    );
    const password = getConfigValue(
      PAYPARTS_PASSWORD_SECRET,
      "PAYPARTS_PASSWORD"
    );
    if (!storeId || !password) {
      response.status(500).json({
        error: "Сервіс кредитування не налаштовано на сервері",
      });
      return;
    }

    try {
      const paypartsBaseUrl = normalizePaypartsBaseUrl(
        process.env.PAYPARTS_BASE_URL || PAYPARTS_DEFAULT_BASE_URL
      );
      const stateRequest = buildPaypartsStateRequest(
        storeId,
        orderId,
        password
      );
      const payload = await getPaypartsPaymentState(
        stateRequest,
        paypartsBaseUrl
      );
      const signatureValid = verifyPaypartsStateResponseSignature(
        payload,
        password
      );
      if (!signatureValid) {
        logger.warn("payparts_state_invalid_signature", {
          orderId,
          state: toUpperString(payload.state),
          paymentState: toUpperString(payload.paymentState),
        });
      }

      const status = toLowerString(payload.paymentState || payload.state);
      const state = toUpperString(payload.state);
      const paymentState = toUpperString(payload.paymentState);
      const message = toStringOrEmpty(payload.message);

      response.status(200).json({
        provider: "payparts",
        result: payload.state,
        status: status || "processing",
        orderId: payload.orderId ?? orderId,
        amount: payload.amount,
        currency: "UAH",
        paytype: inferPaytypeByOrderId(orderId),
        errorDescription:
          state === "FAIL" || paymentState === "FAIL" ? message : undefined,
      });
      return;
    } catch (error) {
      logger.error("payparts_state_failed", {
        orderId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      response.status(500).json({
        error: "Помилка перевірки статусу кредитної заявки",
      });
      return;
    }
  }

  const publicKey = getConfigValue(
    LIQPAY_PUBLIC_KEY_SECRET,
    "LIQPAY_PUBLIC_KEY"
  );
  const privateKey = getConfigValue(
    LIQPAY_PRIVATE_KEY_SECRET,
    "LIQPAY_PRIVATE_KEY"
  );
  if (!publicKey || !privateKey) {
    response.status(500).json({
      error: "Сервер не налаштований для перевірки статусу платежу",
    });
    return;
  }

  try {
    const statusPayload = buildStatusPayload(orderId, publicKey);
    let payload = await callLiqPayApi(statusPayload, privateKey);
    const status = toLowerString(payload.status);
    const paytype = toLowerString(payload.paytype);
    const statusAmount = toPositiveNumber(payload.amount);

    if (
      status === "hold_wait" &&
      INSTALLMENT_PAYTYPES.has(paytype) &&
      statusAmount !== null
    ) {
      try {
        const completionPayload: LiqPayPayload = {
          action: "hold_completion",
          version: 3,
          public_key: publicKey,
          order_id: orderId,
          amount: statusAmount,
        };
        const completion = await callLiqPayApi(completionPayload, privateKey);

        logger.info("liqpay_hold_completion_requested", {
          source: "status_poll",
          orderId,
          statusBefore: status,
          paytype,
          completionStatus: completion.status,
          completionResult: completion.result,
          completionErrorCode: completion.err_code,
          completionErrorDescription: completion.err_description,
        });

        payload = await callLiqPayApi(statusPayload, privateKey);
      } catch (error) {
        logger.error("liqpay_hold_completion_failed", {
          source: "status_poll",
          orderId,
          statusBefore: status,
          paytype,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    response.status(200).json({
      provider: "liqpay",
      result: payload.result,
      status: payload.status,
      orderId: payload.order_id ?? orderId,
      amount: payload.amount,
      currency: payload.currency,
      paytype: payload.paytype,
      action: payload.action,
      liqpayOrderId: payload.liqpay_order_id,
      errorCode: payload.err_code,
      errorDescription: payload.err_description,
    });
  } catch (error) {
    logger.error("liqpay_status_failed", {
      orderId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    response.status(500).json({error: "Помилка перевірки статусу платежу"});
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

function parsePaypartsCallbackBody(
  request: Parameters<Parameters<typeof onRequest>[0]>[0]
): PaypartsCallbackPayload | null {
  const body = request.body as Record<string, unknown> | undefined;
  if (body && Object.keys(body).length > 0) {
    return {
      storeId: toStringOrEmpty(body.storeId),
      storeIdentifier: toStringOrEmpty(body.storeIdentifier),
      orderId: toStringOrEmpty(body.orderId),
      paymentState: toStringOrEmpty(body.paymentState),
      message: toStringOrEmpty(body.message),
      signature: toStringOrEmpty(body.signature),
    };
  }

  const rawBody = request.rawBody?.toString("utf8");
  if (!rawBody) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      storeId: toStringOrEmpty(parsed.storeId),
      storeIdentifier: toStringOrEmpty(parsed.storeIdentifier),
      orderId: toStringOrEmpty(parsed.orderId),
      paymentState: toStringOrEmpty(parsed.paymentState),
      message: toStringOrEmpty(parsed.message),
      signature: toStringOrEmpty(parsed.signature),
    };
  } catch {
    const params = new URLSearchParams(rawBody);
    return {
      storeId: params.get("storeId") || undefined,
      storeIdentifier: params.get("storeIdentifier") || undefined,
      orderId: params.get("orderId") || undefined,
      paymentState: params.get("paymentState") || undefined,
      message: params.get("message") || undefined,
      signature: params.get("signature") || undefined,
    };
  }
}

function resolvePaypartsPartsCount(
  paymentMethod: "paypart" | "moment_part",
  rawInstallments: unknown
): number {
  const range = paymentMethod === "paypart" ?
    {min: 2, max: 5, fallback: 4} :
    {min: 5, max: 24, fallback: 5};
  const configuredDefault = Number(
    paymentMethod === "paypart"
      ? process.env.PAYPARTS_DEFAULT_PARTS_PP
      : process.env.PAYPARTS_DEFAULT_PARTS_II
  );

  const fallbackCount =
    Number.isInteger(configuredDefault) &&
    configuredDefault >= range.min &&
    configuredDefault <= range.max
      ? configuredDefault
      : range.fallback;

  if (rawInstallments === undefined || rawInstallments === null) {
    return fallbackCount;
  }

  const parsed = Number(rawInstallments);
  if (
    !Number.isInteger(parsed) ||
    parsed < range.min ||
    parsed > range.max
  ) {
    throw new Error(
      "Кількість платежів має бути цілим числом " +
      `від ${range.min} до ${range.max}`
    );
  }

  return parsed;
}

function resolvePaymentProvider(
  orderId: string,
  providerRaw: unknown
): "liqpay" | "payparts" {
  const provider = toLowerString(providerRaw);
  if (provider === "payparts") {
    return "payparts";
  }

  if (orderId.startsWith("PP-") || orderId.startsWith("II-")) {
    return "payparts";
  }

  return "liqpay";
}

function inferPaytypeByOrderId(orderId: string): string {
  if (orderId.startsWith("PP-")) {
    return "paypart";
  }

  if (orderId.startsWith("II-")) {
    return "moment_part";
  }

  return "";
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

function resolvePaypartsSiteUrl(siteUrl: string): string {
  if (process.env.PAYPARTS_SITE_URL) {
    return normalizeUrl(process.env.PAYPARTS_SITE_URL);
  }

  if (isLocalUrl(siteUrl)) {
    return "https://vikna-service-prod.web.app";
  }

  return siteUrl;
}

function resolvePaypartsCallbackBaseUrl(functionsBaseUrl: string): string {
  if (process.env.PAYPARTS_CALLBACK_BASE_URL) {
    return normalizeUrl(process.env.PAYPARTS_CALLBACK_BASE_URL);
  }

  if (isLocalUrl(functionsBaseUrl)) {
    return "https://europe-west1-vikna-service-prod.cloudfunctions.net";
  }

  return functionsBaseUrl;
}

function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

async function callLiqPayApi(
  payload: LiqPayPayload,
  privateKey: string
): Promise<Record<string, unknown>> {
  const data = encodePayloadToBase64(payload);
  const signature = createSignatureSha1(data, privateKey);

  const apiResponse = await fetch(LIQPAY_API_URL, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({data, signature}).toString(),
  });

  if (!apiResponse.ok) {
    throw new Error("Не вдалося отримати відповідь від LiqPay");
  }

  return await apiResponse.json() as Record<string, unknown>;
}

function toLowerString(value: unknown): string {
  return `${value ?? ""}`.trim().toLowerCase();
}

function toUpperString(value: unknown): string {
  return `${value ?? ""}`.trim().toUpperCase();
}

function toStringOrEmpty(value: unknown): string {
  return `${value ?? ""}`.trim();
}

function toPositiveNumber(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

function getConfigValue(
  secret: ReturnType<typeof defineSecret>,
  envName: string
): string | undefined {
  try {
    const value = secret.value();
    if (value) {
      return value;
    }
  } catch (error) {
    logger.debug("secret_unavailable_fallback_to_env", {
      envName,
      error: error instanceof Error ? error.message : "Unknown secret error",
    });
  }

  return process.env[envName];
}

function hasLivePaypartsCredentials(
  storeId: string | undefined,
  password: string | undefined
): boolean {
  const normalizedStoreId = toStringOrEmpty(storeId);
  const normalizedPassword = toStringOrEmpty(password);
  if (!normalizedStoreId || !normalizedPassword) {
    return false;
  }

  if (
    normalizedStoreId === PAYPARTS_DEMO_STORE_ID ||
    normalizedPassword === PAYPARTS_DEMO_PASSWORD
  ) {
    return false;
  }

  return true;
}

function explainPaypartsFallback(
  storeId: string | undefined,
  password: string | undefined
): string {
  if (!storeId || !password) {
    return "missing_credentials";
  }

  if (
    toStringOrEmpty(storeId) === PAYPARTS_DEMO_STORE_ID ||
    toStringOrEmpty(password) === PAYPARTS_DEMO_PASSWORD
  ) {
    return "demo_credentials";
  }

  return "unknown";
}
