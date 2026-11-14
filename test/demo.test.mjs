import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEMO_INTRO_MS,
  DEMO_POSES,
  DEMO_SEGMENT_MS,
  easeInOutCubic,
  formatSweepValue,
  sampleSweep,
} from "../public/demo.js";

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `x ${actual.x} vs ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `y ${actual.y} vs ${expected.y}`);
  assert.ok(Math.abs(actual.z - expected.z) < 1e-9, `z ${actual.z} vs ${expected.z}`);
}

test("easeInOutCubic holds the ends and leaves them slowly", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(0.25), 0.0625);
  assert.equal(easeInOutCubic(0.75), 0.9375);
  assert.equal(easeInOutCubic(0.25) + easeInOutCubic(0.75), 1);
  assert.ok(easeInOutCubic(0.25) < 0.25);
  assert.ok(easeInOutCubic(0.75) > 0.75);
  assert.equal(easeInOutCubic(-2), 0);
  assert.equal(easeInOutCubic(3), 1);
  assert.equal(easeInOutCubic(Number.NaN), 0);
});

test("sampleSweep eases from the current vectors into the pose path", () => {
  const start = { a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 } };
  const atStart = sampleSweep(0, start);
  assert.equal(atStart.phase, "intro");
  closeTo(atStart.a, start.a);
  closeTo(atStart.b, start.b);

  const quarter = sampleSweep(DEMO_INTRO_MS * 0.25, start);
  const u = easeInOutCubic(0.25);
  closeTo(quarter.a, {
    x: 1 + (DEMO_POSES[0].a.x - 1) * u,
    y: DEMO_POSES[0].a.y * u,
    z: DEMO_POSES[0].a.z * u,
  });
  const linearX = 1 + (DEMO_POSES[0].a.x - 1) * 0.25;
  assert.ok(Math.abs(quarter.a.x - linearX) > 1e-3);

  const joined = sampleSweep(DEMO_INTRO_MS, start);
  closeTo(joined.a, DEMO_POSES[0].a);
  closeTo(joined.b, DEMO_POSES[0].b);
  assert.equal(sampleSweep(Number.NaN, start).phase, "intro");
});

test("the pose loop is closed, continuous, and eased between poses", () => {
  assert.ok(DEMO_POSES.length >= 3);
  assert.deepEqual(DEMO_POSES[0], DEMO_POSES[DEMO_POSES.length - 1]);

  const start = {
    a: { x: DEMO_POSES[0].a.x, y: DEMO_POSES[0].a.y, z: DEMO_POSES[0].a.z },
    b: { x: DEMO_POSES[0].b.x, y: DEMO_POSES[0].b.y, z: DEMO_POSES[0].b.z },
  };
  const segments = DEMO_POSES.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const sample = sampleSweep(index * DEMO_SEGMENT_MS, start);
    assert.equal(sample.phase, index === 0 ? "intro" : "sweep");
    closeTo(sample.a, DEMO_POSES[index].a);
    closeTo(sample.b, DEMO_POSES[index].b);
  }

  const cycle = DEMO_SEGMENT_MS * segments;
  const wrapped = sampleSweep(cycle, start);
  assert.equal(wrapped.phase, "sweep");
  closeTo(wrapped.a, DEMO_POSES[0].a);
  closeTo(wrapped.b, DEMO_POSES[0].b);

  const quarter = sampleSweep(DEMO_SEGMENT_MS * 0.25, start);
  const from = DEMO_POSES[0].a;
  const to = DEMO_POSES[1].a;
  const eased = from.x + (to.x - from.x) * easeInOutCubic(0.25);
  const linear = from.x + (to.x - from.x) * 0.25;
  assert.ok(Math.abs(to.x - from.x) > 0.05);
  assert.ok(Math.abs(quarter.a.x - eased) < 1e-9);
  assert.ok(Math.abs(eased - linear) > 1e-3);
});

test("swept vectors stay long enough to draw", () => {
  const start = { a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 } };
  const total = DEMO_INTRO_MS + DEMO_SEGMENT_MS * (DEMO_POSES.length - 1);
  for (let step = 0; step <= 72; step += 1) {
    const sample = sampleSweep((total * step) / 72, start);
    for (const vector of [sample.a, sample.b]) {
      assert.equal(Number.isFinite(vector.x + vector.y + vector.z), true);
      assert.ok(Math.hypot(vector.x, vector.y, vector.z) > 0.6);
    }
  }
  for (const pose of DEMO_POSES) {
    for (const vector of [pose.a, pose.b]) {
      assert.ok(Math.hypot(vector.x, vector.y, vector.z) > 0.9);
    }
  }
});

test("formatSweepValue stays numeric and readable", () => {
  assert.equal(formatSweepValue(1), "1");
  assert.equal(formatSweepValue(1.25), "1.25");
  assert.equal(formatSweepValue(1.2344), "1.234");
  assert.equal(formatSweepValue(-0), "0");
  assert.equal(formatSweepValue(0.0004), "0");
  assert.equal(formatSweepValue(Number.NaN), "");
  assert.equal(formatSweepValue("1"), "");
});

test("the workspace offers a demo control wired to the sweep", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(html, /id="demo-toggle"/);
  assert.match(html, /Play demo/);
  assert.match(app, /sampleSweep/);
  assert.match(app, /demo-toggle/);
  assert.match(css, /\.button-demo/);
  assert.match(css, /\.panel\.is-demo/);
});
