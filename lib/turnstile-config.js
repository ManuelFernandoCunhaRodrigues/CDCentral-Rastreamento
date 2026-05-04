"use strict";

const isProductionRuntime = () => process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

const getTurnstileConfig = () => {
  const mode = String(process.env.REQUIRE_TURNSTILE || "").trim();
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  const explicitlyDisabled = mode === "0";
  const disabledInProduction = explicitlyDisabled && isProductionRuntime();
  const required = mode === "1" || (isProductionRuntime() && !explicitlyDisabled);
  const configured = Boolean(siteKey && secretKey);
  const missing = [];

  if ((required || configured) && !siteKey) {
    missing.push("TURNSTILE_SITE_KEY");
  }

  if ((required || configured) && !secretKey) {
    missing.push("TURNSTILE_SECRET_KEY");
  }

  return {
    configured,
    disabledInProduction,
    enabled: explicitlyDisabled ? false : required || configured,
    explicitlyDisabled,
    hasSecretKey: Boolean(secretKey),
    missing,
    required,
    siteKey,
  };
};

const isTurnstileFailClosed = (config = getTurnstileConfig()) =>
  config.disabledInProduction || (config.required && config.missing.length > 0);

module.exports = {
  getTurnstileConfig,
  isTurnstileFailClosed,
};
