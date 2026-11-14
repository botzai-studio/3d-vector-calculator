/**
 * Pure 3D vector operations. Vectors are plain {x, y, z}.
 * This module touches no DOM and imports nothing.
 */

/** Lengths below this are treated as zero for normalize and angleDegrees. */
const ZERO_MAGNITUDE = 1e-12;

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Right-handed cross product a × b. */
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v) {
  const length = magnitude(v);
  if (!(length >= ZERO_MAGNITUDE)) return null;
  return {
    x: v.x / length,
    y: v.y / length,
    z: v.z / length,
  };
}

/**
 * Angle between a and b in degrees.
 * Returns null when either vector is shorter than ZERO_MAGNITUDE.
 * The cosine is clamped to [-1, 1] so a value slightly outside that
 * range still yields a finite angle.
 */
export function angleDegrees(a, b) {
  const lengthA = magnitude(a);
  const lengthB = magnitude(b);
  if (!(lengthA >= ZERO_MAGNITUDE) || !(lengthB >= ZERO_MAGNITUDE)) return null;

  const cosine = dot(a, b) / (lengthA * lengthB);
  const clamped = Math.min(1, Math.max(-1, cosine));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/** Display helper. Returns a three-decimal string and does not mutate value. */
export function formatNumber(value) {
  return Number(value).toFixed(3);
}
