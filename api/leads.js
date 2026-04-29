"use strict";

const { getConsentVersion } = require("../lib/app-config");
const { LeadStorageError, normalizeLead, validateLead, saveLeadToSupabase } = require("../lib/leads-service");
const { HttpError, createRateLimiter, getClientIp: getRequestClientIp, readJsonBody } = require("../lib/http-utils");

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const CONTACT_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONTACT_RATE_LIMIT_MAX_REQUESTS = 3;
const MIN_FORM_FILL_TIME_MS = 1500;
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const CONSENT_VERSION = getConsentVersion();
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5000;
const GENERIC_ERROR_MESSAGE = "Nao foi possivel enviar sua solicitacao agora. Tente novamente em instantes.";
const IS_DEPLOYED_RUNTIME = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const TRUST_PROXY_HEADERS = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1";
const REQUIRE_EXTERNAL_RATE_LIMIT =
  process.env.REQUIRE_EXTERNAL_RATE_LIMIT === "1" ||
  (process.env.REQUIRE_EXTERNAL_RATE_LIMIT !== "0" && IS_DEPLOYED_RUNTIME);
const REQUIRE_REQUEST_ORIGIN =
  process.env.REQUIRE_REQUEST_ORIGIN === "1" || (process.env.REQUIRE_REQUEST_ORIGIN !== "0" && IS_DEPLOYED_RUNTIME);
const ALLOW_LOCAL_ORIGINS = process.env.ALLOW_LOCAL_ORIGINS === "1" || !IS_DEPLOYED_RUNTIME;
const LOCAL_ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

const isLeadRateLimited = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:ip:",
  requireExternalInProduction: REQUIRE_EXTERNAL_RATE_LIMIT,
});

const isLeadContactRateLimited = createRateLimiter({
  windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
  maxRequests: CONTACT_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:wpp:",
  requireExternalInProduction: REQUIRE_EXTERNAL_RATE_LIMIT,
});

const normalizeOrigin = (value) => {
  const origin = String(value || "").trim();
  if (!origin) {
    return "";
  }

  try {
    const originUrl = new URL(origin);
    return `${originUrl.protocol}//${originUrl.host}`;
  } catch (error) {
    return "";
  }
};

const getConfiguredOrigins = () => {
  const configuredOrigins = [
    process.env.SITE_URL,
    process.env.ALLOWED_ORIGINS,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    ALLOW_LOCAL_ORIGINS ? LOCAL_ALLOWED_ORIGINS.join(",") : "",
  ]
    .flatMap((value) => String(value || "").split(","))
    .map(normalizeOrigin)
    .filter(Boolean);

  return new Set(configuredOrigins);
};

const getRequestOrigin = (req) => {
  const host = String(req.headers.host || "").split(",")[0].trim();
  if (!host) {
    return "";
  }

  const protocol = process.env.NODE_ENV === "development" ? "http:" : "https:";
  return normalizeOrigin(`${protocol}//${host}`);
};

const getAllowedOrigin = (req) => {
  const origin = normalizeOrigin(req.headers.origin);
  if (!origin) {
    return "";
  }

  if (origin === getRequestOrigin(req)) {
    return origin;
  }

  if (getConfiguredOrigins().has(origin)) {
    return origin;
  }

  if (ALLOW_LOCAL_ORIGINS) {
    try {
      const originUrl = new URL(origin);
      if (["localhost", "127.0.0.1", "::1"].includes(originUrl.hostname)) {
        return origin;
      }
    } catch (error) {
      return "";
    }
  }

  return "";
};

const getClientIp = (req) => getRequestClientIp(req, { trustProxyHeaders: TRUST_PROXY_HEADERS });

const isCrossSiteFetch = (req) => {
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site";
};

const sendJson = (req, res, statusCode, payload) => {
  const allowedOrigin = getAllowedOrigin(req);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Vary", "Origin");

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (statusCode === 204) {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload));
};

const isSuspiciousFormTiming = (startedAt) => {
  const timestamp = Number(startedAt || 0);
  const elapsed = Date.now() - timestamp;

  return !Number.isFinite(timestamp) || timestamp <= 0 || elapsed < MIN_FORM_FILL_TIME_MS || elapsed > MAX_FORM_AGE_MS;
};

const hasValidConsent = (body) => {
  return body.consent === true && String(body.consentVersion || "").trim() === CONSENT_VERSION;
};

const isTurnstileRequired = () => {
  if (process.env.REQUIRE_TURNSTILE === "1") {
    return true;
  }

  if (process.env.REQUIRE_TURNSTILE === "0") {
    return false;
  }

  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
};

const getTurnstileToken = (body) => String(body["cf-turnstile-response"] || "").trim();

const validateTurnstileToken = async (token, remoteIp) => {
  const secretKey = process.env.TURNSTILE_SECRET_KEY || "";

  if (!secretKey) {
    throw new HttpError(500, "Turnstile nao configurado.", "missing_turnstile_secret");
  }

  if (!token) {
    throw new HttpError(400, "Verificacao de seguranca invalida.", "missing_turnstile_token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });

  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HttpError(502, "Falha na verificacao de seguranca.", "turnstile_request_failed");
    }

    const result = await response.json().catch(() => ({}));
    if (result.success !== true) {
      throw new HttpError(400, "Verificacao de seguranca invalida.", "invalid_turnstile_token");
    }
  } finally {
    clearTimeout(timeout);
  }
};

const logApiError = (error) => {
  console.error("Lead API error:", {
    name: error?.name || "Error",
    code: error?.code || "unexpected_error",
    statusCode: error?.statusCode || 500,
    message: error?.message || GENERIC_ERROR_MESSAGE,
    details: error?.details || "",
  });
};

const getStorageErrorStatusCode = (error) => {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400) {
    return error.statusCode;
  }

  if (["missing_supabase_config", "invalid_supabase_config", "invalid_supabase_table", "unsafe_supabase_key"].includes(error?.code)) {
    return 500;
  }

  return 502;
};

module.exports = async (req, res) => {
  const origin = normalizeOrigin(req.headers.origin);
  const clientIp = getClientIp(req);

  if (isCrossSiteFetch(req) || (origin && !getAllowedOrigin(req)) || (!origin && REQUIRE_REQUEST_ORIGIN)) {
    sendJson(req, res, 403, {
      message: GENERIC_ERROR_MESSAGE,
    });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(req, res, 204, {});
    return;
  }

  if (req.method !== "POST") {
    sendJson(req, res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  try {
    if (await isLeadRateLimited(clientIp)) {
      sendJson(req, res, 429, {
        message: "Muitas tentativas em sequencia. Aguarde um instante e tente novamente.",
      });
      return;
    }

    const body = await readJsonBody(req, { limitBytes: MAX_BODY_BYTES });
    const honeypot = String(body.empresa || "").trim();

    if (honeypot) {
      sendJson(req, res, 400, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    if (isSuspiciousFormTiming(body.startedAt)) {
      sendJson(req, res, 400, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    const lead = normalizeLead(body);
    const validation = validateLead(lead);
    const invalidFields = [...validation.errors];

    if (!hasValidConsent(body)) {
      invalidFields.push("consent");
    }

    if (invalidFields.length > 0) {
      sendJson(req, res, 422, {
        message:
          invalidFields.length === 1 && invalidFields[0] === "consent"
            ? "Confirme a politica de privacidade para continuar."
            : "Revise os campos destacados e tente novamente.",
        fields: invalidFields,
      });
      return;
    }

    if (isTurnstileRequired()) {
      await validateTurnstileToken(getTurnstileToken(body), clientIp);
    }

    if (await isLeadContactRateLimited(lead.whatsapp)) {
      sendJson(req, res, 429, {
        message: "Muitas tentativas em sequencia. Aguarde um instante e tente novamente.",
      });
      return;
    }

    await saveLeadToSupabase({
      ...lead,
      consent_at: new Date().toISOString(),
      consent_version: CONSENT_VERSION,
      consent_ip: clientIp,
    });

    sendJson(req, res, 201, {
      message: "Lead recebido com sucesso.",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        logApiError(error);
      }

      sendJson(req, res, error.statusCode, {
        message: error.statusCode >= 500 ? GENERIC_ERROR_MESSAGE : error.message,
      });
      return;
    }

    if (error instanceof LeadStorageError) {
      logApiError(error);
      sendJson(req, res, getStorageErrorStatusCode(error), {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    logApiError(error);
    sendJson(req, res, 500, {
      message: GENERIC_ERROR_MESSAGE,
    });
  }
};
