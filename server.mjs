import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.cwd();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(ROOT, `.${pathname}`);
  const relativePath = path.relative(ROOT, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

const server = createServer(async (req, res) => {
  if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const filePath = resolveRequestPath(req.url);

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    const body = await readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FreeBodyDiagram running at http://localhost:${PORT}`);
  console.log(`LAN access: http://<your-local-IP>:${PORT}`);
});
