import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import test from "node:test";

const ca = fs.readFileSync(new URL("../certs/localhost.crt", import.meta.url));

import { bindHost, createServer } from "../server.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Node's global agent keeps idle sockets open, which would stall close().
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  });
}

function request(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "127.0.0.1", port, path, method, agent: false, ca, servername: "localhost" },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            type: res.headers["content-type"] || "",
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("binds loopback and ignores a public HOST", () => {
  const previous = process.env.HOST;
  delete process.env.HOST;
  assert.equal(bindHost(), "127.0.0.1");
  process.env.HOST = "0.0.0.0";
  assert.equal(bindHost(), "127.0.0.1");
  process.env.HOST = "::1";
  assert.equal(bindHost(), "::1");
  if (previous === undefined) delete process.env.HOST;
  else process.env.HOST = previous;
});

test("static server returns public files, 404s, and blocks traversal", async (t) => {
  const server = createServer();
  const port = await listen(server);
  t.after(() => close(server));

  await t.test("GET / is 200 HTML with the panel and canvas", async () => {
    const response = await request(port, "/");
    assert.equal(response.status, 200);
    assert.match(response.type, /^text\/html/);
    assert.match(response.body, /id="panel"/);
    assert.match(response.body, /<canvas[\s>]/);
    assert.match(response.body, /3D Vector Calculator/);
  });

  await t.test("GET /index.html?view=1 still serves the page", async () => {
    const response = await request(port, "/index.html?view=1");
    assert.equal(response.status, 200);
    assert.match(response.type, /^text\/html/);
    assert.match(response.body, /<canvas[\s>]/);
  });

  await t.test("styles and scripts use matching MIME types", async () => {
    const css = await request(port, "/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.type, /^text\/css/);
    assert.ok(css.body.includes("{"));

    const app = await request(port, "/app.js");
    assert.equal(app.status, 200);
    assert.match(app.type, /^text\/javascript/);
    assert.match(app.body, /from\s+["']\.\/math\.js["']/);

    const math = await request(port, "/math.js");
    assert.equal(math.status, 200);
    assert.match(math.type, /^text\/javascript/);
    assert.match(math.body, /export function dot/);
  });

  await t.test("a missing file is 404", async () => {
    const response = await request(port, "/no-such-file.txt");
    assert.equal(response.status, 404);
    assert.equal(response.body, "Not found");
    assert.match(response.type, /^text\/plain/);
  });

  await t.test("paths that leave public/ are 404 and do not leak files", async () => {
    const outsideMarker = '"start": "node server.mjs"';
    const paths = [
      "/../package.json",
      "/../../package.json",
      "/public/../package.json",
      "/..%2Fpackage.json",
      "/%2e%2e/package.json",
      "/%2e%2e/%2e%2e/package.json",
      "/%252e%252e/package.json",
      "/styles.css/..%2f..%2fpackage.json",
      "/..\\package.json",
      "/%5c..%5cpackage.json",
      "/foo%00.html",
    ];

    for (const path of paths) {
      const response = await request(port, path);
      assert.equal(response.status, 404, path);
      assert.equal(response.body, "Not found", path);
      assert.equal(response.body.includes(outsideMarker), false, path);
      assert.equal(response.body.includes("createServer"), false, path);
    }
  });
});
