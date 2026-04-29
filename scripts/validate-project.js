"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");

const jsFiles = [
  "server.js",
  "api/csp-report.js",
  "api/leads.js",
  "api/public-config.js",
  "lib/app-config.js",
  "lib/http-utils.js",
  "lib/leads-service.js",
  "public/assets/js/script.js",
  "scripts/update-csp-hash.js",
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
  "assets/images/cdcentral/frota-img.png",
  "assets/images/cdcentral/veiculo-img.webp",
  "assets/images/cdcentral/veiculo-img.png",
  "assets/images/cdcentral/tela-cdcentral-br-celular.png",
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

jsFiles.forEach(ensureFile);
requiredPublicFiles.forEach((filePath) => ensureFile(path.join("public", filePath)));

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

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Projeto validado com sucesso.");
