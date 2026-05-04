"use strict";

const {
  hasPlaceholderValue,
  loadEnvFiles,
  normalizeOrigin,
  parseArgs,
  parseOriginList,
  redact,
} = require("./lib/env");
const { assertServerSideSupabaseKey } = require("../lib/leads-service");

const args = parseArgs();
if (!args.env && !args["env-file"] && String(args._[0] || "").includes(".env")) {
  args.env = args._[0];
}
if (!args.target && args._[1]) {
  args.target = args._[1];
}
if (!args.domain && args._[2]) {
  args.domain = args._[2];
}

let loadedEnvFile = "";

try {
  loadedEnvFile = loadEnvFiles(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const target = String(args.target || process.env.VERCEL_ENV || process.env.NODE_ENV || "production").toLowerCase();
const expectedDomain = String(args.domain || "cdcentralrastreamento.com.br").toLowerCase();
const isProductionTarget = ["production", "prod"].includes(target);
const isPublishedTarget = isProductionTarget || ["preview", "staging"].includes(target);
const results = [];

const addResult = (level, subject, message) => {
  results.push({ level, subject, message });
};

const addOk = (subject, message) => addResult("ok", subject, message);
const addWarn = (subject, message) => addResult("warn", subject, message);
const addError = (subject, message) => addResult("error", subject, message);

const validateSupabaseServerKey = (name, value) => {
  if (hasPlaceholderValue(value)) {
    addError("supabase key", `${name} still looks like a placeholder`);
    return;
  }

  try {
    assertServerSideSupabaseKey(value);
  } catch (error) {
    addError("supabase key", `${name} looks like an anon/publishable key; use a server-side key`);
    return;
  }

  addOk("supabase key", `${name} is server-side (${redact(value)})`);
};

const requireVariable = (name, label = name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    addError(label, `${name} is missing`);
    return "";
  }

  if (hasPlaceholderValue(value)) {
    addError(label, `${name} still looks like a placeholder`);
    return value;
  }

  addOk(label, `${name} is set (${redact(value)})`);
  return value;
};

const requireUrl = (name, label, options = {}) => {
  const value = requireVariable(name, label);
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    if (options.httpsOnly !== false && parsedUrl.protocol !== "https:") {
      addError(label, `${name} must use https`);
    }

    return parsedUrl;
  } catch (error) {
    addError(label, `${name} is not a valid URL`);
    return null;
  }
};

const siteUrl = requireUrl("SITE_URL", "site domain");
if (siteUrl) {
  const siteHost = siteUrl.host.toLowerCase();
  if (isProductionTarget && siteHost !== expectedDomain) {
    addError("site domain", `SITE_URL host must be ${expectedDomain} for production, got ${siteHost}`);
  } else {
    addOk("site domain", `SITE_URL host is ${siteHost}`);
  }
}

const allowedOriginsRaw = String(process.env.ALLOWED_ORIGINS || "").trim();
const allowedOrigins = parseOriginList(allowedOriginsRaw);
const siteOrigin = normalizeOrigin(process.env.SITE_URL);
if (!allowedOriginsRaw) {
  addError("allowed origins", "ALLOWED_ORIGINS is missing");
} else if (hasPlaceholderValue(allowedOriginsRaw)) {
  addError("allowed origins", "ALLOWED_ORIGINS still looks like a placeholder");
} else if (allowedOrigins.length === 0) {
  addError("allowed origins", "ALLOWED_ORIGINS has no valid origins");
} else if (siteOrigin && !allowedOrigins.includes(siteOrigin)) {
  addError("allowed origins", `ALLOWED_ORIGINS must include ${siteOrigin}`);
} else if (isPublishedTarget && allowedOrigins.some((origin) => new URL(origin).protocol !== "https:")) {
  addError("allowed origins", "ALLOWED_ORIGINS must use https origins in staging/production");
} else {
  addOk("allowed origins", `${allowedOrigins.length} origin(s) configured`);
}

const supabaseUrl = requireUrl("SUPABASE_URL", "supabase");
if (supabaseUrl && !supabaseUrl.hostname.endsWith(".supabase.co")) {
  addWarn("supabase", `SUPABASE_URL host is ${supabaseUrl.hostname}; confirm this is intentional`);
}

const supabaseInsertKey = String(process.env.SUPABASE_LEADS_INSERT_KEY || "").trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (supabaseInsertKey) {
  validateSupabaseServerKey("SUPABASE_LEADS_INSERT_KEY", supabaseInsertKey);
} else {
  addError("supabase key", "SUPABASE_LEADS_INSERT_KEY is missing");
}

if (supabaseServiceRoleKey) {
  addWarn("supabase key", "SUPABASE_SERVICE_ROLE_KEY is ignored; configure only SUPABASE_LEADS_INSERT_KEY");
}

const table = String(process.env.SUPABASE_LEADS_TABLE || "leads").trim();
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
  addError("supabase table", "SUPABASE_LEADS_TABLE has an invalid table name");
} else {
  addOk("supabase table", `table is ${table}`);
}

const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
const upstashToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const kvUrl = String(process.env.KV_REST_API_URL || "").trim();
const kvToken = String(process.env.KV_REST_API_TOKEN || "").trim();

const requireExternalRateLimit = String(process.env.REQUIRE_EXTERNAL_RATE_LIMIT || "").trim() === "1";

if (isPublishedTarget && requireExternalRateLimit) {
  requireUrl("UPSTASH_REDIS_REST_URL", "upstash redis");
  requireVariable("UPSTASH_REDIS_REST_TOKEN", "upstash redis");
  if (kvUrl || kvToken) {
    addWarn("upstash redis", "KV_REST_API_* is ignored for staging/production validation; configure UPSTASH_REDIS_REST_*");
  }
} else if (upstashUrl || upstashToken) {
  requireUrl("UPSTASH_REDIS_REST_URL", "upstash redis");
  requireVariable("UPSTASH_REDIS_REST_TOKEN", "upstash redis");
} else if (kvUrl || kvToken) {
  requireUrl("KV_REST_API_URL", "redis kv fallback");
  requireVariable("KV_REST_API_TOKEN", "redis kv fallback");
  addWarn("upstash redis", "KV_REST_API_* is configured, but UPSTASH_REDIS_REST_* is absent");
} else {
  addWarn("upstash redis", "not configured; using in-memory rate limit fallback");
}

const requireTurnstile = String(process.env.REQUIRE_TURNSTILE || "").trim() === "1";
const turnstileSiteKeyValue = String(process.env.TURNSTILE_SITE_KEY || "").trim();
const turnstileSecretKeyValue = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
const hasTurnstilePartialConfig = Boolean(turnstileSiteKeyValue || turnstileSecretKeyValue);

if (requireTurnstile || hasTurnstilePartialConfig) {
  const turnstileSiteKey = requireVariable("TURNSTILE_SITE_KEY", "turnstile");
  const turnstileSecretKey = requireVariable("TURNSTILE_SECRET_KEY", "turnstile");
  if (turnstileSiteKey && turnstileSecretKey) {
    addOk("turnstile", "site key and secret key are both present");
  }
} else {
  addOk("turnstile", "disabled; set REQUIRE_TURNSTILE=1 with keys to enable it");
}

if (isPublishedTarget) {
  if (requireTurnstile) {
    addOk("turnstile", "REQUIRE_TURNSTILE=1");
  } else {
    addWarn("turnstile", "Turnstile is disabled in staging/production");
  }

  if (requireExternalRateLimit) {
    addOk("rate limit", "external rate limit is required");
  } else {
    addWarn("rate limit", "external rate limit is disabled; memory fallback is best-effort");
  }

  if (String(process.env.REQUIRE_REQUEST_ORIGIN || "").trim() === "0") {
    addError("origin guard", "REQUIRE_REQUEST_ORIGIN must not be 0 in staging/production");
  } else {
    addOk("origin guard", "request Origin guard is enabled by runtime defaults");
  }
}

if (isProductionTarget) {
  requireVariable("CRON_SECRET", "cron");
  requireUrl("CSP_REPORT_URL", "csp reporting");
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(String(process.env.CONSENT_VERSION || "2026-04-28"))) {
  addError("consent", "CONSENT_VERSION must use YYYY-MM-DD");
} else {
  addOk("consent", `CONSENT_VERSION=${process.env.CONSENT_VERSION || "2026-04-28"}`);
}

console.log(`Runtime env check: target=${target} envFile=${loadedEnvFile}`);
results.forEach((result) => {
  console.log(`[${result.level}] ${result.subject}: ${result.message}`);
});

const errorCount = results.filter((result) => result.level === "error").length;
const warnCount = results.filter((result) => result.level === "warn").length;

if (errorCount > 0) {
  console.error(`Environment check failed: ${errorCount} error(s), ${warnCount} warning(s).`);
  process.exit(1);
}

console.log(`Environment check passed: ${warnCount} warning(s).`);
