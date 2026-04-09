"use strict";

const { normalizeLead, validateLead, saveLeadToSupabase } = require("../lib/leads-service");
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const GENERIC_ERROR_MESSAGE = "Não foi possível enviar sua solicitação agora. Tente novamente em instantes.";
const requestStore = new Map();

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

const isRateLimited = (req) => {
  const now = Date.now();
  const key = getClientIp(req);
  const attempts = (requestStore.get(key) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  attempts.push(now);
  requestStore.set(key, attempts);
  return attempts.length > RATE_LIMIT_MAX_REQUESTS;
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

const readRequestBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  return new Promise((resolve, reject) => {
    let rawBody = "";

    req.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        reject(new Error("Payload excedeu o limite permitido."));
      }
    });

    req.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("JSON invalido no corpo da requisicao."));
      }
    });

    req.on("error", reject);
  });
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
      message: "Método não permitido.",
    });
    return;
  }

  try {
    if (isRateLimited(req)) {
      sendJson(req, res, 429, {
        message: "Muitas tentativas em sequência. Aguarde um instante e tente novamente.",
      });
      return;
    }

    const body = await readRequestBody(req);
    const honeypot = String(body.empresa || "").trim();
    const startedAt = Number(body.startedAt || 0);

    if (honeypot) {
      sendJson(req, res, 400, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    if (startedAt && Date.now() - startedAt < 1500) {
      sendJson(req, res, 400, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    const lead = normalizeLead(body);
    const validation = validateLead(lead);

    if (!validation.valid) {
      sendJson(req, res, 422, {
        message: "Preencha nome, WhatsApp, tipo e quantidade de veículos corretamente.",
        fields: validation.errors,
      });
      return;
    }

    await saveLeadToSupabase(lead);

    sendJson(req, res, 201, {
      message: "Lead recebido com sucesso.",
    });
  } catch (error) {
    console.error("Lead API error:", error);
    sendJson(req, res, 500, {
      message: GENERIC_ERROR_MESSAGE,
    });
  }
};
