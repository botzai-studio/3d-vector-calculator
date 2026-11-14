import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  angleDegrees,
  cross,
  dot,
  formatNumber,
  magnitude,
  normalize,
} from "../public/math.js";

const i = { x: 1, y: 0, z: 0 };
const j = { x: 0, y: 1, z: 0 };
const k = { x: 0, y: 0, z: 1 };
const zero = { x: 0, y: 0, z: 0 };

test("i·j is 0 and i×j is (0, 0, 1)", () => {
  assert.equal(dot(i, j), 0);
  assert.deepEqual(cross(i, j), { x: 0, y: 0, z: 1 });
  assert.deepEqual(cross(j, i), { x: 0, y: 0, z: -1 });
  assert.deepEqual(cross(k, i), j);
});

test("magnitude of (3, 4, 0) is 5", () => {
  assert.equal(magnitude({ x: 3, y: 4, z: 0 }), 5);
  assert.equal(magnitude(zero), 0);
});

test("normalize(2, 0, 0) is (1, 0, 0)", () => {
  assert.deepEqual(normalize({ x: 2, y: 0, z: 0 }), { x: 1, y: 0, z: 0 });
});

test("angles between i and j, 2i, and -i", () => {
  assert.equal(angleDegrees(i, j), 90);
  assert.equal(angleDegrees(i, { x: 2, y: 0, z: 0 }), 0);
  assert.equal(angleDegrees(i, { x: -1, y: 0, z: 0 }), 180);
});

test("normalize and angleDegrees of a zero vector return null", () => {
  assert.equal(normalize(zero), null);
  assert.equal(angleDegrees(zero, i), null);
  assert.equal(angleDegrees(i, zero), null);
  assert.equal(angleDegrees(zero, zero), null);
});

test("lengths below 1e-12 are treated as zero", () => {
  const tiny = { x: 1e-13, y: 0, z: 0 };
  assert.equal(normalize(tiny), null);
  assert.equal(angleDegrees(tiny, i), null);
  assert.equal(angleDegrees(i, tiny), null);

  const boundary = { x: 1e-12, y: 0, z: 0 };
  assert.deepEqual(normalize(boundary), { x: 1, y: 0, z: 0 });
});

test("a cosine slightly outside [-1, 1] still returns a finite angle", () => {
  const parallel = { x: 1, y: 1, z: 1 };
  const parallelAngle = angleDegrees(parallel, parallel);
  assert.equal(Number.isFinite(parallelAngle), true);
  assert.ok(parallelAngle >= 0 && parallelAngle < 1e-3);

  // angleDegrees reads each magnitude before the dot product. The later reads
  // force a cosine of ±(1 + epsilon), which Math.acos rejects as NaN.
  const over = 1 + Number.EPSILON;
  const under = -1 - Number.EPSILON;
  assert.equal(Number.isNaN(Math.acos(over)), true);
  assert.equal(Number.isNaN(Math.acos(under)), true);

  const componentReads = (dotX) => {
    const values = [1, 0, 0, dotX, 0, 0];
    let index = 0;
    const read = () => values[index++];
    return {
      get x() { return read(); },
      get y() { return read(); },
      get z() { return read(); },
    };
  };
  const unit = () => componentReads(1);

  assert.equal(angleDegrees(componentReads(over), unit()), 0);
  assert.equal(angleDegrees(componentReads(under), unit()), 180);
});

test("formatNumber uses three decimal places without changing the number", () => {
  const value = 2 / 3;
  assert.equal(formatNumber(value), "0.667");
  assert.equal(value, 2 / 3);
  assert.equal(formatNumber(1), "1.000");
  assert.equal(formatNumber(-2.5), "-2.500");
  assert.equal(formatNumber(Math.PI), "3.142");
  assert.equal(formatNumber(magnitude({ x: 3, y: 4, z: 0 })), "5.000");
});

test("operations do not mutate their inputs", () => {
  const a = { x: 2, y: 3, z: 4 };
  const b = { x: -1, y: 5, z: 0 };
  dot(a, b);
  cross(a, b);
  magnitude(a);
  normalize(a);
  angleDegrees(a, b);
  formatNumber(1.25);
  assert.deepEqual(a, { x: 2, y: 3, z: 4 });
  assert.deepEqual(b, { x: -1, y: 5, z: 0 });
});

test("math.js imports no DOM and no local module", () => {
  const source = readFileSync(new URL("../public/math.js", import.meta.url), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false);
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/\b(document|window|localStorage|HTMLElement)\b/.test(source), false);
});
