"use strict";

process.env.NODE_ENV = "production";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
delete process.env.ENABLE_CANONICAL_REDIRECT;
delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
delete process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION;

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createAppServer } = require("../server");

let server;
let port;

const request = ({ method = "GET", path = "/", headers = {} }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          Host: "cd-central.vercel.app",
          ...headers,
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });

test.before(async () => {
  server = createAppServer();
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("nao redireciona host nao canonico quando redirect canonico esta desligado", async () => {
  const response = await request({ path: "/" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.location, undefined);
  assert.equal(response.headers["x-robots-tag"], "noindex, nofollow, noarchive");
});
