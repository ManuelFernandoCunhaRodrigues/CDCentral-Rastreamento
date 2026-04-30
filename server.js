"use strict";

const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const { getClientIp } = require("./lib/http-utils");

const workspaceRoot = path.resolve(__dirname);
const publicRoot = path.join(workspaceRoot, "public");
const publicRootBoundary = publicRoot.endsWith(path.sep) ? publicRoot : `${publicRoot}${path.sep}`;

const loadEnvFile = (filename) => {
  const filePath = path.join(workspaceRoot, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(".env");

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (!IS_PRODUCTION) {
  loadEnvFile(".env.local");
}

const leadHandler = require("./api/leads");
const publicConfigHandler = require("./api/public-config");
const cspReportHandler = require("./api/csp-report");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const SERVICE_NAME = "cdcentral-rastreamento";
const GENERIC_ERROR_MESSAGE = "Nao foi possivel processar sua solicitacao agora.";
const SHUTDOWN_TIMEOUT_MS = 10000;
const DEFAULT_SITE_URL = "https://cdcentralrastreamento.com.br";

const PUBLIC_FILES = new Set([
  "index.html",
  "assets/css/styles.css",
  "assets/js/script.js",
  "politica-de-privacidade.html",
  "termos-de-uso.html",
  "robots.txt",
  "sitemap.xml",
  ".well-known/security.txt",
]);

const PUBLIC_DIRECTORIES = [
  {
    prefix: "assets/images/cdcentral/",
    extensions: new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"]),
  },
  {
    prefix: "assets/fonts/",
    extensions: new Set([".woff", ".woff2"]),
  },
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const API_HANDLERS = new Map([
  ["/api/leads", leadHandler],
  ["/api/public-config", publicConfigHandler],
  ["/api/csp-report", cspReportHandler],
]);

const getRequestClientIp = (req) => getClientIp(req, { trustProxyHeaders: process.env.TRUST_PROXY_HEADERS === "1" });

const getSiteOrigin = () => {
  try {
    const siteUrl = new URL(process.env.SITE_URL || DEFAULT_SITE_URL);
    return `${siteUrl.protocol}//${siteUrl.host}`;
  } catch (error) {
    return DEFAULT_SITE_URL;
  }
};

const getCanonicalHost = () => {
  try {
    return new URL(getSiteOrigin()).host.toLowerCase();
  } catch (error) {
    return new URL(DEFAULT_SITE_URL).host.toLowerCase();
  }
};

let cachedJsonLdHashDirective;

const getJsonLdHashDirective = () => {
  if (cachedJsonLdHashDirective !== undefined) {
    return cachedJsonLdHashDirective;
  }

  try {
    const indexHtml = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
    const jsonLdMatch = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
    cachedJsonLdHashDirective = jsonLdMatch
      ? `'sha256-${crypto.createHash("sha256").update(jsonLdMatch[1]).digest("base64")}'`
      : "";
  } catch (error) {
    cachedJsonLdHashDirective = "";
  }

  return cachedJsonLdHashDirective;
};

const getRequestHost = (req) => {
  return String(req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
};

const getCsp = ({ reportOnly = false } = {}) => {
  const jsonLdHashDirective = getJsonLdHashDirective();
  const scriptSrc = ["script-src 'self'", "https://challenges.cloudflare.com", jsonLdHashDirective]
    .filter(Boolean)
    .join(" ");

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    scriptSrc,
    "script-src-attr 'none'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "media-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
  ];

  if (IS_PRODUCTION && !reportOnly) {
    directives.push("upgrade-insecure-requests");
  }

  if (reportOnly) {
    directives.push("report-uri /api/csp-report", "report-to default");
  }

  return directives.join("; ");
};

const getSecurityHeaders = (req) => {
  const cspReportUrl = `${getSiteOrigin()}/api/csp-report`;
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), xr-spatial-tracking=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Content-Security-Policy": getCsp(),
    "Content-Security-Policy-Report-Only": getCsp({ reportOnly: true }),
    "Reporting-Endpoints": `default="${cspReportUrl}"`,
    "Report-To": JSON.stringify({
      group: "default",
      max_age: 10886400,
      endpoints: [{ url: cspReportUrl }],
      include_subdomains: true,
    }),
  };

  if (IS_PRODUCTION) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  const host = getRequestHost(req);
  if (host && host !== getCanonicalHost()) {
    headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
  }

  return headers;
};

const toPosixPath = (value) => String(value || "").replace(/\\/g, "/");

const isPublicStaticPath = (relativePath) => {
  const publicPath = toPosixPath(relativePath);
  const ext = path.extname(publicPath).toLowerCase();

  return (
    PUBLIC_FILES.has(publicPath) ||
    PUBLIC_DIRECTORIES.some((directory) => publicPath.startsWith(directory.prefix) && directory.extensions.has(ext))
  );
};

const getCacheControl = (publicPath) => {
  if (publicPath === "robots.txt" || publicPath === "sitemap.xml" || publicPath === ".well-known/security.txt") {
    return "public, max-age=3600";
  }

  const ext = path.extname(publicPath).toLowerCase();
  if ([".css", ".js"].includes(ext)) {
    return "no-cache";
  }

  if ([".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico", ".woff", ".woff2"].includes(ext)) {
    return "public, max-age=31536000, immutable";
  }

  if (ext === ".html") {
    return "no-cache";
  }

  return "no-store";
};

const sendBody = (req, res, statusCode, body, headers = {}) => {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8");
  res.writeHead(statusCode, {
    ...getSecurityHeaders(req),
    ...headers,
    "Content-Length": payload.length,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  res.end(payload);
};

const sendText = (req, res, statusCode, message, extraHeaders = {}) => {
  sendBody(req, res, statusCode, message, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
};

const sendJson = (req, res, statusCode, payload, extraHeaders = {}) => {
  sendBody(req, res, statusCode, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
};

const logSafeError = (label, error) => {
  const details = {
    name: error?.name || "Error",
    code: error?.code || "unexpected_error",
    message: error?.message || GENERIC_ERROR_MESSAGE,
  };

  if (!IS_PRODUCTION && error?.stack) {
    details.stack = error.stack;
  }

  console.error(label, details);
};

const attachRequestLogger = (req, res, pathname) => {
  const startedAt = process.hrtime.bigint();
  const originalEnd = res.end;
  let logged = false;

  res.end = function endWithLog(...args) {
    const result = originalEnd.apply(this, args);

    if (!logged) {
      logged = true;
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${pathname} ${res.statusCode} ${durationMs}ms ip=${getRequestClientIp(req)}`
      );
    }

    return result;
  };
};

const resolveRequestPath = (req) => {
  const parsedUrl = new URL(req.url || "/", "http://localhost");
  return decodeURIComponent(parsedUrl.pathname);
};

const handleHealth = (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(req, res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  sendJson(req, res, 200, {
    status: "ok",
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV,
  });
};

const handleApi = async (req, res, pathname) => {
  const handler = API_HANDLERS.get(pathname);

  if (!handler) {
    sendJson(req, res, 404, {
      message: "Rota nao encontrada.",
    });
    return;
  }

  try {
    await Promise.resolve(handler(req, res));
  } catch (error) {
    logSafeError("API route error:", error);

    if (!res.writableEnded) {
      sendJson(req, res, 500, {
        message: IS_PRODUCTION ? GENERIC_ERROR_MESSAGE : error.message || GENERIC_ERROR_MESSAGE,
      });
    }
  }
};

const handleStatic = (req, res, pathname) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(req, res, 405, "Metodo nao permitido.");
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = requestedPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(publicRoot, relativePath);

  if (!filePath.toLowerCase().startsWith(publicRootBoundary.toLowerCase())) {
    sendText(req, res, 403, "Acesso negado.");
    return;
  }

  const publicPath = toPosixPath(path.relative(publicRoot, filePath));
  if (!isPublicStaticPath(publicPath)) {
    sendText(req, res, 404, "Arquivo nao encontrado.");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(req, res, 404, "Arquivo nao encontrado.");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    sendBody(req, res, 200, data, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": getCacheControl(publicPath),
    });
  });
};

const handleRequest = (req, res) => {
  let pathname = "/";

  try {
    pathname = resolveRequestPath(req);
  } catch (error) {
    attachRequestLogger(req, res, "/");
    sendText(req, res, 400, "Requisicao invalida.");
    return;
  }

  attachRequestLogger(req, res, pathname);

  if (pathname === "/health" || pathname === "/healthz") {
    handleHealth(req, res);
    return;
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((error) => {
      logSafeError("Unhandled API error:", error);

      if (!res.writableEnded) {
        sendJson(req, res, 500, {
          message: IS_PRODUCTION ? GENERIC_ERROR_MESSAGE : error.message || GENERIC_ERROR_MESSAGE,
        });
      }
    });
    return;
  }

  handleStatic(req, res, pathname);
};

const createAppServer = () => http.createServer(handleRequest);

let server;

const startServer = () => {
  if (server) {
    return server;
  }

  server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em ${HOST}:${PORT}`);
  });

  return server;
};

const gracefulShutdown = (signal) => {
  if (!server) {
    process.exit(0);
    return;
  }

  console.log(`[${new Date().toISOString()}] Recebido ${signal}. Encerrando servidor...`);
  const timeout = setTimeout(() => {
    console.error("Encerramento excedeu o tempo limite.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timeout.unref();

  server.close((error) => {
    clearTimeout(timeout);
    if (error) {
      logSafeError("Erro ao encerrar servidor:", error);
      process.exit(1);
      return;
    }

    console.log("Servidor encerrado com sucesso.");
    process.exit(0);
  });
};

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (error) => {
  logSafeError("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  logSafeError("Uncaught exception:", error);
  gracefulShutdown("uncaughtException");
});

if (require.main === module) {
  startServer();
}

module.exports = Object.assign(handleRequest, {
  createAppServer,
  startServer,
});
