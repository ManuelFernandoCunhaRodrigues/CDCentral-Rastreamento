"use strict";

const { isIP } = require("net");

class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code || "http_error";
  }
}

const isPlainJsonObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const ensureJsonObject = (value) => {
  if (!isPlainJsonObject(value)) {
    throw new HttpError(400, "JSON deve ser um objeto.", "invalid_json_object");
  }

  return value;
};

const parseJson = (value) => {
  try {
    return ensureJsonObject(value ? JSON.parse(value) : {});
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(400, "JSON invalido no corpo da requisicao.", "invalid_json");
  }
};

const getSerializedBodyBytes = (value) => {
  try {
    return Buffer.byteLength(JSON.stringify(value) || "", "utf8");
  } catch (error) {
    throw new HttpError(400, "JSON invalido no corpo da requisicao.", "invalid_json");
  }
};

const isJsonContentType = (value) => {
  const mediaType = String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  return mediaType === "application/json" || mediaType.endsWith("+json");
};

const normalizeIpCandidate = (value) => {
  let candidate = String(value || "").trim().replace(/^"|"$/g, "");
  if (!candidate) {
    return "";
  }

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else {
    const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    if (ipv4WithPort) {
      candidate = ipv4WithPort[1];
    }
  }

  candidate = candidate.replace(/^::ffff:/i, "");
  return isIP(candidate) ? candidate : "";
};

const getForwardedForIp = (headerValue) => {
  return (
    String(headerValue || "")
      .split(",")
      .map(normalizeIpCandidate)
      .find(Boolean) || ""
  );
};

const getClientIp = (req, { trustProxyHeaders = false } = {}) => {
  const socketIp = normalizeIpCandidate(req.socket?.remoteAddress);

  if (trustProxyHeaders) {
    return (
      getForwardedForIp(req.headers["x-forwarded-for"]) ||
      normalizeIpCandidate(req.headers["x-real-ip"]) ||
      socketIp ||
      "unknown"
    );
  }

  return socketIp || "unknown";
};

const expandIpv6Blocks = (value) => {
  const normalizedIp = String(value || "").toLowerCase();
  const [head = "", tail = ""] = normalizedIp.split("::");
  const headBlocks = head ? head.split(":") : [];
  const tailBlocks = tail ? tail.split(":") : [];
  const missingBlocks = Math.max(8 - headBlocks.length - tailBlocks.length, 0);

  return [...headBlocks, ...Array(missingBlocks).fill("0"), ...tailBlocks].slice(0, 8);
};

const normalizeIpv6Block = (value) => {
  const normalizedBlock = String(value || "0").replace(/^0+/, "");
  return normalizedBlock || "0";
};

const anonymizeIp = (ip) => {
  const rawIp = String(ip || "").trim();
  if (!rawIp || rawIp.toLowerCase() === "unknown") {
    return "unknown";
  }

  const normalizedIp = normalizeIpCandidate(rawIp);
  if (!normalizedIp) {
    return "unknown";
  }

  if (isIP(normalizedIp) === 4) {
    const blocks = normalizedIp.split(".");
    blocks[3] = "0";
    return blocks.join(".");
  }

  if (isIP(normalizedIp) === 6) {
    return `${expandIpv6Blocks(normalizedIp).slice(0, 4).map(normalizeIpv6Block).join(":")}::/64`;
  }

  return "unknown";
};

const readJsonBody = async (req, options = {}) => {
  const limitBytes = options.limitBytes || 16 * 1024;
  const contentType = req.headers["content-type"] || "";

  if (req.method !== "GET" && req.method !== "HEAD" && !isJsonContentType(contentType)) {
    throw new HttpError(415, "Formato de requisicao nao suportado.", "unsupported_media_type");
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
  }

  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limitBytes) {
      throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
    }
    return parseJson(req.body.toString("utf8"));
  }

  if (req.body && typeof req.body === "object") {
    ensureJsonObject(req.body);
    if (getSerializedBodyBytes(req.body) > limitBytes) {
      throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
    }
    return req.body;
  }

  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > limitBytes) {
      throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
    }
    return parseJson(req.body);
  }

  return new Promise((resolve, reject) => {
    let rawBody = "";
    let receivedBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) {
        return;
      }

      receivedBytes += chunk.length;
      if (receivedBytes > limitBytes) {
        rejected = true;
        reject(new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large"));
        return;
      }

      rawBody += chunk;
    });

    req.on("end", () => {
      if (!rejected) {
        try {
          resolve(parseJson(rawBody));
        } catch (error) {
          reject(error);
        }
      }
    });

    req.on("error", (error) => {
      if (!rejected) {
        reject(error);
      }
    });
  });
};

const REDIS_RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
redis.call("ZADD", key, now, member)
local count = redis.call("ZCARD", key)
redis.call("PEXPIRE", key, window)

return count
`;

let redisClient;
let redisRateLimitScript;

const isProductionRuntime = () => process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

const getRedisConfig = () => {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || "";
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";

  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken };
  }

  if (isProductionRuntime()) {
    return null;
  }

  const url = process.env.KV_REST_API_URL || "";
  const token = process.env.KV_REST_API_TOKEN || "";

  return url && token ? { url, token } : null;
};

const hasRedisRateLimitConfig = () => Boolean(getRedisConfig());

const shouldUseMemoryRateLimitFallback = ({ requireExternalInProduction = true } = {}) => {
  if (!isProductionRuntime()) {
    return true;
  }

  if (!requireExternalInProduction) {
    return true;
  }

  return process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION === "1";
};

const getRateLimiterStatus = () => {
  const hasRedis = hasRedisRateLimitConfig();
  const usesMemoryFallback =
    !hasRedis &&
    shouldUseMemoryRateLimitFallback({
      requireExternalInProduction: true,
    });

  return {
    backend: hasRedis ? "upstash-redis" : "memory",
    configured: hasRedis || usesMemoryFallback,
    productionSafe: hasRedis || !isProductionRuntime(),
  };
};

const getRedisRateLimitScript = () => {
  if (redisRateLimitScript) {
    return redisRateLimitScript;
  }

  const config = getRedisConfig();
  if (!config) {
    return null;
  }

  try {
    const { Redis } = require("@upstash/redis");
    redisClient = redisClient || new Redis(config);
    redisRateLimitScript = redisClient.createScript(REDIS_RATE_LIMIT_SCRIPT);
    return redisRateLimitScript;
  } catch (error) {
    throw new HttpError(500, "Rate limiter indisponivel.", "rate_limiter_setup_failed");
  }
};

const createMemoryRateLimiter = ({ windowMs, maxRequests, maxKeys }) => {
  const requestStore = new Map();

  const pruneStore = (now, currentKey) => {
    if (requestStore.size <= maxKeys) {
      return;
    }

    for (const [storeKey, timestamps] of requestStore.entries()) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        requestStore.delete(storeKey);
      }
    }

    if (requestStore.size <= maxKeys) {
      return;
    }

    const keysByOldestAttempt = [...requestStore.entries()]
      .filter(([storeKey]) => storeKey !== currentKey)
      .sort(([, a], [, b]) => (a[0] || 0) - (b[0] || 0))
      .map(([storeKey]) => storeKey);

    for (const storeKey of keysByOldestAttempt) {
      if (requestStore.size <= maxKeys) {
        break;
      }
      requestStore.delete(storeKey);
    }
  };

  return (key) => {
    const now = Date.now();
    const normalizedKey = key || "unknown";
    const attempts = (requestStore.get(normalizedKey) || []).filter((timestamp) => now - timestamp < windowMs);

    attempts.push(now);
    requestStore.set(normalizedKey, attempts);
    pruneStore(now, normalizedKey);

    return attempts.length > maxRequests;
  };
};

const createRateLimiter = ({
  windowMs,
  maxRequests,
  keyPrefix = "",
  maxKeys = 5000,
  requireExternalInProduction = true,
}) => {
  const memoryRateLimiter = createMemoryRateLimiter({ windowMs, maxRequests, maxKeys });

  return async (key) => {
    const normalizedKey = `${keyPrefix}${key || "unknown"}`;
    const redisScript = getRedisRateLimitScript();

    if (!redisScript) {
      if (
        !shouldUseMemoryRateLimitFallback({
          requireExternalInProduction,
        })
      ) {
        throw new HttpError(503, "Rate limiter indisponivel.", "missing_rate_limiter_config");
      }

      return memoryRateLimiter(normalizedKey);
    }

    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2)}`;

    try {
      const attempts = await redisScript.eval([normalizedKey], [String(now), String(windowMs), member]);
      return Number(attempts) > maxRequests;
    } catch (error) {
      throw new HttpError(503, "Rate limiter indisponivel.", "rate_limiter_unavailable");
    }
  };
};

module.exports = {
  HttpError,
  anonymizeIp,
  createRateLimiter,
  getClientIp,
  getRateLimiterStatus,
  isJsonContentType,
  normalizeIpCandidate,
  readJsonBody,
};
