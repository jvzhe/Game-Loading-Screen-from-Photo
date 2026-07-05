const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);

loadEnvFile(path.join(ROOT_DIR, ".env"));
loadEnvFile(path.join(ROOT_DIR, ".env.local"));

const generateHandler = require("./api/generate");
const taskHandler = require("./api/task/[id]");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === "/api/generate") {
      const body = await readJsonBody(req);
      await invokeHandler(generateHandler, req, res, { body, query: queryToObject(requestUrl.searchParams) });
      return;
    }

    if (pathname.startsWith("/api/task/")) {
      const id = pathname.slice("/api/task/".length);
      await invokeHandler(taskHandler, req, res, {
        body: null,
        query: { ...queryToObject(requestUrl.searchParams), id }
      });
      return;
    }

    await serveStatic(pathname, res);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ error: "Local dev server error", detail: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Local dev server running at http://localhost:${PORT}`);
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = stripWrappingQuotes(value);
    }
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function queryToObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "HEAD") {
      resolve(null);
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

async function invokeHandler(handler, req, res, extras) {
  req.body = extras.body;
  req.query = extras.query;

  const wrappedRes = createResponseWrapper(res);
  await handler(req, wrappedRes);

  if (!wrappedRes.finished) {
    wrappedRes.end();
  }
}

function createResponseWrapper(nodeRes) {
  return {
    headersSent: false,
    finished: false,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
      this.headersSent = true;
      return this;
    },
    json(payload) {
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(this.statusCode, { "Content-Type": "application/json; charset=utf-8" });
      }
      nodeRes.end(JSON.stringify(payload));
      this.headersSent = true;
      this.finished = true;
      return this;
    },
    send(payload) {
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(this.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      }
      nodeRes.end(payload);
      this.headersSent = true;
      this.finished = true;
      return this;
    },
    end(payload = "") {
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(this.statusCode);
      }
      nodeRes.end(payload);
      this.headersSent = true;
      this.finished = true;
      return this;
    }
  };
}

async function serveStatic(pathname, res) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const normalizedPath = path.normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  if (stat.isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": getCacheControl(ext)
  };

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function getCacheControl(ext) {
  if (ext === ".html") {
    return "no-cache";
  }

  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".js", ".css", ".json", ".ico"].includes(ext)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600";
}
