import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cameraBasis,
  createDefaultCamera,
  createScene,
  project,
} from "../public/scene.js";

const ORIGIN = { x: 0, y: 0, z: 0 };

function expectedDistance(longest, fov, aspect) {
  // Full view span: the arrow runs from the origin, so 70% of the way to the
  // edge is a view height of 2 * longest / 0.7, and never under 2.
  const span = Math.max(longest > 0 ? (2 * longest) / 0.7 : 0, 2);
  const limit = aspect >= 1 ? 1 : aspect;
  return span / (2 * Math.tan(fov / 2) * limit);
}

function cameraDistance(camera) {
  const position = camera.position;
  const target = camera.target;
  return Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
}

function assertCentered(point, camera) {
  assert.ok(point, "expected a projected point");
  assert.ok(Math.abs(point.x - camera.width / 2) < 1e-6);
  assert.ok(Math.abs(point.y - camera.height / 2) < 1e-6);
}

function fakeCanvas(width = 800, height = 600) {
  const calls = [];
  const listeners = new Map();
  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "measureText") return (text) => ({ width: String(text).length * 7 });
        if (typeof prop !== "string") return undefined;
        return () => {
          calls.push(prop);
        };
      },
      set() {
        return true;
      },
    },
  );
  return {
    width,
    height,
    style: {},
    calls,
    parentElement: {
      getBoundingClientRect() {
        return { width, height, left: 0, top: 0, right: width, bottom: height };
      },
      clientWidth: width,
      clientHeight: height,
    },
    getContext() {
      return ctx;
    },
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = (listeners.get(type) ?? []).filter((item) => item !== fn);
      listeners.set(type, list);
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    dispatch(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

test("project maps the origin to the view center for the default camera", () => {
  const camera = createDefaultCamera(800, 600);
  assert.ok(camera.position.x > 0);
  assert.ok(camera.position.y > 0);
  assert.ok(camera.position.z > 0);
  assert.deepEqual(camera.target, ORIGIN);
  assertCentered(project(ORIGIN, camera), camera);
});

test("project maps camera up above the origin and camera right to the right", () => {
  const camera = {
    position: { x: 0, y: 0, z: 8 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: Math.PI / 4,
    width: 400,
    height: 300,
  };
  const origin = project(ORIGIN, camera);
  const above = project({ x: 0, y: 1, z: 0 }, camera);
  const right = project({ x: 1, y: 0, z: 0 }, camera);

  assertCentered(origin, camera);
  assert.ok(above.y < origin.y - 10);
  assert.ok(right.x > origin.x + 10);
  assert.equal(project({ x: 0, y: 0, z: 12 }, camera), null);
});

test("a raised camera keeps view-up above the origin and view-right to the right", () => {
  const camera = {
    position: { x: 2, y: 3, z: 7 },
    target: ORIGIN,
    up: { x: 0, y: 1, z: 0 },
    fov: Math.PI / 3,
    width: 640,
    height: 480,
  };
  const basis = cameraBasis(camera);
  const origin = project(ORIGIN, camera);
  const above = project(basis.up, camera);
  const right = project(basis.right, camera);
  const worldRight = project({ x: 1, y: 0, z: 0 }, camera);

  assertCentered(origin, camera);
  assert.ok(above.y < origin.y);
  assert.ok(right.x > origin.x);
  assert.ok(worldRight.x > origin.x);
});

test("the default camera up axis projects above and its right axis projects right", () => {
  const camera = createDefaultCamera(900, 700);
  const basis = cameraBasis(camera);
  const origin = project(ORIGIN, camera);
  const above = project(basis.up, camera);
  const right = project(basis.right, camera);

  assertCentered(origin, camera);
  assert.ok(above.y < origin.y);
  assert.ok(right.x > origin.x);
});

test("scene module does not import math.js or storage.js", () => {
  const source = readFileSync(new URL("../public/scene.js", import.meta.url), "utf8");
  assert.equal(source.includes("math.js"), false);
  assert.equal(source.includes("storage.js"), false);
  assert.equal(/\bimport\b/.test(source), false);
  assert.equal(typeof document, "undefined");
  assert.equal(typeof createScene, "function");
  assert.equal(typeof project, "function");
});

test("longest arrow is framed to about 70% of the view, with a minimum extent of 2", () => {
  const wide = fakeCanvas(800, 600);
  const scene = createScene(wide);
  scene.setVectors({
    a: { x: 5, y: 0, z: 0 },
    b: { x: 0, y: 1, z: 0 },
    result: { x: 0, y: 0, z: 1 },
  });
  const framed = scene.getCamera();
  const wideDistance = expectedDistance(5, framed.fov, framed.width / framed.height);
  assert.ok(Math.abs(cameraDistance(framed) - wideDistance) < 1e-6);
  assertCentered(project(ORIGIN, framed), framed);

  const tiny = createScene(fakeCanvas(800, 600));
  tiny.setVectors({ a: { x: 0.2, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 } });
  const minimum = tiny.getCamera();
  const minimumDistance = expectedDistance(0.2, minimum.fov, minimum.width / minimum.height);
  assert.ok(Math.abs(cameraDistance(minimum) - minimumDistance) < 1e-6);
  const unclamped = (2 * 0.2 / 0.7) / (2 * Math.tan(minimum.fov / 2));
  assert.ok(cameraDistance(minimum) > unclamped);

  const portrait = createScene(fakeCanvas(300, 600));
  portrait.setVectors({ a: { x: 4, y: 0, z: 0 }, b: null, result: null });
  const tall = portrait.getCamera();
  const tallDistance = expectedDistance(4, tall.fov, tall.width / tall.height);
  assert.ok(tall.width < tall.height);
  assert.ok(Math.abs(cameraDistance(tall) - tallDistance) < 1e-6);
});

test("pointer orbit and wheel zoom keep the origin at the view center", () => {
  const canvas = fakeCanvas(800, 600);
  const scene = createScene(canvas);
  scene.setVectors({
    a: { x: 1, y: 0, z: 0 },
    b: { x: 0, y: 1, z: 0 },
    result: { x: 0, y: 0, z: 2 },
  });
  assert.ok(canvas.calls.includes("fillRect"));
  assert.ok(canvas.calls.includes("stroke"));
  assert.ok(canvas.calls.includes("fillText"));
  assert.ok(canvas.calls.filter((name) => name === "fillText").length >= 5);

  const before = scene.getCamera();
  canvas.dispatch("pointerdown", {
    button: 0,
    pointerId: 1,
    clientX: 40,
    clientY: 40,
    preventDefault() {},
  });
  canvas.dispatch("pointermove", {
    pointerId: 1,
    clientX: 160,
    clientY: 10,
  });
  canvas.dispatch("pointerup", { pointerId: 1, clientX: 160, clientY: 10 });

  const orbited = scene.getCamera();
  const moved = Math.hypot(
    orbited.position.x - before.position.x,
    orbited.position.y - before.position.y,
    orbited.position.z - before.position.z,
  );
  assert.ok(moved > 0.05);
  assert.deepEqual(orbited.target, ORIGIN);
  assertCentered(project(ORIGIN, orbited), orbited);

  const zoomedOutFrom = cameraDistance(orbited);
  canvas.dispatch("wheel", { deltaY: 160, deltaMode: 0, preventDefault() {} });
  const zoomedOut = scene.getCamera();
  assert.ok(cameraDistance(zoomedOut) > zoomedOutFrom * 1.05);
  assertCentered(project(ORIGIN, zoomedOut), zoomedOut);

  canvas.dispatch("wheel", { deltaY: -400, deltaMode: 0, preventDefault() {} });
  const zoomedIn = scene.getCamera();
  assert.ok(cameraDistance(zoomedIn) < cameraDistance(zoomedOut));
  assertCentered(project(ORIGIN, zoomedIn), zoomedIn);

  canvas.dispatch("pointerdown", {
    button: 0,
    pointerId: 2,
    clientX: 0,
    clientY: 0,
    preventDefault() {},
  });
  canvas.dispatch("pointermove", { pointerId: 2, clientX: 0, clientY: 8000 });
  canvas.dispatch("pointerup", { pointerId: 2, clientX: 0, clientY: 8000 });
  const clamped = scene.getCamera();
  assert.ok(Number.isFinite(clamped.position.x));
  assert.ok(Number.isFinite(clamped.position.y));
  assert.ok(Number.isFinite(clamped.position.z));
  assertCentered(project(ORIGIN, clamped), clamped);
  assert.equal(canvas.style.cursor, "grab");
});

test("createScene is idempotent and resize keeps the origin centered", () => {
  const canvas = fakeCanvas(500, 400);
  const first = createScene(canvas);
  const second = createScene(canvas);
  assert.equal(first, second);
  first.setVectors({ a: { x: "3", y: "0", z: "0" }, b: { x: 0, y: 2, z: 0 }, result: { x: 1, y: 1, z: 1 } });
  first.resize();
  assertCentered(project(ORIGIN, first.getCamera()), first.getCamera());
  first.destroy();
  const rebuilt = createScene(canvas);
  assert.notEqual(rebuilt, first);
  assertCentered(project(ORIGIN, rebuilt.getCamera()), rebuilt.getCamera());
  rebuilt.destroy();
});
