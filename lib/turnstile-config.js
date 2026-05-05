"use strict";

const getTurnstileConfig = () => {
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  const configured = Boolean(siteKey && secretKey);

  return {
    configured,
    disabledInProduction: true,
    enabled: false,
    explicitlyDisabled: true,
    hasSecretKey: Boolean(secretKey),
    missing: [],
    required: false,
    siteKey,
  };
};

const isTurnstileFailClosed = () => false;

module.exports = {
  getTurnstileConfig,
  isTurnstileFailClosed,
};
