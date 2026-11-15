import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "public/styles.css"), "utf8");
const app = readFileSync(join(root, "public/app.js"), "utf8");

describe("narrow layout", () => {
  it("stacks the 3D view above the controls under 800px", () => {
    assert.match(css, /@media\s*\(max-width:\s*799px\)/);
    assert.match(css, /grid-template-areas:\s*"viewport"\s*"panel"/);
    assert.match(css, /min-height:\s*280px/);
  });

  it("reports its height to an embedding parent so the iframe can grow", () => {
    assert.match(app, /source:\s*"agent-studio-demo"/);
    assert.match(app, /watchStudioFrameHeight/);
  });
});
