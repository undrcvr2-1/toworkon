const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const publicDirectory = path.join(__dirname, "public");
const assetDirectory = path.resolve(__dirname, "..", "..", "assets");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendFile(request, response, pathname) {
  let baseDirectory = publicDirectory;
  let relativePath;

  try {
    if (pathname.startsWith("/assets/")) {
      baseDirectory = assetDirectory;
      relativePath = decodeURIComponent(pathname.slice("/assets/".length));
    } else {
      relativePath = decodeURIComponent(pathname === "/" ? "index.html" : pathname.slice(1));
    }
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const filePath = path.resolve(baseDirectory, relativePath);
  const relative = path.relative(baseDirectory, filePath);

  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": path.extname(filePath).toLowerCase() === ".html" || path.extname(filePath).toLowerCase() === ".json" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(500);
      }
      response.end("Server error");
    });
    stream.pipe(response);
  });
}

const server = http.createServer((request, response) => {
  let pathname;

  try {
    const address = new URL(request.url, "http://" + (request.headers.host || "localhost"));
    pathname = address.pathname;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "zarad-website"
    });
    return;
  }

  if (pathname === "/catalog" || pathname === "/catalog/") {
    pathname = "/catalog.html";
  }

  sendFile(request, response, pathname);
});

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number");
}

server.listen(port, host, () => {
  process.stdout.write("Zarad is running at http://" + host + ":" + port + "\n");
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
