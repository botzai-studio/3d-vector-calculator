// Creates a self-signed localhost certificate in certs/ when one is not there yet.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "certs");
const crt = path.join(dir, "localhost.crt");
const key = path.join(dir, "localhost.key");

if (!fs.existsSync(crt) || !fs.existsSync(key)) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825",
    "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", key, "-out", crt,
  ], { stdio: "ignore" });
  console.log("Created certs/localhost.crt and certs/localhost.key");
}
