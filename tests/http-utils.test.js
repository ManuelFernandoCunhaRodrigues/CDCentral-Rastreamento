"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { HttpError, getClientIp, isJsonContentType, normalizeIpCandidate, readJsonBody } = require("../lib/http-utils");

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
