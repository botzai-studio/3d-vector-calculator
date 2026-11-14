/**
 * Y-up, right-handed perspective scene for vectors A, B, and an optional result.
 * Camera basis math stays in this file. The module has no imports, and the
 * top level does not read document or window.
 *
 * project(point, camera) is pure. camera is:
 * { position, target, up, fov, width, height }
 * fov is the vertical field of view in radians. The result is canvas pixels
 * with the origin at the top left, or null when the point is behind the camera.
 *
 * createScene(canvas) draws an XZ grid, an RGB axis triad, and the arrows.
 * setVectors may also include wires and wireBounds: polylines retained from
 * a sweep (tips, shadows, drops, A–B spans, and the A × B trail).
 * fading is older wireframes with an alpha, planes are translucent trace
 * plates, and wireHead fades the live trail behind the moving tips.
 * wireAlpha and resultAlpha fade the live trace and the result arrow.
 * extentFollow, when set, eases the camera distance toward the new frame.
 * A starfield is drawn behind the grid. orbitBy yaws the camera around the
 * origin unless the user is dragging.
 * It returns { setVectors, orbitBy, resize, destroy, getCamera }. Calling
 * createScene again with the same canvas returns the existing scene.
 */

const COLOR = {
  background: "#0f1720",
  surface: "#16212c",
  text: "#e6edf3",
  grid: "#8ea6b8",
  legendBorder: "#6d8498",
  a: "#3ee0c5",
  b: "#ffb020",
  result: "#e85dff",
  span: "#22d3ee",
  axisX: "#ff5a5a",
  axisY: "#5dff7a",
  axisZ: "#5aa6ff",
};

const FOV = Math.PI / 4;
const DEFAULT_YAW = 0.62;
const DEFAULT_PITCH = 0.42;
const MIN_WORLD_EXTENT = 2;
const ARROW_FILL = 0.7;
const PITCH_MIN = -1.15;
const PITCH_MAX = 1.25;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;
const NEAR = 0.05;
const ORIGIN = { x: 0, y: 0, z: 0 };
const STAR_BRIGHT = "#f4f4f8";
const STAR_COOL = "#22d3ee";
const STAR_DIM = "#9a9ab0";

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap01(value) {
  const mod = value % 1;
  return mod < 0 ? mod + 1 : mod;
}

/**
 * Screen-space starfield. u and v are fractions of the view. depth is how
 * far the star sits, so a camera turn shifts nearer stars a little more.
 */
export function createStarfield(count = 180, seed = 37) {
  const total = Math.max(1, Math.round(count) || 180);
  const random = mulberry32(seed >>> 0);
  const stars = [];
  for (let i = 0; i < total; i += 1) {
    const mag = random();
    const roll = random();
    stars.push({
      u: random(),
      v: random(),
      mag,
      depth: 0.28 + random() * 0.72,
      color: roll > 0.92 ? STAR_COOL : roll > 0.45 ? STAR_BRIGHT : STAR_DIM,
    });
  }
  return stars;
}

const STARS = createStarfield(180, 37);

/** Opacity of a trail point. `along` and `head` are fractions of the polyline. */
function trailFactor(along, head) {
  let behind = head - along;
  behind -= Math.floor(behind);
  return 0.28 + 0.72 * (1 - behind) ** 1.5;
}

const scenes = new WeakMap();

function isFinitePoint(point) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function lengthOf(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const len = lengthOf(vector);
  if (!(len > 1e-12)) return null;
  return scale(vector, 1 / len);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asVector(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function verticalFov(camera) {
  const fov = camera && camera.fov;
  if (typeof fov === "number" && fov > 0.05 && fov < Math.PI - 0.05) return fov;
  return FOV;
}

function frameDistance(worldExtent, fov, aspect) {
  const tanHalf = Math.tan(fov / 2);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const limit = safeAspect >= 1 ? 1 : safeAspect;
  const denom = 2 * tanHalf * limit;
  if (!(denom > 0)) return 6;
  return Math.max(worldExtent, 0.001) / denom;
}

function wireReach(wires, longest) {
  if (!wires) return longest;
  const groups = [wires.a, wires.b, wires.cross, wires.shadowA, wires.shadowB];
  let reach = longest;
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const point of group) {
      if (!isFinitePoint(point)) continue;
      const len = lengthOf(point);
      if (len > reach) reach = len;
    }
  }
  return reach;
}

function framedExtent(vectors, wires) {
  let longest = 0;
  for (const vector of vectors) {
    if (!vector) continue;
    const len = lengthOf(vector);
    if (len > longest) longest = len;
  }
  longest = wireReach(wires, longest);
  // Full view height. An arrow starts at the origin, so the view has to be
  // twice the length that should reach 70% of the way to the edge.
  const filled = longest > 0 ? (2 * longest) / ARROW_FILL : 0;
  return Math.max(filled, MIN_WORLD_EXTENT);
}

function orbitPosition(yaw, pitch, distance) {
  const planar = Math.cos(pitch);
  return {
    x: distance * planar * Math.sin(yaw),
    y: distance * Math.sin(pitch),
    z: distance * planar * Math.cos(yaw),
  };
}

function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / pow;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Orthonormal camera basis. forward looks from the eye toward the target,
 * right is screen-right, and up is screen-up. Right-handed and Y-up.
 */
export function cameraBasis(camera) {
  const eye = camera.position;
  const target = isFinitePoint(camera.target) ? camera.target : ORIGIN;
  const worldUp = isFinitePoint(camera.up) ? camera.up : { x: 0, y: 1, z: 0 };
  let forward = normalize(sub(target, eye));
  if (!forward) forward = { x: 0, y: 0, z: -1 };

  let right = normalize(cross(forward, worldUp));
  if (!right) {
    const helper = Math.abs(forward.y) > 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    right = normalize(cross(forward, helper));
  }
  if (!right) right = { x: 1, y: 0, z: 0 };

  let up = normalize(cross(right, forward));
  if (!up) up = { x: 0, y: 1, z: 0 };
  return { right, up, forward };
}

function toCameraSpace(point, eye, basis) {
  const offset = sub(point, eye);
  return {
    x: dot(offset, basis.right),
    y: dot(offset, basis.up),
    z: dot(offset, basis.forward),
  };
}

function projectCameraPoint(cam, camera) {
  const width = Number(camera.width);
  const height = Number(camera.height);
  if (!(width > 0) || !(height > 0) || !(cam.z > 1e-6)) return null;
  const tanHalf = Math.tan(verticalFov(camera) / 2);
  if (!(tanHalf > 0)) return null;
  const ndcX = cam.x / (cam.z * tanHalf * (width / height));
  const ndcY = cam.y / (cam.z * tanHalf);
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: (ndcX + 1) * 0.5 * width,
    y: (1 - ndcY) * 0.5 * height,
    depth: cam.z,
  };
}

/**
 * Project a world-space point to canvas pixels for a perspective camera
 * that looks at its target. The target lands on the view center.
 */
export function project(point, camera) {
  if (!isFinitePoint(point) || !camera || !isFinitePoint(camera.position)) return null;
  const basis = cameraBasis(camera);
  return projectCameraPoint(toCameraSpace(point, camera.position, basis), camera);
}

/**
 * Default view: front-right of the origin (+X, +Z) and slightly raised (+Y),
 * framed so a world extent of 2 fills the smaller screen side.
 */
export function createDefaultCamera(width = 800, height = 600) {
  const viewWidth = width > 0 ? width : 800;
  const viewHeight = height > 0 ? height : 600;
  const distance = frameDistance(MIN_WORLD_EXTENT, FOV, viewWidth / viewHeight);
  return {
    position: orbitPosition(DEFAULT_YAW, DEFAULT_PITCH, distance),
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: FOV,
    width: viewWidth,
    height: viewHeight,
  };
}

function clipSegment(start, end, near) {
  const startIn = start.z >= near;
  const endIn = end.z >= near;
  if (startIn && endIn) return [start, end];
  if (!startIn && !endIn) return null;
  const denom = end.z - start.z;
  if (Math.abs(denom) < 1e-8) return null;
  const t = (near - start.z) / denom;
  const hit = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: near,
  };
  return startIn ? [start, hit] : [hit, end];
}

function rayDirection(basis, ndcX, ndcY, tanHalf, aspect) {
  return add(
    add(scale(basis.right, ndcX * tanHalf * aspect), scale(basis.up, ndcY * tanHalf)),
    basis.forward,
  );
}

function groundHit(eye, direction) {
  if (Math.abs(direction.y) < 1e-5) return null;
  const t = -eye.y / direction.y;
  if (!(t > NEAR) || !Number.isFinite(t)) return null;
  return {
    x: eye.x + direction.x * t,
    z: eye.z + direction.z * t,
  };
}

function gridLayout(camera, basis) {
  const distance = Math.max(lengthOf(sub(camera.position, camera.target || ORIGIN)), 0.4);
  const tanHalf = Math.tan(verticalFov(camera) / 2);
  const aspect = camera.width / Math.max(camera.height, 1);
  const eye = camera.position;
  const center = groundHit(eye, rayDirection(basis, 0, 0, tanHalf, aspect));
  const bottom = groundHit(eye, rayDirection(basis, 0, -1, tanHalf, aspect));
  const left = groundHit(eye, rayDirection(basis, -1, -0.15, tanHalf, aspect));
  const right = groundHit(eye, rayDirection(basis, 1, -0.15, tanHalf, aspect));

  let sample = 0;
  if (center && bottom) {
    sample = Math.max(sample, Math.hypot(center.x - bottom.x, center.z - bottom.z));
  }
  if (left && right) {
    sample = Math.max(sample, Math.hypot(left.x - right.x, left.z - right.z));
  }
  if (!(sample > 0)) sample = Math.max(distance, MIN_WORLD_EXTENT);

  let step = niceStep(Math.max(sample / 10, 0.25));
  let reach = Math.max(sample * 2.5, distance * 6, MIN_WORLD_EXTENT * 2);
  if (!Number.isFinite(reach)) reach = 20;
  let count = Math.ceil(reach / step);
  for (let guard = 0; count > 22 && guard < 16; guard += 1) {
    step *= 2;
    count = Math.ceil(reach / step);
  }
  if (!Number.isFinite(count) || count < 2) count = 4;
  return { step, count };
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawScreenArrow(ctx, from, to, color, dpr, headLength, shaftWidth) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (!(len > 0.5)) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(to.x, to.y, Math.max(2, 2.5 * dpr), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const ux = dx / len;
  const uy = dy / len;
  const head = headLength > 0 ? Math.min(headLength, len * 0.55) : 0;
  const endX = head > 0 ? to.x - ux * head : to.x;
  const endY = head > 0 ? to.y - uy * head : to.y;
  const width = shaftWidth > 0 ? shaftWidth : 2.4 * dpr;

  ctx.strokeStyle = "rgba(15, 23, 32, 0.92)";
  ctx.lineWidth = width + 1.8 * dpr;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  if (!(head > 0)) return;
  const wing = head * 0.46;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(endX - uy * wing, endY + ux * wing);
  ctx.lineTo(endX + uy * wing, endY - ux * wing);
  ctx.closePath();
  ctx.fill();
}

function drawWorldArrow(ctx, from, to, color, camera, basis, dpr, headLength, shaftWidth) {
  const fromCam = toCameraSpace(from, camera.position, basis);
  const toCam = toCameraSpace(to, camera.position, basis);
  const clipped = clipSegment(fromCam, toCam, NEAR);
  if (!clipped) return;
  const start = projectCameraPoint(clipped[0], camera);
  const end = projectCameraPoint(clipped[1], camera);
  if (!start || !end) return;
  const showHead = headLength > 0 && toCam.z >= NEAR;
  drawScreenArrow(ctx, start, end, color, dpr, showHead ? headLength : 0, shaftWidth);
}

function drawGrid(ctx, camera, basis, dpr) {
  const layout = gridLayout(camera, basis);
  const extent = layout.step * layout.count;
  const segments = [];
  for (let i = -layout.count; i <= layout.count; i += 1) {
    const offset = i * layout.step;
    const lines = [
      [{ x: -extent, y: 0, z: offset }, { x: extent, y: 0, z: offset }],
      [{ x: offset, y: 0, z: -extent }, { x: offset, y: 0, z: extent }],
    ];
    for (const [from, to] of lines) {
      const fromCam = toCameraSpace(from, camera.position, basis);
      const toCam = toCameraSpace(to, camera.position, basis);
      const clipped = clipSegment(fromCam, toCam, NEAR);
      if (!clipped) continue;
      const start = projectCameraPoint(clipped[0], camera);
      const end = projectCameraPoint(clipped[1], camera);
      if (!start || !end) continue;
      segments.push({ start, end, depth: (clipped[0].z + clipped[1].z) * 0.5 });
    }
  }

  segments.sort((a, b) => b.depth - a.depth);
  ctx.lineCap = "round";
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = Math.max(1, dpr);
  for (const segment of segments) {
    ctx.beginPath();
    ctx.moveTo(segment.start.x, segment.start.y);
    ctx.lineTo(segment.end.x, segment.end.y);
    ctx.stroke();
  }
  return layout;
}

function labelOnScreen(point, camera, pad) {
  return point.x >= pad
    && point.y >= pad
    && point.x <= camera.width - pad
    && point.y <= camera.height - pad;
}

function drawAxes(ctx, camera, basis, dpr, step) {
  const distance = Math.max(lengthOf(sub(camera.position, camera.target || ORIGIN)), 0.4);
  const viewHeight = 2 * distance * Math.tan(verticalFov(camera) / 2);
  const axisLength = Math.min(Math.max(step, 1), Math.max(viewHeight * 0.4, 0.35));
  const axes = [
    { dir: { x: 1, y: 0, z: 0 }, color: COLOR.axisX, label: "X" },
    { dir: { x: 0, y: 1, z: 0 }, color: COLOR.axisY, label: "Y" },
    { dir: { x: 0, y: 0, z: 1 }, color: COLOR.axisZ, label: "Z" },
  ];

  for (const axis of axes) {
    const positive = scale(axis.dir, axisLength);
    const negative = scale(axis.dir, -axisLength);
    drawWorldArrow(ctx, negative, ORIGIN, axis.color, camera, basis, dpr, 0, 1.5 * dpr);
    drawWorldArrow(ctx, ORIGIN, positive, axis.color, camera, basis, dpr, 12 * dpr, 1.75 * dpr);

    const tip = project(positive, camera);
    const tail = project(ORIGIN, camera);
    if (!tip || !tail) continue;
    const dx = tip.x - tail.x;
    const dy = tip.y - tail.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 18 * dpr)) continue;
    const label = {
      x: tip.x + (dx / len) * 14 * dpr,
      y: tip.y + (dy / len) * 14 * dpr,
    };
    if (!labelOnScreen(label, camera, 4 * dpr)) continue;
    ctx.font = `600 ${12 * dpr}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = axis.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(axis.label, label.x, label.y);
  }
}

function strokeWorldSegment(ctx, from, to, camera, basis) {
  const clipped = clipSegment(
    toCameraSpace(from, camera.position, basis),
    toCameraSpace(to, camera.position, basis),
    NEAR,
  );
  if (!clipped) return null;
  const start = projectCameraPoint(clipped[0], camera);
  const end = projectCameraPoint(clipped[1], camera);
  if (!start || !end) return null;
  return { start, end };
}

function drawWorldPolyline(ctx, points, color, camera, basis, width, alpha, minLength, head) {
  if (!points || points.length < 2 || !(alpha > 0.02)) return;
  const trailed = typeof head === "number" && Number.isFinite(head);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (!trailed) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let penDown = false;
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      if (minLength && (lengthOf(from) < minLength || lengthOf(to) < minLength)) {
        penDown = false;
        continue;
      }
      const segment = strokeWorldSegment(ctx, from, to, camera, basis);
      if (!segment) {
        penDown = false;
        continue;
      }
      if (!penDown) {
        ctx.moveTo(segment.start.x, segment.start.y);
        penDown = true;
      }
      ctx.lineTo(segment.end.x, segment.end.y);
    }
    if (penDown) ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const last = points.length - 1;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (minLength && (lengthOf(from) < minLength || lengthOf(to) < minLength)) continue;
    const fade = alpha * trailFactor(i / last, head);
    if (!(fade > 0.02)) continue;
    const segment = strokeWorldSegment(ctx, from, to, camera, basis);
    if (!segment) continue;
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.moveTo(segment.start.x, segment.start.y);
    ctx.lineTo(segment.end.x, segment.end.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWorldSegments(ctx, segments, color, camera, basis, width, alpha, head) {
  if (!segments || segments.length === 0 || !(alpha > 0.02)) return;
  const trailed = typeof head === "number" && Number.isFinite(head);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  if (!trailed) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let any = false;
    for (const segment of segments) {
      if (!segment || segment.length < 2) continue;
      const painted = strokeWorldSegment(ctx, segment[0], segment[1], camera, basis);
      if (!painted) continue;
      ctx.moveTo(painted.start.x, painted.start.y);
      ctx.lineTo(painted.end.x, painted.end.y);
      any = true;
    }
    if (any) ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const last = Math.max(1, segments.length - 1);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment || segment.length < 2) continue;
    const fade = alpha * trailFactor(index / last, head);
    if (!(fade > 0.02)) continue;
    const painted = strokeWorldSegment(ctx, segment[0], segment[1], camera, basis);
    if (!painted) continue;
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.moveTo(painted.start.x, painted.start.y);
    ctx.lineTo(painted.end.x, painted.end.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWires(ctx, camera, basis, dpr, wires, alpha = 1, head = null) {
  if (!wires || !(alpha > 0.02)) return;
  const hair = Math.max(1, dpr);
  drawWorldPolyline(ctx, wires.shadowA, COLOR.a, camera, basis, hair, 0.28 * alpha, 0, head);
  drawWorldPolyline(ctx, wires.shadowB, COLOR.b, camera, basis, hair, 0.28 * alpha, 0, head);
  drawWorldSegments(ctx, wires.drops, COLOR.span, camera, basis, hair, 0.4 * alpha, head);
  drawWorldSegments(ctx, wires.spans, COLOR.span, camera, basis, 1.15 * hair, 0.72 * alpha, head);
  drawWorldPolyline(ctx, wires.cross, COLOR.result, camera, basis, 1.35 * hair, 0.85 * alpha, 0.08, head);
  drawWorldPolyline(ctx, wires.a, COLOR.a, camera, basis, 1.7 * hair, 0.95 * alpha, 0, head);
  drawWorldPolyline(ctx, wires.b, COLOR.b, camera, basis, 1.7 * hair, 0.95 * alpha, 0, head);
}

function drawStars(ctx, camera, dpr, yaw, pitch) {
  const width = camera.width;
  const height = camera.height;
  for (const star of STARS) {
    const x = wrap01(star.u + yaw * 0.11 * star.depth) * width;
    const y = wrap01(star.v - pitch * 0.07 * star.depth) * height;
    const radius = (0.55 + star.mag * 1.35) * dpr * (0.7 + star.depth * 0.45);
    ctx.fillStyle = star.color;
    ctx.globalAlpha = 0.22 + star.mag * 0.62;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (star.mag > 0.84) {
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlanes(ctx, camera, basis, dpr, planes) {
  if (!planes || planes.length === 0) return;
  for (const plane of planes) {
    if (!plane || !(plane.alpha > 0.015) || !plane.points || plane.points.length < 3) continue;
    const projected = [];
    let hidden = false;
    for (const point of plane.points) {
      const space = toCameraSpace(point, camera.position, basis);
      if (!(space.z > NEAR)) {
        hidden = true;
        break;
      }
      const screen = projectCameraPoint(space, camera);
      if (!screen) {
        hidden = true;
        break;
      }
      projected.push(screen);
    }
    if (hidden || projected.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i += 1) ctx.lineTo(projected[i].x, projected[i].y);
    ctx.closePath();
    ctx.globalAlpha = plane.alpha;
    ctx.fillStyle = plane.color;
    ctx.fill();
    ctx.globalAlpha = Math.min(0.8, plane.alpha * 1.25);
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeStyle = plane.color;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawVectors(ctx, camera, basis, dpr, vectors, resultAlpha = 1) {
  const fade = typeof resultAlpha === "number" && Number.isFinite(resultAlpha)
    ? Math.min(1, Math.max(0, resultAlpha))
    : 1;
  const items = [
    { vector: vectors.a, color: COLOR.a, alpha: 1 },
    { vector: vectors.b, color: COLOR.b, alpha: 1 },
    { vector: vectors.result, color: COLOR.result, alpha: fade },
  ];
  const visible = [];
  for (const item of items) {
    if (!item.vector || !(item.alpha > 0.02) || lengthOf(item.vector) < 1e-8) continue;
    const tip = toCameraSpace(item.vector, camera.position, basis);
    visible.push({ vector: item.vector, color: item.color, depth: tip.z, alpha: item.alpha });
  }
  visible.sort((a, b) => b.depth - a.depth);
  for (const item of visible) {
    ctx.globalAlpha = item.alpha;
    drawWorldArrow(ctx, ORIGIN, item.vector, item.color, camera, basis, dpr, 14 * dpr, 2.6 * dpr);
    ctx.globalAlpha = 1;
  }
}

function drawOrigin(ctx, camera, dpr) {
  const origin = project(ORIGIN, camera);
  if (!origin) return;
  ctx.fillStyle = COLOR.text;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 2.5 * dpr, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegend(ctx, dpr, showResult, showTrace, showPlane) {
  const items = [
    { label: "A", color: COLOR.a },
    { label: "B", color: COLOR.b },
  ];
  if (showResult) items.push({ label: "Result", color: COLOR.result });
  if (showTrace) items.push({ label: "Trace", color: COLOR.span });
  if (showPlane) items.push({ label: "Plane", color: COLOR.span });

  const fontSize = 13 * dpr;
  ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let textWidth = 0;
  for (const item of items) {
    textWidth = Math.max(textWidth, ctx.measureText(item.label).width);
  }

  const padX = 12 * dpr;
  const padY = 10 * dpr;
  const rowH = 22 * dpr;
  const swatch = 10 * dpr;
  const gap = 8 * dpr;
  const boxW = padX * 2 + swatch + gap + textWidth;
  const boxH = padY * 2 + rowH * items.length;
  const x = 16 * dpr;
  const y = 16 * dpr;

  roundRect(ctx, x, y, boxW, boxH, 10 * dpr);
  ctx.fillStyle = COLOR.surface;
  ctx.fill();
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = COLOR.legendBorder;
  ctx.stroke();

  items.forEach((item, index) => {
    const cy = y + padY + rowH * index + rowH / 2;
    roundRect(ctx, x + padX, cy - swatch / 2, swatch, swatch, 2 * dpr);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = COLOR.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, x + padX + swatch + gap, cy);
  });
}

function normalizePolyline(list) {
  if (!Array.isArray(list)) return [];
  const points = [];
  for (const point of list) {
    const vector = asVector(point);
    if (vector) points.push(vector);
  }
  return points;
}

function normalizeSegments(list) {
  if (!Array.isArray(list)) return [];
  const segments = [];
  for (const segment of list) {
    if (!segment || segment.length < 2) continue;
    const from = asVector(segment[0]);
    const to = asVector(segment[1]);
    if (from && to) segments.push([from, to]);
  }
  return segments;
}

function normalizeFading(list) {
  if (!Array.isArray(list)) return [];
  const layers = [];
  for (const layer of list) {
    const wires = normalizeWires(layer && layer.wires);
    const alpha = Number(layer && layer.alpha);
    if (!wires || !(alpha > 0)) continue;
    const rawHead = layer && layer.head;
    layers.push({
      wires,
      alpha: Math.min(1, alpha),
      head: typeof rawHead === "number" && Number.isFinite(rawHead) ? rawHead : null,
    });
  }
  return layers;
}

function normalizePlanes(list) {
  if (!Array.isArray(list)) return [];
  const planes = [];
  for (const plane of list) {
    const points = normalizePolyline(plane && plane.points);
    const alpha = Number(plane && plane.alpha);
    if (points.length < 3 || !(alpha > 0)) continue;
    const color = typeof plane.color === "string" && plane.color ? plane.color : COLOR.span;
    planes.push({ points, alpha: Math.min(1, alpha), color });
  }
  return planes;
}

function normalizeWires(wires) {
  if (!wires || typeof wires !== "object") return null;
  const normalized = {
    a: normalizePolyline(wires.a),
    b: normalizePolyline(wires.b),
    cross: normalizePolyline(wires.cross),
    shadowA: normalizePolyline(wires.shadowA),
    shadowB: normalizePolyline(wires.shadowB),
    spans: normalizeSegments(wires.spans),
    drops: normalizeSegments(wires.drops),
  };
  const count = normalized.a.length
    + normalized.b.length
    + normalized.cross.length
    + normalized.spans.length
    + normalized.drops.length;
  if (count === 0) return null;
  return normalized;
}

function readDevicePixelRatio() {
  if (typeof window === "undefined") return 1;
  const ratio = window.devicePixelRatio;
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 1;
  return Math.min(ratio, 3);
}

/**
 * Mount an interactive vector view on a canvas. Orbit drags around the origin
 * and the wheel zooms while the camera keeps looking at the origin.
 * setVectors({ a, b, result, wires, wireBounds, fading, planes, wireHead,
 * wireAlpha, resultAlpha, extentFollow }) redraws. result is omitted for
 * scalar results. wires are the retained sweep; wireBounds frames them.
 * fading and planes dissolve older traces. extentFollow eases that frame.
 */
export function createScene(canvas) {
  if (!canvas || typeof canvas.getContext !== "function" || typeof canvas.addEventListener !== "function") {
    throw new TypeError("createScene expects a canvas element");
  }
  const existing = scenes.get(canvas);
  if (existing) return existing;

  const context = canvas.getContext("2d");
  if (!context) throw new TypeError("Canvas 2D context is unavailable");

  const state = {
    a: null,
    b: null,
    result: null,
    wires: null,
    wireBounds: null,
    fading: [],
    planes: [],
    wireHead: null,
    wireAlpha: 1,
    resultAlpha: 1,
    extentFollow: null,
    shownExtent: null,
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    zoom: 1,
    dpr: 1,
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  };

  let observer = null;

  function updateExtent() {
    const target = framedExtent([state.a, state.b, state.result], state.wireBounds || state.wires);
    const follow = state.extentFollow;
    if (typeof follow !== "number" || !Number.isFinite(follow)) {
      state.shownExtent = target;
      return;
    }
    const step = follow <= 0 ? 0 : (follow >= 1 ? 1 : follow);
    if (typeof state.shownExtent !== "number") state.shownExtent = target;
    else state.shownExtent += (target - state.shownExtent) * step;
  }

  function buildCamera() {
    const extent = typeof state.shownExtent === "number"
      ? state.shownExtent
      : framedExtent([state.a, state.b, state.result], state.wireBounds || state.wires);
    const width = canvas.width > 0 ? canvas.width : 1;
    const height = canvas.height > 0 ? canvas.height : 1;
    const distance = Math.max(0.4, frameDistance(extent, FOV, width / height) * state.zoom);
    return {
      position: orbitPosition(state.yaw, state.pitch, distance),
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: FOV,
      width,
      height,
    };
  }

  function layout() {
    const parent = canvas.parentElement;
    const rect = parent && typeof parent.getBoundingClientRect === "function"
      ? parent.getBoundingClientRect()
      : null;
    const cssWidth = Math.max(
      1,
      (rect && rect.width) || (parent && parent.clientWidth) || canvas.clientWidth || canvas.width || 1,
    );
    const cssHeight = Math.max(
      1,
      (rect && rect.height) || (parent && parent.clientHeight) || canvas.clientHeight || canvas.height || 1,
    );
    const ratio = readDevicePixelRatio();
    const nextWidth = Math.max(1, Math.min(4096, Math.round(cssWidth * ratio)));
    const nextHeight = Math.max(1, Math.min(4096, Math.round(cssHeight * ratio)));
    state.dpr = nextWidth / cssWidth;
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
  }

  function draw() {
    if (!(canvas.width > 0) || !(canvas.height > 0)) return;
    const camera = buildCamera();
    const basis = cameraBasis(camera);
    const dpr = state.dpr > 0 ? state.dpr : 1;
    context.fillStyle = COLOR.background;
    context.fillRect(0, 0, camera.width, camera.height);
    drawStars(context, camera, dpr, state.yaw, state.pitch);
    const grid = drawGrid(context, camera, basis, dpr);
    drawAxes(context, camera, basis, dpr, grid.step);
    drawPlanes(context, camera, basis, dpr, state.planes);
    for (const layer of state.fading) {
      drawWires(context, camera, basis, dpr, layer.wires, layer.alpha, layer.head);
    }
    drawWires(context, camera, basis, dpr, state.wires, state.wireAlpha, state.wireHead);
    drawVectors(context, camera, basis, dpr, state, state.resultAlpha);
    drawOrigin(context, camera, dpr);
    context.globalAlpha = 1;
    const resultLength = state.result && state.resultAlpha > 0.04 ? lengthOf(state.result) : 0;
    const showTrace = !!(
      (state.wires && (
        state.wires.a.length > 1
        || state.wires.spans.length > 0
        || state.wires.cross.length > 1
      ))
      || state.fading.length > 0
    );
    const showPlane = state.planes.some((plane) => plane && plane.alpha > 0.04);
    drawLegend(context, dpr, resultLength >= 1e-8, showTrace, showPlane);
  }

  function setCursor(value) {
    if (canvas.style) canvas.style.cursor = value;
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    state.dragging = true;
    state.pointerId = event.pointerId ?? null;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    try {
      if (typeof canvas.setPointerCapture === "function") canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail before the canvas is in a document.
    }
    setCursor("grabbing");
    if (typeof event.preventDefault === "function") event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.dragging) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.yaw += dx * 0.005;
    state.pitch = clamp(state.pitch - dy * 0.005, PITCH_MIN, PITCH_MAX);
    draw();
  }

  function onPointerUp(event) {
    if (!state.dragging) return;
    state.dragging = false;
    state.pointerId = null;
    if (event && typeof canvas.releasePointerCapture === "function") {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already have been released.
      }
    }
    setCursor("grab");
  }

  function onWheel(event) {
    if (typeof event.preventDefault === "function") event.preventDefault();
    const mode = event.deltaMode;
    const unit = mode === 1 ? 16 : mode === 2 ? (canvas.height || 600) : 1;
    const delta = (Number(event.deltaY) || 0) * unit;
    if (!delta) return;
    state.zoom = clamp(state.zoom * Math.exp(delta * 0.0011), ZOOM_MIN, ZOOM_MAX);
    draw();
  }

  function onWindowResize() {
    layout();
    draw();
  }

  function setVectors(next = {}) {
    state.a = asVector(next.a);
    state.b = asVector(next.b);
    state.result = asVector(next.result);
    if (next && Object.prototype.hasOwnProperty.call(next, "wires")) {
      state.wires = normalizeWires(next.wires);
    }
    if (next && Object.prototype.hasOwnProperty.call(next, "wireBounds")) {
      state.wireBounds = normalizeWires(next.wireBounds);
    }
    if (next && Object.prototype.hasOwnProperty.call(next, "fading")) {
      state.fading = normalizeFading(next.fading);
    }
    if (next && Object.prototype.hasOwnProperty.call(next, "planes")) {
      state.planes = normalizePlanes(next.planes);
    }
    if (next && Object.prototype.hasOwnProperty.call(next, "wireHead")) {
      const head = Number(next.wireHead);
      state.wireHead = Number.isFinite(head) ? head : null;
    }
    if (next && typeof next.wireAlpha === "number" && Number.isFinite(next.wireAlpha)) {
      state.wireAlpha = Math.min(1, Math.max(0, next.wireAlpha));
    } else {
      state.wireAlpha = 1;
    }
    if (next && typeof next.resultAlpha === "number" && Number.isFinite(next.resultAlpha)) {
      state.resultAlpha = Math.min(1, Math.max(0, next.resultAlpha));
    } else {
      state.resultAlpha = 1;
    }
    if (
      next
      && typeof next.extentFollow === "number"
      && Number.isFinite(next.extentFollow)
    ) {
      state.extentFollow = next.extentFollow;
    } else {
      state.extentFollow = null;
    }
    updateExtent();
    draw();
  }

  function orbitBy(deltaYaw) {
    if (state.dragging) return false;
    if (typeof deltaYaw !== "number" || !Number.isFinite(deltaYaw) || deltaYaw === 0) return false;
    state.yaw += deltaYaw;
    draw();
    return true;
  }

  function resize() {
    layout();
    draw();
  }

  function destroy() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    if (observer) observer.disconnect();
    if (typeof window !== "undefined") window.removeEventListener("resize", onWindowResize);
    scenes.delete(canvas);
  }

  if (canvas.style) {
    canvas.style.touchAction = "none";
    setCursor("grab");
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const api = {
    setVectors,
    orbitBy,
    resize,
    destroy,
    getCamera: buildCamera,
  };
  scenes.set(canvas, api);
  layout();
  draw();

  const watchTarget = canvas.parentElement || canvas;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => {
      layout();
      draw();
    });
    observer.observe(watchTarget);
  } else if (typeof window !== "undefined") {
    window.addEventListener("resize", onWindowResize);
  }

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (scenes.get(canvas) !== api) return;
      layout();
      draw();
    });
  }

  return api;
}
