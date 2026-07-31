import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number(portArgument?.split("=")[1] || process.env.PORT || 4187);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(root, requested);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw new Error("Invalid path");
    if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Magnet Mayhem test server listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
