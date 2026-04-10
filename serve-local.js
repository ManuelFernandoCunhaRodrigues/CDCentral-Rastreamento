const http = require("http");
const fs = require("fs");
const path = require("path");
const leadHandler = require("./api/leads");

const root = path.resolve(__dirname);
const rootBoundary = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
const port = 4173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const loadEnvFile = (filename) => {
  const filePath = path.join(root, filename);
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
loadEnvFile(".env.local");

http
  .createServer((req, res) => {
    let rawPath = "/";

    try {
      rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch (error) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    if (rawPath === "/api/leads") {
      Promise.resolve(leadHandler(req, res)).catch((error) => {
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            message: error.message || "Falha inesperada ao processar o lead.",
          })
        );
      });
      return;
    }

    const requestedPath = rawPath === "/" ? "/index.html" : rawPath;
    const relativePath = requestedPath.replace(/^[/\\]+/, "");
    const filePath = path.resolve(root, relativePath);

    if (!filePath.toLowerCase().startsWith(rootBoundary.toLowerCase())) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": types[ext] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Local server running at http://127.0.0.1:${port}`);
  });
