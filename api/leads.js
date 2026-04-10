"use strict";

const { normalizeLead, validateLead, saveLeadToSupabase } = require("../lib/leads-service");
const { HttpError, createRateLimiter, readJsonBody } = require("../lib/http-utils");

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MIN_FORM_FILL_TIME_MS = 1500;
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const GENERIC_ERROR_MESSAGE = "Nao foi possivel enviar sua solicitacao agora. Tente novamente em instantes.";

const isLeadRateLimited = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
});

const getAllowedOrigin = (req) => {
  const origin = String(req.headers.origin || "");
  if (!origin) {
    return "";
  }

  const currentHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const explicitOrigins = [
    process.env.SITE_URL,
    process.env.ALLOWED_ORIGINS,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const originUrl = new URL(origin);
    if (currentHost && originUrl.host.toLowerCase() === currentHost) {
      return origin;
    }

    if (explicitOrigins.includes(origin)) {
      return origin;
    }
  } catch (error) {
    return "";
  }

  return "";
};

const getClientIp = (req) => {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown");
};

const sendJson = (req, res, statusCode, payload) => {
  const allowedOrigin = getAllowedOrigin(req);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

module.exports = async (req, res) => {
  const origin = String(req.headers.origin || "");
  if (origin && !getAllowedOrigin(req)) {
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
    if (isLeadRateLimited(getClientIp(req))) {
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

    if (!validation.valid) {
      sendJson(req, res, 422, {
        message: "Preencha nome, WhatsApp, tipo e quantidade de veiculos corretamente.",
        fields: validation.errors,
      });
      return;
    }

    await saveLeadToSupabase(lead);

    sendJson(req, res, 201, {
      message: "Lead recebido com sucesso.",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(req, res, error.statusCode, {
        message: error.statusCode >= 500 ? GENERIC_ERROR_MESSAGE : error.message,
      });
      return;
    }

    console.error("Lead API error:", error);
    sendJson(req, res, 500, {
      message: GENERIC_ERROR_MESSAGE,
    });
  }
};
