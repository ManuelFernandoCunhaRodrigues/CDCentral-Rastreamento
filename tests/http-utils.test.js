"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const {
  HttpError,
  anonymizeIp,
  createRateLimiter,
  getClientIp,
  getRateLimiterStatus,
  isJsonContentType,
  normalizeIpCandidate,
  readJsonBody,
} = require("../lib/http-utils");

const createRequestStream = (body, headers = {}, method = "POST") => {
  const req = new PassThrough();
  req.headers = headers;
  req.method = method;
  process.nextTick(() => req.end(body));
  return req;
};

test("reconhece content types JSON e variantes +json", () => {
  assert.equal(isJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(isJsonContentType("application/problem+json"), true);
  assert.equal(isJsonContentType("text/plain"), false);
});

test("normaliza IPs de socket e proxy sem aceitar valores invalidos", () => {
  assert.equal(normalizeIpCandidate("::ffff:192.168.0.10"), "192.168.0.10");
  assert.equal(normalizeIpCandidate("[::1]:3000"), "::1");
  assert.equal(normalizeIpCandidate("not-an-ip"), "");

  const req = {
    headers: {
      "x-forwarded-for": "203.0.113.10, 198.51.100.20",
      "x-real-ip": "198.51.100.99",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
  };

  assert.equal(getClientIp(req), "127.0.0.1");
  assert.equal(getClientIp(req, { trustProxyHeaders: true }), "203.0.113.10");
});

test("anonimiza IPs para registro de consentimento", () => {
  assert.equal(anonymizeIp("203.0.113.45"), "203.0.113.0");
  assert.equal(anonymizeIp("2001:0db8:abcd:0012:0000:0000:0000:0001"), "2001:db8:abcd:12::/64");
  assert.equal(anonymizeIp("unknown"), "unknown");
  assert.equal(anonymizeIp(""), "unknown");
});

test("le corpo JSON valido respeitando limite de tamanho", async () => {
  const req = createRequestStream(JSON.stringify({ ok: true }), {
    "content-type": "application/json",
  });

  assert.deepEqual(await readJsonBody(req, { limitBytes: 64 }), { ok: true });
});

test("rejeita content type incorreto, JSON nao objeto e payload grande", async () => {
  await assert.rejects(
    () => readJsonBody(createRequestStream("{}", { "content-type": "text/plain" })),
    (error) => error instanceof HttpError && error.statusCode === 415
  );

  await assert.rejects(
    () => readJsonBody(createRequestStream("[]", { "content-type": "application/json" })),
    (error) => error instanceof HttpError && error.code === "invalid_json_object"
  );

  await assert.rejects(
    () =>
      readJsonBody(
        createRequestStream("{}", {
          "content-type": "application/json",
          "content-length": "1024",
        }, "POST"),
        { limitBytes: 8 }
      ),
    (error) => error instanceof HttpError && error.statusCode === 413
  );
});

test("rate limiter falha fechado em producao sem Upstash", async () => {
  const previousEnv = { ...process.env };

  try {
    process.env.NODE_ENV = "production";
    process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "0";
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "kv-token-test";
    delete process.env.VERCEL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION;

    const status = getRateLimiterStatus();
    assert.equal(status.configured, false);
    assert.equal(status.productionSafe, false);

    const limiter = createRateLimiter({
      windowMs: 1000,
      maxRequests: 1,
      requireExternalInProduction: true,
    });

    await assert.rejects(
      () => limiter("203.0.113.10"),
      (error) => error instanceof HttpError && error.code === "missing_rate_limiter_config"
    );
  } finally {
    process.env = previousEnv;
  }
});
