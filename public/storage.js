/**
 * Named-vector library and calculation history.
 *
 * storageArea is localStorage in the browser and any object with
 * getItem/setItem in tests. Writes are capped and failures are swallowed.
 *
 * Keys: 3d-vector-calculator:vectors, 3d-vector-calculator:history.
 * Caps: 40 named vectors (further saves are refused), 30 history rows
 * (newest kept, oldest dropped).
 */

const VECTORS_KEY = "3d-vector-calculator:vectors";
const HISTORY_KEY = "3d-vector-calculator:history";

export const VECTOR_CAP = 40;
export const HISTORY_CAP = 30;

const OPERATIONS = new Set(["dot", "cross", "magnitude", "normalize", "angle"]);

function createId() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (typeof uuid === "string" && uuid.length > 0) return uuid;
  } catch {
    // crypto.randomUUID can throw outside a secure context.
  }
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${time}-${rand}`;
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function readList(area, key) {
  try {
    if (!area || typeof area.getItem !== "function") return [];
    const raw = area.getItem(key);
    if (raw == null || raw === "") return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(area, key, list) {
  if (!area || typeof area.setItem !== "function") {
    throw new Error("Storage area is missing setItem");
  }
  area.setItem(key, JSON.stringify(list));
}

function snapshotVector(input, requireName) {
  if (!input || typeof input !== "object") return null;
  const x = finiteNumber(input.x);
  const y = finiteNumber(input.y);
  const z = finiteNumber(input.z);
  if (x === null || y === null || z === null) return null;
  const name = input.name == null ? "" : String(input.name).trim();
  if (requireName && name.length === 0) return null;
  return { name, x, y, z };
}

function isStoredVector(item) {
  return Boolean(
    item
    && typeof item === "object"
    && typeof item.id === "string"
    && item.id.length > 0
    && typeof item.name === "string"
    && item.name.length > 0
    && Number.isFinite(item.x)
    && Number.isFinite(item.y)
    && Number.isFinite(item.z),
  );
}

function copyVector(item) {
  return {
    id: item.id,
    name: item.name,
    x: item.x,
    y: item.y,
    z: item.z,
  };
}

function normalizeResult(result) {
  if (!result || typeof result !== "object") return null;
  if (result.kind === "scalar") {
    const value = finiteNumber(result.value);
    if (value === null) return null;
    return { kind: "scalar", value };
  }
  if (result.kind === "vector") {
    const x = finiteNumber(result.x);
    const y = finiteNumber(result.y);
    const z = finiteNumber(result.z);
    if (x === null || y === null || z === null) return null;
    return { kind: "vector", x, y, z };
  }
  if (result.kind === "error") {
    return {
      kind: "error",
      message: result.message == null ? "" : String(result.message),
    };
  }
  return null;
}

function isStoredResult(result) {
  if (!result || typeof result !== "object") return false;
  if (result.kind === "scalar") return Number.isFinite(result.value);
  if (result.kind === "vector") {
    return Number.isFinite(result.x) && Number.isFinite(result.y) && Number.isFinite(result.z);
  }
  if (result.kind === "error") return typeof result.message === "string";
  return false;
}

function isStoredSnapshot(item) {
  return Boolean(
    item
    && typeof item === "object"
    && typeof item.name === "string"
    && Number.isFinite(item.x)
    && Number.isFinite(item.y)
    && Number.isFinite(item.z),
  );
}

function copySnapshot(item) {
  return { name: item.name, x: item.x, y: item.y, z: item.z };
}

function copyResult(result) {
  if (result.kind === "scalar") return { kind: "scalar", value: result.value };
  if (result.kind === "vector") return { kind: "vector", x: result.x, y: result.y, z: result.z };
  return { kind: "error", message: result.message };
}

function normalizeCreatedAt(value) {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function resolveTarget(target) {
  if (target == null || target === "") return "A";
  if (target === "A" || target === "B") return target;
  return null;
}

function isStoredCalculation(item) {
  return Boolean(
    item
    && typeof item === "object"
    && typeof item.id === "string"
    && item.id.length > 0
    && OPERATIONS.has(item.operation)
    && (item.target === "A" || item.target === "B")
    && isStoredSnapshot(item.vectorA)
    && isStoredSnapshot(item.vectorB)
    && isStoredResult(item.result)
    && typeof item.createdAt === "string"
    && item.createdAt.length > 0,
  );
}

function copyCalculation(item) {
  return {
    id: item.id,
    operation: item.operation,
    target: item.target,
    vectorA: copySnapshot(item.vectorA),
    vectorB: copySnapshot(item.vectorB),
    result: copyResult(item.result),
    createdAt: item.createdAt,
  };
}

function normalizeCalculation(input) {
  if (!input || typeof input !== "object") return null;
  if (!OPERATIONS.has(input.operation)) return null;
  const target = resolveTarget(input.target);
  const vectorA = snapshotVector(input.vectorA, false);
  const vectorB = snapshotVector(input.vectorB, false);
  const result = normalizeResult(input.result);
  if (!target || !vectorA || !vectorB || !result) return null;
  return {
    id: createId(),
    operation: input.operation,
    target,
    vectorA,
    vectorB,
    result,
    createdAt: normalizeCreatedAt(input.createdAt),
  };
}

export function createStore(storageArea) {
  function loadVectors() {
    return readList(storageArea, VECTORS_KEY).filter(isStoredVector).slice(0, VECTOR_CAP);
  }

  function loadHistory() {
    return readList(storageArea, HISTORY_KEY).filter(isStoredCalculation).slice(0, HISTORY_CAP);
  }

  return {
    saveVector(input) {
      try {
        const snap = snapshotVector(input, true);
        if (!snap) return null;
        const list = loadVectors();
        if (list.length >= VECTOR_CAP) return null;
        const record = {
          id: createId(),
          name: snap.name,
          x: snap.x,
          y: snap.y,
          z: snap.z,
        };
        writeList(storageArea, VECTORS_KEY, [record, ...list]);
        return copyVector(record);
      } catch {
        return null;
      }
    },

    listVectors() {
      try {
        return loadVectors().map(copyVector);
      } catch {
        return [];
      }
    },

    deleteVector(id) {
      try {
        if (typeof id !== "string" || id.length === 0) return false;
        const list = loadVectors();
        const next = list.filter((item) => item.id !== id);
        if (next.length === list.length) return false;
        writeList(storageArea, VECTORS_KEY, next);
        return true;
      } catch {
        return false;
      }
    },

    appendCalculation(input) {
      try {
        const record = normalizeCalculation(input);
        if (!record) return null;
        const list = loadHistory();
        writeList(storageArea, HISTORY_KEY, [record, ...list].slice(0, HISTORY_CAP));
        return copyCalculation(record);
      } catch {
        return null;
      }
    },

    listHistory() {
      try {
        return loadHistory().map(copyCalculation);
      } catch {
        return [];
      }
    },
  };
}
