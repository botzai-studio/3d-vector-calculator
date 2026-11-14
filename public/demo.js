/**
 * Timed sweep for the demo control. Pure: no DOM, no imports.
 * The path eases from the vectors currently on screen into a closed loop.
 * Each segment uses easeInOutCubic, so the fields and arrows slow into
 * every pose and leave it again.
 */

export const DEMO_INTRO_MS = 800;
export const DEMO_SEGMENT_MS = 1200;

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function ring(index, count, yawOffset, pitchAmp, pitchPhase, radius, radiusAmp) {
  const step = (Math.PI * 2 * index) / count;
  const yaw = yawOffset + step;
  const pitch = pitchAmp * Math.sin(step + pitchPhase);
  const radial = radius + radiusAmp * Math.cos(step);
  const planar = Math.cos(pitch);
  return {
    x: round3(radial * planar * Math.sin(yaw)),
    y: round3(radial * Math.sin(pitch)),
    z: round3(radial * planar * Math.cos(yaw)),
  };
}

const SWEEP_STEPS = 6;

function ringPose(index) {
  return {
    a: ring(index, SWEEP_STEPS, 0.4, 0.5, 0.2, 1.45, 0.18),
    b: ring(index, SWEEP_STEPS, 1.85, 0.42, 1.1, 1.3, 0.16),
  };
}

const POSES = Array.from({ length: SWEEP_STEPS }, (_, index) => ringPose(index));
POSES.push({
  a: { x: POSES[0].a.x, y: POSES[0].a.y, z: POSES[0].a.z },
  b: { x: POSES[0].b.x, y: POSES[0].b.y, z: POSES[0].b.z },
});

/** Closed loop. The last pose matches the first so the repeat does not jump. */
export const DEMO_POSES = POSES;

export function easeInOutCubic(amount) {
  const t = clamp01(amount);
  if (t < 0.5) return 4 * t * t * t;
  return 1 - ((-2 * t + 2) ** 3) / 2;
}

function clamp01(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  if (amount <= 0) return 0;
  if (amount >= 1) return 1;
  return amount;
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function copyVector(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function asVector(value, fallback) {
  if (
    value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z)
  ) {
    return copyVector(value);
  }
  return copyVector(fallback);
}

function nearVector(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= 1e-6;
}

function blendVector(from, to, t) {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    z: lerp(from.z, to.z, t),
  };
}

function durationMs(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

/**
 * Vectors at `elapsedMs` along the sweep.
 * An intro eases from `start` into the first pose unless the fields are
 * already there. Later time loops the pose path forever.
 */
export function sampleSweep(elapsedMs, start, options = {}) {
  const poses = Array.isArray(options.poses) && options.poses.length >= 2
    ? options.poses
    : DEMO_POSES;
  const introSetting = durationMs(options.introMs, DEMO_INTRO_MS);
  const segmentMs = Math.max(1, durationMs(options.segmentMs, DEMO_SEGMENT_MS));
  const elapsed = typeof elapsedMs === "number" && Number.isFinite(elapsedMs)
    ? Math.max(0, elapsedMs)
    : 0;
  const fromA = asVector(start && start.a, poses[0].a);
  const fromB = asVector(start && start.b, poses[0].b);
  const introMs = nearVector(fromA, poses[0].a) && nearVector(fromB, poses[0].b)
    ? 0
    : introSetting;

  if (elapsed <= introMs) {
    const u = easeInOutCubic(introMs === 0 ? 1 : elapsed / introMs);
    return {
      a: blendVector(fromA, poses[0].a, u),
      b: blendVector(fromB, poses[0].b, u),
      phase: "intro",
    };
  }

  const segments = poses.length - 1;
  const cycle = segmentMs * segments;
  let local = (elapsed - introMs) % cycle;
  if (local < 0) local += cycle;
  let index = Math.floor(local / segmentMs);
  if (index >= segments) index = segments - 1;
  const u = easeInOutCubic((local - index * segmentMs) / segmentMs);
  return {
    a: blendVector(poses[index].a, poses[index + 1].a, u),
    b: blendVector(poses[index].b, poses[index + 1].b, u),
    phase: "sweep",
  };
}

/** Component text for a swept field. Three decimal places, finite numbers only. */
export function formatSweepValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const rounded = round3(value);
  if (rounded === 0) return "0";
  return String(rounded);
}
