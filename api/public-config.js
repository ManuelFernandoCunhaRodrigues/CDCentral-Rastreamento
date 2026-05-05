"use strict";

const { getConsentVersion } = require("../lib/app-config");
const { getTurnstileConfig, isTurnstileFailClosed } = require("../lib/turnstile-config");

const GENERIC_CONFIG_ERROR = "Configuracao indisponivel.";

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.end(JSON.stringify(payload));
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  const turnstileConfig = getTurnstileConfig();
  if (isTurnstileFailClosed(turnstileConfig)) {
    console.error("Public config unavailable:", {
      code: "missing_turnstile_config",
      missing: turnstileConfig.missing,
    });
    sendJson(res, 503, {
      message: GENERIC_CONFIG_ERROR,
    });
    return;
  }

  sendJson(res, 200, {
    consentVersion: getConsentVersion(),
    turnstileEnabled: turnstileConfig.enabled && turnstileConfig.configured,
    turnstileSiteKey: turnstileConfig.enabled && turnstileConfig.configured ? turnstileConfig.siteKey : "",
  });
};
