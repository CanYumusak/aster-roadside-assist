import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import serverEntry from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 18082);
const host = process.env.HOST ?? "127.0.0.1";
const clientDir = resolve(import.meta.dirname, "dist/client");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

createServer(async (req, res) => {
  try {
    if (await tryServeStatic(req, res)) return;

    const response = await serverEntry.fetch(toFetchRequest(req), process.env, {});
    await writeFetchResponse(res, response);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log(`Aster observer listening on http://${host}:${port}`);
});

async function tryServeStatic(req, res) {
  if (!req.url || !["GET", "HEAD"].includes(req.method ?? "")) return false;

  const pathname = new URL(req.url, "http://localhost").pathname;
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(clientDir, relativePath === "/" ? "index.html" : relativePath);
  if (!filePath.startsWith(clientDir)) return false;

  try {
    const file = await stat(filePath);
    if (!file.isFile()) return false;
    res.writeHead(200, {
      "content-length": file.size,
      "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    });
    if (req.method === "HEAD") {
      res.end();
    } else {
      createReadStream(filePath).pipe(res);
    }
    return true;
  } catch {
    return false;
  }
}

function toFetchRequest(req) {
  const origin = `http://${req.headers.host ?? `${host}:${port}`}`;
  const init = {
    method: req.method,
    headers: req.headers,
  };
  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    init.body = req;
    init.duplex = "half";
  }
  return new Request(new URL(req.url ?? "/", origin), init);
}

async function writeFetchResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}
