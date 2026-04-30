"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const indexPath = path.join(publicRoot, "index.html");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const jsonLdMatch = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);

if (!jsonLdMatch) {
  throw new Error("JSON-LD script block not found in public/index.html.");
}

const hash = crypto.createHash("sha256").update(jsonLdMatch[1]).digest("base64");
const hashDirective = `'sha256-${hash}'`;
console.log(`Content-Security-Policy JSON-LD hash: ${hashDirective}`);
console.log("server.js computes the CSP hash at startup; vercel.json does not define CSP headers.");
