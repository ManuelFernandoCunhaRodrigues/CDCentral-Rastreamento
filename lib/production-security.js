"use strict";

const { assertServerSideSupabaseKey } = require("./leads-service");
const { getTurnstileConfig } = require("./turnstile-config");

const isProductionRuntime = () => process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

const getRequiredEnvMissing = (names) => names.filter((name) => !String(process.env[name] || "").trim());

const getProductionSecurityConfigErrors = () => {
  if (!isProductionRuntime()) {
    return [];
  }

  const errors = [];
  const supabaseInsertKey = String(process.env.SUPABASE_LEADS_INSERT_KEY || "").trim();
  const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const turnstileConfig = getTurnstileConfig();

  if (turnstileConfig.required && turnstileConfig.missing.length > 0) {
    errors.push(`${turnstileConfig.missing.join(", ")} missing`);
  }

  if (String(process.env.REQUIRE_EXTERNAL_RATE_LIMIT || "").trim() === "1") {
    const missingUpstash = getRequiredEnvMissing(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
    if (missingUpstash.length > 0) {
      errors.push(`${missingUpstash.join(", ")} missing`);
    }
  }

  const missingSupabase = getRequiredEnvMissing(["SUPABASE_URL", "SUPABASE_LEADS_INSERT_KEY"]);
  if (missingSupabase.length > 0) {
    errors.push(`${missingSupabase.join(", ")} missing`);
  }

  if (!supabaseInsertKey && supabaseServiceRoleKey) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is not accepted; configure SUPABASE_LEADS_INSERT_KEY");
  }

  if (supabaseInsertKey) {
    try {
      assertServerSideSupabaseKey(supabaseInsertKey);
    } catch (error) {
      errors.push("SUPABASE_LEADS_INSERT_KEY must be a server-side key");
    }
  }

  return errors;
};

const assertProductionSecurityConfig = () => {
  const errors = getProductionSecurityConfigErrors();
  if (errors.length > 0) {
    throw new Error(`Production security config invalid: ${errors.join("; ")}`);
  }
};

module.exports = {
  assertProductionSecurityConfig,
  getProductionSecurityConfigErrors,
  isProductionRuntime,
};
