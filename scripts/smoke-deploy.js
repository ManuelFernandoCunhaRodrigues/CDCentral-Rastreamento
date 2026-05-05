"use strict";

const { loadEnvFiles, normalizeOrigin, parseArgs } = require("./lib/env");

const args = parseArgs();
if (!args.url && /^https?:\/\//i.test(String(args._[0] || ""))) {
  args.url = args._[0];
}

try {
  loadEnvFiles(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const baseUrl = String(args.url || process.env.SMOKE_DEPLOY_URL || process.env.SITE_URL || "").replace(/\/$/, "");
const timeoutMs = Number(args.timeout || 10000);
const checks = [];

if (!baseUrl) {
  console.error("Missing deploy URL. Use --url https://example.com or set SITE_URL.");
  process.exit(1);
}

let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(baseUrl);
} catch (error) {
  console.error(`Invalid deploy URL: ${baseUrl}`);
  process.exit(1);
}

const request = async (pathname, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(new URL(pathname, parsedBaseUrl).toString(), {
      redirect: "manual",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const addCheck = (level, label, detail) => {
  checks.push({ level, label, detail });
};

const assertStatus = async (pathname, expectedStatus, label) => {
  let response;
  try {
    response = await request(pathname);
  } catch (error) {
    addCheck("error", label, `${pathname} request failed: ${error.cause?.code || error.message}`);
    return { response: null, body: "" };
  }

  if (response.status !== expectedStatus) {
    addCheck("error", label, `${pathname} returned ${response.status}, expected ${expectedStatus}`);
    return { response, body: "" };
  }

  addCheck("ok", label, `${pathname} returned ${response.status}`);
  return { response, body: await response.text() };
};

(async () => {
  const origin = normalizeOrigin(baseUrl);
  const isLocalUrl = ["localhost", "127.0.0.1", "::1"].includes(parsedBaseUrl.hostname);
  if (!origin || (parsedBaseUrl.protocol !== "https:" && !isLocalUrl)) {
    addCheck("error", "deploy url", "deploy URL must use https outside localhost");
  } else {
    addCheck("ok", "deploy url", origin);
  }

  const home = await assertStatus("/", 200, "home");
  if (home.body && !home.body.includes("<title>CDCentral Rastreamento")) {
    addCheck("error", "home", "home HTML does not contain the expected title");
  }

  try {
    const configResponse = await request("/api/public-config");
    if (configResponse.status !== 200) {
      addCheck("error", "public config", `/api/public-config returned ${configResponse.status}`);
    } else {
      const config = await configResponse.json().catch(() => null);
      if (!config || !config.consentVersion) {
        addCheck("error", "public config", "response is not the expected JSON shape");
      } else {
        addCheck("ok", "public config", `consentVersion=${config.consentVersion}`);
      }
    }
  } catch (error) {
    addCheck("error", "public config", `request failed: ${error.cause?.code || error.message}`);
  }

  try {
    const webpResponse = await request("/assets/images/cdcentral/veiculo-img-480.webp");
    if (webpResponse.status !== 200) {
      addCheck("error", "assets", `optimized WebP returned ${webpResponse.status}`);
    } else {
      const cacheControl = webpResponse.headers.get("cache-control") || "";
      if (!cacheControl.includes("max-age=31536000")) {
        addCheck("warn", "assets", `optimized WebP cache-control is "${cacheControl}"`);
      } else {
        addCheck("ok", "assets", "optimized WebP is public and cacheable");
      }
    }
  } catch (error) {
    addCheck("error", "assets", `request failed: ${error.cause?.code || error.message}`);
  }

  console.log(`Deploy smoke check: ${baseUrl}`);
  checks.forEach((check) => {
    console.log(`[${check.level}] ${check.label}: ${check.detail}`);
  });

  const errorCount = checks.filter((check) => check.level === "error").length;
  const warnCount = checks.filter((check) => check.level === "warn").length;
  if (errorCount > 0) {
    console.error(`Deploy smoke failed: ${errorCount} error(s), ${warnCount} warning(s).`);
    process.exit(1);
  }

  console.log(`Deploy smoke passed: ${warnCount} warning(s).`);
})();
