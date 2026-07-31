import { mkdir, readFile, writeFile } from "node:fs/promises";

const fileNames = [
  "index.html",
  "styles.css",
  "game.js",
  "poki-wrapper.js",
  "save-system.js",
  "localization/en.js",
  "levels/base-game.js",
  "expansions/expansion-registry.js"
];

const files = Object.fromEntries(await Promise.all(
  fileNames.map(async (name) => [name, await readFile(name, "utf8")])
));

const worker = `const files = ${JSON.stringify(files)};

const contentTypes = {
  "index.html": "text/html; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
  "game.js": "text/javascript; charset=utf-8",
  "poki-wrapper.js": "text/javascript; charset=utf-8",
  "save-system.js": "text/javascript; charset=utf-8",
  "localization/en.js": "text/javascript; charset=utf-8",
  "levels/base-game.js": "text/javascript; charset=utf-8",
  "expansions/expansion-registry.js": "text/javascript; charset=utf-8"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);

    if (path === "/" || path === "") {
      path = "/index.html";
    }

    const key = path.replace(/^\\//, "");
    const body = files[key];

    if (!body) {
      return new Response(files["index.html"], {
        headers: {
          "content-type": contentTypes["index.html"],
          "cache-control": "no-store"
        }
      });
    }

    return new Response(body, {
      headers: {
        "content-type": contentTypes[key] || "application/octet-stream",
        "cache-control": "no-store"
      }
    });
  }
};
`;

await mkdir("dist/server", { recursive: true });
await writeFile("dist/server/index.js", worker);
