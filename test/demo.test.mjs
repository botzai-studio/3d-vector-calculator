import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ANIMATION_TYPES,
  DEMO_INTRO_MS,
  DEMO_POSES,
  DEMO_SEGMENT_MS,
  LATTICE_VERTICES,
  OPERATION_CYCLE,
  PLANE_LIFE_MS,
  PLANE_PEAK,
  WIRE_FADE_MS,
  MOTION_BLEND_MS,
  blendPresentations,
  blendSweep,
  damp,
  easeInOutCubic,
  easeInOutSine,
  formatSweepValue,
  CAMERA_PATHS,
  animationSeed,
  cameraAim,
  modeDurationMs,
  nextAnimationStep,
  planeOpacity,
  revealWires,
  sampleSweep,
  sweepWires,
  tracePlane,
  wireOpacity,
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

test("the workspace offers an Animate control wired to the sweep", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(html, /id="demo-toggle"/);
  assert.match(html, />Animate</);
  assert.equal(html.includes("Play demo"), false);
  assert.match(html, /name="motion"/);
  assert.match(html, /value="orbit"[^>]*checked/);
  assert.match(html, /value="normalize"[^>]*checked/);
  assert.match(html, /id="rotate-toggle"[^>]*checked/);
  assert.match(html, /id="auto-toggle"[^>]*checked/);
  assert.equal(/value="ease"[^>]*checked/.test(html), false);
  assert.equal(/value="dot"[^>]*checked/.test(html), false);
  assert.match(html, /value="lattice"/);
  assert.match(app, /sampleSweep/);
  assert.match(app, /sweepWires/);
  assert.match(app, /revealWires/);
  assert.match(app, /tracePlane/);
  assert.match(app, /planeOpacity/);
  assert.match(app, /wireOpacity/);
  assert.match(app, /orbitBy/);
  assert.match(app, /nextAnimationStep/);
  assert.match(app, /demo-toggle/);
  assert.match(app, /if \(!prefersReducedMotion\(\)\) startDemo\(\)/);
  assert.match(css, /\.button-demo/);
  assert.match(css, /\.panel\.is-demo/);
  assert.match(css, /\.motion-picker/);
  assert.match(css, /\.demo-switches/);
  assert.match(css, /\.switch:has\(input:checked\)/);
});

test("glide moves at constant speed instead of cubic easing", () => {
  const start = { a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 } };
  const atStart = sampleSweep(0, start, { motion: "glide" });
  const joined = sampleSweep(DEMO_INTRO_MS, start, { motion: "glide" });
  const quarter = sampleSweep(DEMO_INTRO_MS * 0.25, start, { motion: "glide" });
  assert.equal(atStart.phase, "intro");
  assert.equal(atStart.motion, "glide");
  assert.equal(joined.motion, "glide");
  const linear = atStart.a.x + (joined.a.x - atStart.a.x) * 0.25;
  const eased = atStart.a.x + (joined.a.x - atStart.a.x) * easeInOutCubic(0.25);
  assert.ok(Math.abs(quarter.a.x - linear) < 1e-9);
  assert.ok(Math.abs(linear - eased) > 1e-3);
});

test("arc leaves the straight chord between poses", () => {
  const start = {
    a: { x: DEMO_POSES[0].a.x, y: DEMO_POSES[0].a.y, z: DEMO_POSES[0].a.z },
    b: { x: DEMO_POSES[0].b.x, y: DEMO_POSES[0].b.y, z: DEMO_POSES[0].b.z },
  };
  const quarter = sampleSweep(DEMO_SEGMENT_MS * 0.25, start, { motion: "arc" });
  const end = sampleSweep(DEMO_SEGMENT_MS, start, { motion: "arc" });
  assert.equal(quarter.phase, "sweep");
  assert.equal(quarter.motion, "arc");
  closeTo(end.a, DEMO_POSES[1].a);
  const u = easeInOutSine(0.25);
  const chord = {
    x: DEMO_POSES[0].a.x + (DEMO_POSES[1].a.x - DEMO_POSES[0].a.x) * u,
    y: DEMO_POSES[0].a.y + (DEMO_POSES[1].a.y - DEMO_POSES[0].a.y) * u,
    z: DEMO_POSES[0].a.z + (DEMO_POSES[1].a.z - DEMO_POSES[0].a.z) * u,
  };
  const gap = Math.hypot(quarter.a.x - chord.x, quarter.a.y - chord.y, quarter.a.z - chord.z);
  assert.ok(gap > 0.01, `arc gap ${gap}`);
});

test("orbit, bloom, glide, and lattice stay long enough to draw", () => {
  const cycle = DEMO_SEGMENT_MS * (DEMO_POSES.length - 1);
  for (const motion of ["orbit", "bloom", "glide", "lattice"]) {
    for (let step = 0; step <= 36; step += 1) {
      const sample = sampleSweep((cycle * step) / 36, null, { motion, introMs: 0 });
      assert.equal(sample.motion, motion);
      for (const vector of [sample.a, sample.b]) {
        assert.equal(Number.isFinite(vector.x + vector.y + vector.z), true);
        const len = Math.hypot(vector.x, vector.y, vector.z);
        assert.ok(len > 0.75, `${motion} length ${len}`);
      }
    }
  }
});

test("a sweep keeps vector attributes as a closed wireframe", () => {
  assert.deepEqual(ANIMATION_TYPES, ["ease", "glide", "arc", "orbit", "bloom", "lattice", "helix", "weave", "pulse"]);
  const wires = sweepWires("orbit", 72);
  assert.equal(wires.a.length, 73);
  closeTo(wires.a[0], wires.a[wires.a.length - 1]);
  closeTo(wires.b[0], wires.b[wires.b.length - 1]);
  assert.ok(wires.spans.length >= 8);
  assert.ok(wires.drops.length >= 8);
  const sample = wires.a[12];
  const partner = wires.b[12];
  const cross = wires.cross[12];
  const dotA = sample.x * cross.x + sample.y * cross.y + sample.z * cross.z;
  const dotB = partner.x * cross.x + partner.y * cross.y + partner.z * cross.z;
  assert.ok(Math.abs(dotA) < 1e-6);
  assert.ok(Math.abs(dotB) < 1e-6);
  assert.ok(Math.hypot(cross.x, cross.y, cross.z) > 0.2);
  closeTo(wires.shadowA[12], { x: sample.x, y: 0, z: sample.z });

  const partial = revealWires(wires, 0.25, 0);
  const kept = revealWires(wires, 0.1, 1);
  assert.ok(partial.a.length < wires.a.length);
  assert.ok(partial.a.length > 1);
  assert.equal(kept.a.length, wires.a.length);
  assert.equal(kept.spans.length, wires.spans.length);
});

test("a trace slice lies on one plane and fades from a translucent peak", () => {
  assert.equal(tracePlane(null, 0.2), null);
  assert.equal(tracePlane({ a: [{ x: 1, y: 0, z: 0 }] }, 0.2), null);
  const wires = sweepWires("orbit", 72);
  for (const progress of [0, 0.35, 0.8, 1]) {
    const plane = tracePlane(wires, progress);
    assert.ok(plane, `plane at ${progress}`);
    assert.ok(plane.points.length >= 5);
    const normal = plane.normal;
    assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-9);
    const origin = plane.points[0];
    for (const point of plane.points) {
      const distance = (point.x - origin.x) * normal.x
        + (point.y - origin.y) * normal.y
        + (point.z - origin.z) * normal.z;
      assert.ok(Math.abs(distance) < 1e-6, `off plane ${distance}`);
    }
  }

  assert.equal(planeOpacity(0), PLANE_PEAK);
  assert.ok(PLANE_PEAK < 0.5);
  assert.ok(planeOpacity(PLANE_LIFE_MS * 0.5) < planeOpacity(0));
  assert.ok(planeOpacity(PLANE_LIFE_MS * 0.5) > 0);
  assert.equal(planeOpacity(PLANE_LIFE_MS), 0);
  assert.equal(planeOpacity(-10), 0);
  assert.equal(planeOpacity(Number.NaN), 0);

  assert.equal(wireOpacity(0), 1);
  assert.ok(wireOpacity(WIRE_FADE_MS * 0.5) < 1);
  assert.ok(wireOpacity(WIRE_FADE_MS * 0.5) > 0);
  assert.equal(wireOpacity(WIRE_FADE_MS), 0);
  assert.equal(wireOpacity(Number.NaN), 0);
});

test("auto settings leave orbit and normalize and then wrap", () => {
  assert.deepEqual(OPERATION_CYCLE[0], "normalize");
  assert.deepEqual(nextAnimationStep("orbit", "normalize"), {
    motion: "bloom",
    operation: "cross",
  });
  assert.deepEqual(nextAnimationStep("lattice", "dot"), {
    motion: "helix",
    operation: "normalize",
  });
  assert.deepEqual(nextAnimationStep("pulse", "dot"), {
    motion: "ease",
    operation: "normalize",
  });
  assert.deepEqual(nextAnimationStep("nope", "nope"), {
    motion: "orbit",
    operation: "normalize",
  });
});

test("a motion change keeps the pose on screen and eases into the next one", () => {
  const start = { a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 } };
  const elapsed = DEMO_INTRO_MS + DEMO_SEGMENT_MS * 2.4;
  const from = sampleSweep(elapsed, start, { motion: "orbit" });
  const to = sampleSweep(elapsed, start, { motion: "bloom" });
  const held = blendSweep(from, to, 0);
  closeTo(held.a, from.a);
  closeTo(held.b, from.b);
  assert.equal(held.weight, 0);
  const done = blendSweep(from, to, 1);
  closeTo(done.a, to.a);
  closeTo(done.b, to.b);
  assert.equal(done.weight, 1);

  const gap = Math.hypot(to.a.x - from.a.x, to.a.y - from.a.y, to.a.z - from.a.z);
  assert.ok(gap > 0.2, `gap ${gap}`);
  let previous = held;
  let maxStep = 0;
  for (let step = 1; step <= 16; step += 1) {
    const next = blendSweep(from, to, step / 16);
    maxStep = Math.max(
      maxStep,
      Math.hypot(next.a.x - previous.a.x, next.a.y - previous.a.y, next.a.z - previous.a.z),
    );
    previous = next;
  }
  assert.ok(maxStep < gap * 0.35, `step ${maxStep} gap ${gap}`);
  const early = blendSweep(from, to, 0.25);
  const earlyMove = Math.hypot(early.a.x - from.a.x, early.a.y - from.a.y, early.a.z - from.a.z);
  assert.ok(earlyMove < gap * 0.25, `early ${earlyMove} gap ${gap}`);
  assert.equal(blendSweep(from, to, Number.NaN).weight, 0);
  assert.ok(MOTION_BLEND_MS >= 400);
});

test("result arrows ease between operations and fade when one side has none", () => {
  const from = { x: 1, y: 0, z: 0 };
  const to = { x: 0, y: 2, z: 0 };
  const held = blendPresentations(from, to, 0);
  closeTo(held.arrow, from);
  assert.equal(held.alpha, 1);
  const done = blendPresentations(from, to, 1);
  closeTo(done.arrow, to);
  assert.equal(done.alpha, 1);
  const faded = blendPresentations(from, null, 1);
  assert.equal(faded.alpha, 0);
  const early = blendPresentations({ arrow: from, alpha: 1 }, null, 0.25);
  assert.ok(early.alpha > 0.9);
  closeTo(early.arrow, from);
  const nested = blendPresentations({ arrow: from, alpha: 0.4 }, { arrow: to, alpha: 0.4 }, 0);
  closeTo(nested.arrow, from);
  assert.ok(Math.abs(nested.alpha - 0.4) < 1e-9);
});

test("damp holds still until time passes and never overshoots", () => {
  assert.equal(damp(0.25, 1, 0, 200), 0.25);
  assert.equal(damp(0.25, 1, -10, 200), 0.25);
  const mid = damp(0, 1, 200, 200);
  assert.ok(mid > 0.6 && mid < 0.7, `mid ${mid}`);
  assert.ok(damp(0, 1, 40, 200) < mid);
  const down = damp(1, 0, 200, 200);
  assert.ok(down < 0.4 && down > 0.3, `down ${down}`);
});

test("animation settings crossfade in the running sweep instead of restarting it", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const begin = app.slice(app.indexOf("function beginMotion"), app.indexOf("function advanceSettings"));
  assert.equal(begin.includes("demoElapsed = 0"), false);
  assert.match(begin, /handoff/);
  assert.match(begin, /applySweep\(demoElapsed\)/);
  assert.match(app, /blendSweep/);
  assert.match(app, /blendPresentations/);
  assert.match(app, /extentFollow/);
  assert.match(app, /damp\(/);
});

test("helix, weave, and pulse stay closed, seeded, and long enough to draw", () => {
  const cycle = DEMO_SEGMENT_MS * 6;
  for (const motion of ["helix", "weave", "pulse"]) {
    for (const seed of [1, 4, 19]) {
      for (let step = 0; step <= 24; step += 1) {
        const sample = sampleSweep((cycle * step) / 24, null, { motion, introMs: 0, seed });
        assert.equal(sample.motion, motion);
        for (const vector of [sample.a, sample.b]) {
          assert.equal(Number.isFinite(vector.x + vector.y + vector.z), true);
          const len = Math.hypot(vector.x, vector.y, vector.z);
          assert.ok(len > 0.75, `${motion} seed ${seed} length ${len}`);
        }
      }
    }
    const wires = sweepWires(motion, 72, 5);
    closeTo(wires.a[0], wires.a[wires.a.length - 1]);
    closeTo(wires.b[0], wires.b[wires.b.length - 1]);
    const started = sampleSweep(0, null, { motion, introMs: 0, seed: 11 });
    const wrapped = sampleSweep(cycle, null, { motion, introMs: 0, seed: 11 });
    closeTo(wrapped.a, started.a);
    closeTo(wrapped.b, started.b);
    const beforeSeam = sampleSweep(cycle - 16, null, { motion, introMs: 0, seed: 11 });
    const seam = Math.hypot(
      beforeSeam.a.x - started.a.x,
      beforeSeam.a.y - started.a.y,
      beforeSeam.a.z - started.a.z,
    );
    assert.ok(seam < 0.2, `${motion} seam ${seam}`);
  }

  const plain = sampleSweep(DEMO_SEGMENT_MS * 2, null, { motion: "orbit", introMs: 0 });
  const canonical = sampleSweep(DEMO_SEGMENT_MS * 2, null, { motion: "orbit", introMs: 0, seed: 1 });
  closeTo(plain.a, canonical.a);
  closeTo(plain.b, canonical.b);
  const shifted = sampleSweep(DEMO_SEGMENT_MS * 2, null, { motion: "orbit", introMs: 0, seed: 42 });
  const again = sampleSweep(DEMO_SEGMENT_MS * 2, null, { motion: "orbit", introMs: 0, seed: 42 });
  closeTo(shifted.a, again.a);
  let seedGap = 0;
  for (const seed of [3, 7, 42, 99, 256]) {
    const sample = sampleSweep(DEMO_SEGMENT_MS * 2, null, { motion: "orbit", introMs: 0, seed });
    seedGap = Math.max(seedGap, Math.hypot(sample.a.x - plain.a.x, sample.a.y - plain.a.y, sample.a.z - plain.a.z));
  }
  assert.ok(seedGap > 0.2, `seed gap ${seedGap}`);
  const baseHelix = sampleSweep(0, null, { motion: "helix", introMs: 0, seed: 1 });
  let helixGap = 0;
  for (const seed of [7, 8, 11, 42]) {
    const sample = sampleSweep(0, null, { motion: "helix", introMs: 0, seed });
    helixGap = Math.max(
      helixGap,
      Math.hypot(sample.a.x - baseHelix.a.x, sample.a.y - baseHelix.a.y, sample.a.z - baseHelix.a.z),
    );
  }
  assert.ok(helixGap > 0.2, `helix seed gap ${helixGap}`);
});

test("animation options cover seed, duration, and camera paths", () => {
  assert.deepEqual(CAMERA_PATHS, ["none", "up", "down", "tilt", "follow", "trace"]);
  assert.equal(animationSeed(1), 1);
  assert.equal(animationSeed(0), 1);
  assert.equal(animationSeed(-8), 8);
  assert.equal(animationSeed("42"), 42);
  assert.equal(animationSeed("nope"), 1);
  assert.equal(modeDurationMs(9), 9000);
  assert.equal(modeDurationMs("4.5"), 4500);
  assert.equal(modeDurationMs(""), 9000);
  assert.equal(modeDurationMs(0.2), 2000);
  assert.equal(modeDurationMs(90), 60000);
  assert.equal(modeDurationMs("nope"), 9000);

  const up = cameraAim("up", Math.PI / 2, null, null);
  const down = cameraAim("down", Math.PI / 2, null, null);
  assert.ok(up.pitch > 0.9, `up ${up.pitch}`);
  assert.ok(down.pitch < -0.1, `down ${down.pitch}`);
  assert.ok(up.pitch > down.pitch);
  const tilt = cameraAim("tilt", Math.PI / 2, null, null);
  assert.ok(Math.abs(tilt.roll) > 0.4, `tilt ${tilt.roll}`);
  assert.equal(tilt.pitch, null);
  const follow = cameraAim("follow", 0, { a: { x: 2, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 } }, null);
  assert.ok(follow.lookAt.x > 0.5, `follow ${follow.lookAt.x}`);
  assert.equal(follow.lookAt.y, 0);
  const parked = cameraAim("follow", 0, { a: { x: 0, y: 0, z: 0 } }, null);
  assert.deepEqual(parked.lookAt, { x: 0, y: 0, z: 0 });
  const trace = cameraAim("trace", 0, {
    a: { x: 1, y: 0, z: 0 },
    b: { x: 0, y: 1, z: 0 },
    progress: 0,
  }, null);
  assert.ok(trace.lookAt.z > 0.2, `trace ${trace.lookAt.z}`);
  const wires = {
    cross: [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 2, z: 0 },
    ],
  };
  const traced = cameraAim("trace", 0, {
    a: { x: 1, y: 0, z: 0 },
    b: { x: 0, y: 1, z: 0 },
    progress: 1,
  }, wires);
  assert.ok(traced.lookAt.y > traced.lookAt.z);
  assert.equal(cameraAim("nope", 0, null, null).pitch, null);

  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /value="helix"/);
  assert.match(html, /value="weave"/);
  assert.match(html, /value="pulse"/);
  assert.match(html, /id="anim-dialog"/);
  assert.match(html, /id="anim-seed"/);
  assert.match(html, /id="anim-seed-random"/);
  assert.match(html, /id="mode-duration"/);
  assert.match(html, /name="camera-path"/);
  assert.match(html, /value="up"/);
  assert.match(html, /value="down"/);
  assert.match(html, /value="tilt"/);
  assert.match(html, /value="follow"/);
  assert.match(html, /value="trace"/);
  assert.match(html, /value="none"[^>]*checked/);
  assert.match(app, /guideView/);
  assert.match(app, /modeDurationMs/);
  assert.match(app, /cameraAim/);
  assert.match(app, /anim-dialog/);
  assert.match(app, /readModeDuration\(\)/);
});

test("lattice wires visit every corner of the octahedron", () => {
  const wires = sweepWires("lattice", 144);
  closeTo(wires.a[0], wires.a[wires.a.length - 1]);
  for (const vertex of LATTICE_VERTICES) {
    const near = wires.a.some((point) => (
      Math.hypot(point.x - vertex.x, point.y - vertex.y, point.z - vertex.z) < 0.08
    ));
    assert.equal(near, true, `missing ${vertex.x},${vertex.y},${vertex.z}`);
  }
});
