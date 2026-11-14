/**
 * Timed sweeps for the Animate control. Pure: no DOM, no imports.
 *
 * Ease, the original motion, slows into each pose with easeInOutCubic.
 * Glide, arc, orbit, bloom, and lattice move differently. blendSweep and
 * blendPresentations ease from the pose already on screen when those settings
 * change, without restarting the clock. sweepWires samples
 * one closed loop and keeps the tip paths, the ground projection, the vertical
 * drops, the span from A to B, and the A × B trail. Those polylines are the
 * wireframe the view retains while the arrows keep moving.
 * tracePlane flattens one slice of that mesh onto a single plane. Older
 * copies fade through wireOpacity, and those planes fade through planeOpacity.
 */

export const DEMO_INTRO_MS = 800;
export const DEMO_SEGMENT_MS = 1200;

/**
 * How long a change of motion or operation takes to ease in.
 * The blend weight uses easeInOutCubic, so position and speed match at both ends.
 */
export const MOTION_BLEND_MS = 900;

export const ANIMATION_TYPES = ["ease", "glide", "arc", "orbit", "bloom", "lattice"];

const LATTICE_SCALE = 1.5;

/** Octahedron corners. The lattice motion walks every edge of this solid. */
export const LATTICE_VERTICES = [
  { x: LATTICE_SCALE, y: 0, z: 0 },
  { x: 0, y: LATTICE_SCALE, z: 0 },
  { x: -LATTICE_SCALE, y: 0, z: 0 },
  { x: 0, y: -LATTICE_SCALE, z: 0 },
  { x: 0, y: 0, z: LATTICE_SCALE },
  { x: 0, y: 0, z: -LATTICE_SCALE },
];

const LATTICE_CIRCUIT = [0, 1, 2, 3, 0, 4, 1, 5, 2, 4, 3, 5];

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

/** Starts and ends at the same speed. Used by arc so it does not copy cubic ease. */
export function easeInOutSine(amount) {
  const t = clamp01(amount);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeOutCubic(amount) {
  const t = clamp01(amount);
  return 1 - (1 - t) ** 3;
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

function slerpVector(from, to, t) {
  const amount = clamp01(t);
  if (amount === 0) return copyVector(from);
  if (amount === 1) return copyVector(to);
  const fromLen = Math.hypot(from.x, from.y, from.z);
  const toLen = Math.hypot(to.x, to.y, to.z);
  if (!(fromLen > 1e-8) || !(toLen > 1e-8)) return blendVector(from, to, amount);
  const ux = from.x / fromLen;
  const uy = from.y / fromLen;
  const uz = from.z / fromLen;
  const vx = to.x / toLen;
  const vy = to.y / toLen;
  const vz = to.z / toLen;
  let cos = ux * vx + uy * vy + uz * vz;
  if (cos > 1) cos = 1;
  else if (cos < -1) cos = -1;
  const theta = Math.acos(cos);
  const length = lerp(fromLen, toLen, amount);
  if (!(theta > 1e-4)) {
    return {
      x: (ux + (vx - ux) * amount) * length,
      y: (uy + (vy - uy) * amount) * length,
      z: (uz + (vz - uz) * amount) * length,
    };
  }
  const sinTheta = Math.sin(theta);
  const w1 = Math.sin((1 - amount) * theta) / sinTheta;
  const w2 = Math.sin(amount * theta) / sinTheta;
  return {
    x: (ux * w1 + vx * w2) * length,
    y: (uy * w1 + vy * w2) * length,
    z: (uz * w1 + vz * w2) * length,
  };
}

function crossOf(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function durationMs(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

function motionId(value) {
  return ANIMATION_TYPES.includes(value) ? value : "ease";
}

function squircle(angle, power) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: Math.sign(c) * (Math.abs(c) ** power),
    z: Math.sign(s) * (Math.abs(s) ** power),
  };
}

function directed(yaw, pitch, radius) {
  const planar = Math.cos(pitch);
  return {
    x: radius * planar * Math.sin(yaw),
    y: radius * Math.sin(pitch),
    z: radius * planar * Math.cos(yaw),
  };
}

/** Steady squircle. Constant angle speed, so the wire is not an eased ring. */
function glidePose(progress) {
  const angle = progress * Math.PI * 2;
  const lift = 0.28 * Math.sin(2 * angle);
  const aFlat = squircle(angle, 0.45);
  const bFlat = squircle(angle + Math.PI / 4, 0.45);
  return {
    a: { x: 1.28 * aFlat.x, y: 0.22 + lift, z: 1.28 * aFlat.z },
    b: { x: 1.18 * bFlat.x, y: 0.55 - lift, z: 1.18 * bFlat.z },
  };
}

/** Lissajous orbits. A is a two-lobe wave on a circle; B adds a three-lobe wave. */
function orbitPose(progress) {
  const angle = progress * Math.PI * 2;
  return {
    a: {
      x: 1.35 * Math.sin(angle),
      y: 1.35 * 0.42 * Math.sin(2 * angle),
      z: 1.35 * Math.cos(angle),
    },
    b: {
      x: 1.22 * Math.cos(angle + 1.2),
      y: 1.22 * 0.55 * Math.sin(3 * angle),
      z: 1.22 * Math.sin(angle + 1.2),
    },
  };
}

/** Radius and pitch repeat 3 and 4 times, so the retained tips read as petals. */
function bloomPose(progress) {
  const yaw = progress * Math.PI * 2;
  const radiusA = 1.15 + 0.32 * Math.cos(3 * yaw);
  const radiusB = 1.12 + 0.28 * Math.cos(4 * yaw + 0.8);
  const pitchA = 0.62 * Math.sin(3 * yaw);
  const pitchB = 0.5 * Math.sin(4 * yaw + 0.8);
  return {
    a: directed(yaw, pitchA, radiusA),
    b: directed(yaw + 1.15, pitchB + 0.35, radiusB),
  };
}

function latticeVertex(offset, index) {
  const count = LATTICE_CIRCUIT.length;
  const slot = ((index + offset) % count + count) % count;
  return LATTICE_VERTICES[LATTICE_CIRCUIT[slot]];
}

/** Walks each octahedron edge, decelerating into the corner, then the next edge. */
function latticePose(progress) {
  const count = LATTICE_CIRCUIT.length;
  const scaled = progress * count;
  let index = Math.floor(scaled + 1e-9);
  let frac = scaled - index;
  if (index >= count) {
    index = 0;
    frac = 0;
  }
  const u = easeOutCubic(frac);
  return {
    a: blendVector(latticeVertex(0, index), latticeVertex(0, index + 1), u),
    b: blendVector(latticeVertex(6, index), latticeVertex(6, index + 1), u),
  };
}

function poseFor(motion, progress) {
  if (motion === "glide") return glidePose(progress);
  if (motion === "orbit") return orbitPose(progress);
  if (motion === "bloom") return bloomPose(progress);
  if (motion === "lattice") return latticePose(progress);
  return DEMO_POSES[0];
}

function firstPose(motion) {
  if (motion === "arc" || motion === "ease") return DEMO_POSES[0];
  return poseFor(motion, 0);
}

function elapsedMsOf(elapsedMs) {
  return typeof elapsedMs === "number" && Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
}

/**
 * Vectors at `elapsedMs` along the sweep.
 * Ease is the default: an intro eases from `start` into the first pose unless
 * the fields are already there, then easeInOutCubic runs between poses.
 * Other motions are selected with options.motion.
 */
export function sampleSweep(elapsedMs, start, options = {}) {
  const motion = motionId(options.motion);
  if (motion !== "ease") return sampleStyledMotion(motion, elapsedMs, start, options);

  const poses = Array.isArray(options.poses) && options.poses.length >= 2
    ? options.poses
    : DEMO_POSES;
  const introSetting = durationMs(options.introMs, DEMO_INTRO_MS);
  const segmentMs = Math.max(1, durationMs(options.segmentMs, DEMO_SEGMENT_MS));
  const elapsed = elapsedMsOf(elapsedMs);
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
      motion: "ease",
      progress: 0,
      laps: 0,
    };
  }

  const segments = poses.length - 1;
  const cycle = segmentMs * segments;
  let local = (elapsed - introMs) % cycle;
  if (local < 0) local += cycle;
  let index = Math.floor(local / segmentMs);
  if (index >= segments) index = segments - 1;
  const u = easeInOutCubic((local - index * segmentMs) / segmentMs);
  const traveled = elapsed - introMs;
  return {
    a: blendVector(poses[index].a, poses[index + 1].a, u),
    b: blendVector(poses[index].b, poses[index + 1].b, u),
    phase: "sweep",
    motion: "ease",
    progress: cycle > 0 ? local / cycle : 0,
    laps: cycle > 0 ? Math.floor(traveled / cycle) : 0,
  };
}

function isVector(value) {
  return !!value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

/**
 * Move `current` toward `target` by an exponential follow.
 * A zero or negative delta leaves `current` where it is, so a setting
 * change does not step the value on the same instant.
 */
export function damp(current, target, deltaMs, tauMs) {
  const from = typeof current === "number" && Number.isFinite(current) ? current : 0;
  const to = typeof target === "number" && Number.isFinite(target) ? target : from;
  const delta = typeof deltaMs === "number" && Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const tau = typeof tauMs === "number" && Number.isFinite(tauMs) && tauMs > 0 ? tauMs : 1;
  if (delta === 0) return from;
  const step = 1 - Math.exp(-delta / tau);
  return from + (to - from) * step;
}

/**
 * Crossfade two sweep samples. Amount 0 returns `from` and amount 1 returns `to`.
 * The weight eases in and out, and each arrow follows a great circle, so the
 * handoff matches the outgoing speed and then the incoming speed.
 */
export function blendSweep(from, to, amount) {
  const t = easeInOutCubic(amount);
  const fromA = isVector(from && from.a) ? from.a : { x: 0, y: 0, z: 0 };
  const fromB = isVector(from && from.b) ? from.b : { x: 0, y: 0, z: 0 };
  const toA = isVector(to && to.a) ? to.a : fromA;
  const toB = isVector(to && to.b) ? to.b : fromB;
  return {
    a: slerpVector(fromA, toA, t),
    b: slerpVector(fromB, toB, t),
    weight: t,
  };
}

function presentationOf(value) {
  const arrow = isVector(value && value.arrow) ? value.arrow : (isVector(value) ? value : null);
  const raw = value && typeof value.alpha === "number" ? value.alpha : (arrow ? 1 : 0);
  return { arrow, alpha: arrow ? clamp01(raw) : 0 };
}

/**
 * Crossfade two result arrows. Either side may be null when that operation
 * has no arrow. Amount 0 keeps `from`. Partial alphas blend as well, so a
 * nested handoff does not pop back to full strength.
 */
export function blendPresentations(from, to, amount) {
  const t = easeInOutCubic(amount);
  const left = presentationOf(from);
  const right = presentationOf(to);
  if (!left.arrow && !right.arrow) return { arrow: null, alpha: 0 };
  if (left.arrow && right.arrow) {
    return {
      arrow: slerpVector(left.arrow, right.arrow, t),
      alpha: left.alpha + (right.alpha - left.alpha) * t,
    };
  }
  if (left.arrow) return { arrow: copyVector(left.arrow), alpha: left.alpha * (1 - t) };
  return { arrow: copyVector(right.arrow), alpha: right.alpha * t };
}

function sampleStyledMotion(motion, elapsedMs, start, options) {
  const segmentMs = Math.max(1, durationMs(options.segmentMs, DEMO_SEGMENT_MS));
  const introSetting = durationMs(options.introMs, DEMO_INTRO_MS);
  const elapsed = elapsedMsOf(elapsedMs);
  const segments = motion === "arc" ? DEMO_POSES.length - 1 : SWEEP_STEPS;
  const cycle = segmentMs * segments;
  const first = firstPose(motion);
  const fromA = asVector(start && start.a, first.a);
  const fromB = asVector(start && start.b, first.b);
  const introMs = nearVector(fromA, first.a) && nearVector(fromB, first.b) ? 0 : introSetting;
  const blend = motion === "arc" ? slerpVector : blendVector;
  const introEase = motion === "glide" ? clamp01 : easeInOutCubic;

  if (elapsed <= introMs) {
    const u = introMs === 0 ? 1 : introEase(elapsed / introMs);
    return {
      a: blend(fromA, first.a, u),
      b: blend(fromB, first.b, u),
      phase: "intro",
      motion,
      progress: 0,
      laps: 0,
    };
  }

  let local = (elapsed - introMs) % cycle;
  if (local < 0) local += cycle;
  const laps = Math.floor((elapsed - introMs) / cycle);
  const progress = cycle > 0 ? local / cycle : 0;

  if (motion === "arc") {
    let index = Math.floor(local / segmentMs);
    if (index >= segments) index = segments - 1;
    const u = easeInOutSine((local - index * segmentMs) / segmentMs);
    return {
      a: slerpVector(DEMO_POSES[index].a, DEMO_POSES[index + 1].a, u),
      b: slerpVector(DEMO_POSES[index].b, DEMO_POSES[index + 1].b, u),
      phase: "sweep",
      motion,
      progress,
      laps,
    };
  }

  const pose = poseFor(motion, progress);
  return {
    a: pose.a,
    b: pose.b,
    phase: "sweep",
    motion,
    progress,
    laps,
  };
}

function pushCopy(list, vector) {
  list.push(copyVector(vector));
}

/**
 * One closed sweep as wires. Each sample keeps the attributes that draw the
 * wireframe: tips of A and B, their ground projections, a vertical drop,
 * the span from A to B, and the cross product A × B.
 */
export function sweepWires(motion = "ease", steps = 144) {
  const motionName = motionId(motion);
  const count = Math.max(12, Math.round(steps) || 144);
  const first = firstPose(motionName);
  const start = { a: copyVector(first.a), b: copyVector(first.b) };
  const segments = motionName === "arc" || motionName === "ease" ? DEMO_POSES.length - 1 : SWEEP_STEPS;
  const cycle = DEMO_SEGMENT_MS * segments;
  const wires = {
    a: [],
    b: [],
    cross: [],
    shadowA: [],
    shadowB: [],
    spans: [],
    drops: [],
  };

  for (let i = 0; i <= count; i += 1) {
    const sample = sampleSweep(cycle * (i / count), start, { motion: motionName, introMs: 0 });
    pushCopy(wires.a, sample.a);
    pushCopy(wires.b, sample.b);
    wires.cross.push(crossOf(sample.a, sample.b));
    wires.shadowA.push({ x: sample.a.x, y: 0, z: sample.a.z });
    wires.shadowB.push({ x: sample.b.x, y: 0, z: sample.b.z });
    if (i % 6 === 0) {
      const tipA = copyVector(sample.a);
      const tipB = copyVector(sample.b);
      wires.spans.push([tipA, tipB]);
      wires.drops.push([tipA, { x: tipA.x, y: 0, z: tipA.z }]);
      wires.drops.push([tipB, { x: tipB.x, y: 0, z: tipB.z }]);
    }
  }

  return wires;
}

function slicePolyline(points, count) {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (count >= points.length) return points;
  return points.slice(0, count);
}

/**
 * Portion of a wireframe revealed by the current lap.
 * After the first lap the whole image stays, even when progress wraps.
 */
export function revealWires(wires, progress, laps = 0) {
  if (!wires || typeof wires !== "object") return null;
  const safeLaps = typeof laps === "number" && Number.isFinite(laps) ? laps : 0;
  const safeProgress = typeof progress === "number" && Number.isFinite(progress) ? progress : 0;
  const full = {
    a: wires.a || [],
    b: wires.b || [],
    cross: wires.cross || [],
    shadowA: wires.shadowA || [],
    shadowB: wires.shadowB || [],
    spans: wires.spans || [],
    drops: wires.drops || [],
  };
  if (safeLaps >= 1 || safeProgress >= 1) return full;

  const total = full.a.length;
  if (total === 0) {
    return { a: [], b: [], cross: [], shadowA: [], shadowB: [], spans: [], drops: [] };
  }
  const p = Math.max(0, Math.min(safeProgress, 1));
  const count = Math.max(1, Math.ceil(p * (total - 1)) + 1);
  const spanCount = full.spans.length === 0 ? 0 : Math.max(0, Math.ceil(p * full.spans.length));
  const dropCount = full.drops.length === 0 ? 0 : Math.max(0, Math.ceil(p * full.drops.length));
  return {
    a: slicePolyline(full.a, count),
    b: slicePolyline(full.b, count),
    cross: slicePolyline(full.cross, count),
    shadowA: slicePolyline(full.shadowA, count),
    shadowB: slicePolyline(full.shadowB, count),
    spans: full.spans.slice(0, spanCount),
    drops: full.drops.slice(0, dropCount),
  };
}

/** How long a retired wireframe takes to disappear. */
export const WIRE_FADE_MS = 2400;

/** How long a trace plane stays up while its translucency falls away. */
export const PLANE_LIFE_MS = 7000;

/** Peak opacity of a trace plane. It starts translucent and only gets fainter. */
export const PLANE_PEAK = 0.26;

/**
 * Settings the auto control walks. Normalize is first because that is the
 * motion the view opens on; later steps visit every other operation.
 */
export const OPERATION_CYCLE = ["normalize", "cross", "magnitude", "angle", "dot"];

function centroidOf(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const scale = 1 / points.length;
  return { x: x * scale, y: y * scale, z: z * scale };
}

function unitTriple(x, y, z) {
  const len = Math.hypot(x, y, z);
  if (!(len > 1e-8)) return null;
  return { x: x / len, y: y / len, z: z / len };
}

function crossTriple(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Best-fit normal for a small cloud, plus the centroid the plane passes through.
 * Returns null when the points are collinear.
 */
function fitPlane(points) {
  const center = centroidOf(points);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const origin = points[i];
    const ax = origin.x - center.x;
    const ay = origin.y - center.y;
    const az = origin.z - center.z;
    for (let j = i + 1; j < points.length; j += 3) {
      const other = points[j];
      const bx = other.x - center.x;
      const by = other.y - center.y;
      const bz = other.z - center.z;
      nx += ay * bz - az * by;
      ny += az * bx - ax * bz;
      nz += ax * by - ay * bx;
    }
  }
  const normal = unitTriple(nx, ny, nz);
  if (!normal) return null;
  return { center, normal };
}

function projectOntoPlane(point, center, normal) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const distance = dx * normal.x + dy * normal.y + dz * normal.z;
  return {
    x: point.x - normal.x * distance,
    y: point.y - normal.y * distance,
    z: point.z - normal.z * distance,
  };
}

function planeBasis(normal) {
  const hint = Math.abs(normal.y) < 0.85 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangent = unitTriple(
    hint.y * normal.z - hint.z * normal.y,
    hint.z * normal.x - hint.x * normal.z,
    hint.x * normal.y - hint.y * normal.x,
  );
  if (!tangent) return null;
  const bitangent = crossTriple(normal, tangent);
  return { tangent, bitangent };
}

function traceSamples(wires, progress) {
  const primary = wires.a;
  const total = primary.length;
  const head = Math.round(clamp01(progress) * (total - 1));
  const window = Math.max(6, Math.round(total * 0.16));
  const samples = [];
  for (let step = 0; step <= window; step += 1) {
    const index = (head - window + step + total * 4) % total;
    samples.push(primary[index]);
    if (wires.b && wires.b[index]) samples.push(wires.b[index]);
    if (step % 2 === 0 && wires.cross && wires.cross[index]) samples.push(wires.cross[index]);
  }
  return samples.filter((point) => (
    point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
  ));
}

function outlinePlane(samples) {
  const fit = fitPlane(samples);
  if (!fit) return null;
  const basis = planeBasis(fit.normal);
  if (!basis) return null;
  const flat = [];
  for (const sample of samples) {
    const point = projectOntoPlane(sample, fit.center, fit.normal);
    const dx = point.x - fit.center.x;
    const dy = point.y - fit.center.y;
    const dz = point.z - fit.center.z;
    const u = dx * basis.tangent.x + dy * basis.tangent.y + dz * basis.tangent.z;
    const v = dx * basis.bitangent.x + dy * basis.bitangent.y + dz * basis.bitangent.z;
    if (flat.some((item) => Math.hypot(item.u - u, item.v - v) < 1e-3)) continue;
    flat.push({ point, u, v });
  }
  if (flat.length < 3) return null;
  flat.sort((left, right) => Math.atan2(left.v, left.u) - Math.atan2(right.v, right.u));
  let area = 0;
  for (let i = 0; i < flat.length; i += 1) {
    const next = flat[(i + 1) % flat.length];
    area += leftCross(flat[i], next);
  }
  if (Math.abs(area) < 1e-4) return null;
  return {
    points: flat.map((item) => item.point),
    normal: fit.normal,
  };
}

function leftCross(a, b) {
  return a.u * b.v - a.v * b.u;
}

/**
 * One flat plate cut from the mesh at `progress` (0–1 along the closed sweep).
 * Tips of A and B, plus the cross-product trail, are projected onto a single
 * plane and ordered around their centroid. Null when the slice has no area.
 */
export function tracePlane(wires, progress) {
  if (!wires || !Array.isArray(wires.a) || wires.a.length < 8) return null;
  const samples = traceSamples(wires, progress);
  if (samples.length < 6) return null;
  return outlinePlane(samples);
}

/** Retired wireframes fade from opaque to gone across WIRE_FADE_MS. */
export function wireOpacity(ageMs, fadeMs = WIRE_FADE_MS) {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs === 0) return 1;
  const life = typeof fadeMs === "number" && fadeMs > 0 ? fadeMs : WIRE_FADE_MS;
  if (ageMs >= life) return 0;
  const remain = 1 - ageMs / life;
  return remain * remain;
}

/**
 * Trace planes start translucent (PLANE_PEAK) and fade to nothing.
 * Non-finite or negative ages are invisible.
 */
export function planeOpacity(ageMs, lifeMs = PLANE_LIFE_MS) {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs) || ageMs < 0) return 0;
  const life = typeof lifeMs === "number" && lifeMs > 0 ? lifeMs : PLANE_LIFE_MS;
  if (ageMs >= life) return 0;
  const remain = 1 - ageMs / life;
  return PLANE_PEAK * remain * remain;
}

/** Next motion and operation for the auto control. Unknown names start at orbit. */
export function nextAnimationStep(motion, operation) {
  const motionIndex = ANIMATION_TYPES.indexOf(motion);
  const operationIndex = OPERATION_CYCLE.indexOf(operation);
  const nextMotion = ANIMATION_TYPES[(motionIndex < 0 ? 3 : motionIndex + 1) % ANIMATION_TYPES.length];
  const nextOperation = OPERATION_CYCLE[(operationIndex < 0 ? 0 : operationIndex + 1) % OPERATION_CYCLE.length];
  return { motion: nextMotion, operation: nextOperation };
}

/** Component text for a swept field. Three decimal places, finite numbers only. */
export function formatSweepValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const rounded = round3(value);
  if (rounded === 0) return "0";
  return String(rounded);
}
