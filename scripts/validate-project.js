"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const vercelConfigPath = path.join(root, "vercel.json");
const canonicalSiteUrl = "https://cdcentralrastreamento.com.br";
const legacyPreviewUrl = "https://cd-central.vercel.app";

const rootFiles = [
  "package.json",
  "vercel.json",
];

const jsFiles = [
  "server.js",
  "api/csp-report.js",
  "api/leads.js",
  "api/public-config.js",
  "lib/app-config.js",
  "lib/http-utils.js",
  "lib/leads-service.js",
  "public/assets/js/script.js",
  "scripts/lib/env.js",
  "scripts/optimize-images.js",
  "scripts/smoke-deploy.js",
  "scripts/smoke-supabase-lead.js",
  "scripts/update-csp-hash.js",
  "scripts/validate-runtime-env.js",
  "scripts/validate-project.js",
];

const htmlFiles = [
  "public/index.html",
  "public/politica-de-privacidade.html",
  "public/termos-de-uso.html",
];

const requiredPublicFiles = [
  "index.html",
  "politica-de-privacidade.html",
  "termos-de-uso.html",
  "robots.txt",
  "sitemap.xml",
  ".well-known/security.txt",
  "assets/css/styles.css",
  "assets/js/script.js",
  "assets/fonts/manrope-latin.woff2",
  "assets/fonts/sora-latin.woff2",
  "assets/images/cdcentral/LOGO DES.png",
  "assets/images/cdcentral/footer-logo.png",
  "assets/images/cdcentral/frota-img.webp",
  "assets/images/cdcentral/frota-img-480.webp",
  "assets/images/cdcentral/frota-img.png",
  "assets/images/cdcentral/veiculo-img.webp",
  "assets/images/cdcentral/veiculo-img-480.webp",
  "assets/images/cdcentral/veiculo-img.png",
  "assets/images/cdcentral/tela-cdcentral-br-celular.png",
  "assets/images/cdcentral/tela-cdcentral-br-celular.webp",
  "assets/images/cdcentral/tela-cdcentral-br-celular-320.webp",
];

const imageSizeBudgets = [
  ["public/assets/images/cdcentral/veiculo-img.png", 220 * 1024],
  ["public/assets/images/cdcentral/frota-img.png", 220 * 1024],
  ["public/assets/images/cdcentral/tela-cdcentral-br-celular.png", 320 * 1024],
  ["public/assets/images/cdcentral/veiculo-img.webp", 160 * 1024],
  ["public/assets/images/cdcentral/veiculo-img-480.webp", 80 * 1024],
  ["public/assets/images/cdcentral/frota-img.webp", 160 * 1024],
  ["public/assets/images/cdcentral/frota-img-480.webp", 80 * 1024],
  ["public/assets/images/cdcentral/tela-cdcentral-br-celular.webp", 140 * 1024],
  ["public/assets/images/cdcentral/tela-cdcentral-br-celular-320.webp", 80 * 1024],
];

const seoChecks = [
  ["title", /<title>[^<]+<\/title>/i],
  ["description", /<meta\s+name="description"\s+content="[^"]+"/i],
  ["canonical", /<link\s+rel="canonical"\s+href="[^"]+"/i],
  ["og:title", /<meta\s+property="og:title"\s+content="[^"]+"/i],
  ["og:image", /<meta\s+property="og:image"\s+content="[^"]+"/i],
  ["twitter:image", /<meta\s+name="twitter:image"\s+content="[^"]+"/i],
  ["favicon", /<link\s+rel="icon"\s+href="[^"]+"/i],
];

const errors = [];

const ensureFile = (relativePath) => {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    errors.push(`Arquivo ausente: ${relativePath}`);
  }
};

rootFiles.forEach(ensureFile);
jsFiles.forEach(ensureFile);
requiredPublicFiles.forEach((filePath) => ensureFile(path.join("public", filePath)));

imageSizeBudgets.forEach(([relativePath, maxBytes]) => {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const size = fs.statSync(filePath).size;
  if (size > maxBytes) {
    errors.push(
      `${relativePath}: imagem acima do limite (${Math.round(size / 1024)}KB > ${Math.round(maxBytes / 1024)}KB)`
    );
  }
});

htmlFiles.forEach((relativePath) => {
  ensureFile(relativePath);
  if (!fs.existsSync(path.join(root, relativePath))) {
    return;
  }

  const html = fs.readFileSync(path.join(root, relativePath), "utf8");
  seoChecks.forEach(([label, pattern]) => {
    if (!pattern.test(html)) {
      errors.push(`${relativePath}: SEO obrigatório ausente (${label})`);
    }
  });
});

const toPublicFile = (fromHtml, reference) => {
  if (!reference || reference.startsWith("#") || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(reference)) {
    return "";
  }

  let cleanReference = reference.split("#")[0].split("?")[0];
  if (!cleanReference) {
    return "";
  }

  try {
    cleanReference = decodeURI(cleanReference);
  } catch (error) {
    errors.push(`${fromHtml}: referência local com URL inválida (${reference})`);
    return "";
  }

  const fromPublicPath = path.relative(publicRoot, path.join(root, fromHtml));
  const fromDir = path.dirname(fromPublicPath);
  return cleanReference.startsWith("/")
    ? path.join(publicRoot, cleanReference)
    : path.join(publicRoot, fromDir, cleanReference);
};

htmlFiles.forEach((relativePath) => {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const html = fs.readFileSync(filePath, "utf8");
  for (const match of html.matchAll(/(?:href|src|srcset)=["']([^"']+)["']/gi)) {
    const values = match[1].split(",").map((entry) => entry.trim().split(/\s+/)[0]);
    values.forEach((value) => {
      const publicFile = toPublicFile(relativePath, value);
      if (publicFile && !fs.existsSync(publicFile)) {
        errors.push(`${relativePath}: referência local ausente (${value})`);
      }
    });
  }
});

const cssPath = path.join(publicRoot, "assets/css/styles.css");
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, "utf8");
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
    const value = match[1];
    if (/^(https?:|data:)/i.test(value)) {
      continue;
    }

    const assetPath = path.join(path.dirname(cssPath), value);
    if (!fs.existsSync(assetPath)) {
      errors.push(`public/assets/css/styles.css: referência local ausente (${value})`);
    }
  }
}

const getJsonLdHashDirective = (html) => {
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!jsonLdMatch) {
    return "";
  }

  const crypto = require("crypto");
  return `'sha256-${crypto.createHash("sha256").update(jsonLdMatch[1]).digest("base64")}'`;
};

const canonicalFiles = [
  "public/index.html",
  "public/politica-de-privacidade.html",
  "public/termos-de-uso.html",
  "public/robots.txt",
  "public/sitemap.xml",
  "public/.well-known/security.txt",
];

canonicalFiles.forEach((relativePath) => {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes(legacyPreviewUrl)) {
    errors.push(`${relativePath}: dominio canonico antigo encontrado (${legacyPreviewUrl})`);
  }

  if (!content.includes(canonicalSiteUrl)) {
    errors.push(`${relativePath}: dominio canonico ausente (${canonicalSiteUrl})`);
  }
});

if (fs.existsSync(vercelConfigPath)) {
  let vercelConfig = {};

  try {
    vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
  } catch (error) {
    errors.push("vercel.json: JSON invalido");
  }

  (vercelConfig.rewrites || []).forEach((rewrite) => {
    if (String(rewrite.destination || "").startsWith("/public/")) {
      errors.push(`vercel.json: rewrite aponta para /public em vez da raiz publica (${rewrite.source})`);
    }
  });

  const forbiddenVercelHeaderKeys = new Set(["Content-Security-Policy", "Content-Security-Policy-Report-Only", "Report-To"]);
  const nodeOwnedHeaders = (vercelConfig.headers || [])
    .flatMap((entry) => entry.headers || [])
    .filter((entry) => forbiddenVercelHeaderKeys.has(entry.key));

  nodeOwnedHeaders.forEach((header) => {
    errors.push(`vercel.json: ${header.key} deve ser servido pelo handler Node`);
  });

  const indexPath = path.join(publicRoot, "index.html");
  if (fs.existsSync(indexPath)) {
    const expectedHashDirective = getJsonLdHashDirective(fs.readFileSync(indexPath, "utf8"));

    if (!expectedHashDirective) {
      errors.push("public/index.html: JSON-LD ausente para hash CSP");
    }

    const serverPath = path.join(root, "server.js");
    const serverSource = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, "utf8") : "";
    if (!serverSource.includes("getJsonLdHashDirective")) {
      errors.push("server.js: CSP deve calcular o hash JSON-LD no handler Node");
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Projeto validado com sucesso.");
