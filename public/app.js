import {
  ANIMATION_TYPES,
  MOTION_BLEND_MS,
  blendPresentations,
  blendSweep,
  damp,
  easeInOutCubic,
  formatSweepValue,
  nextAnimationStep,
  planeOpacity,
  revealWires,
  sampleSweep,
  sweepWires,
  tracePlane,
  wireOpacity,
} from "./demo.js";
import { angleDegrees, cross, dot, formatNumber, magnitude, normalize } from "./math.js";
import { createScene } from "./scene.js";
import { VECTOR_CAP, createStore } from "./storage.js";

const COMPONENT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const ZERO = 1e-12;
const HISTORY_DELAY = 280;
const DEMO_IDLE_NOTE = "Press Animate to orbit A and B. Rotation and auto changes start on, and old traces fade.";
const MOTION_NOTES = {
  ease: "Ease slows into each pose.",
  glide: "Glide holds a steady speed along a squircle.",
  arc: "Arc follows great circles between poses.",
  orbit: "Orbit weaves a lissajous around the mesh.",
  bloom: "Bloom opens petal trails.",
  lattice: "Lattice walks the edges of an octahedron.",
};
const AUTO_STEP_MS = 9000;
const PLANE_STEP_MS = 2300;
const CAMERA_SPIN = 0.00015;
const SPIN_TAU_MS = 420;
const EXTENT_TAU_MS = 520;
const PLANE_COLORS = ["#3ee0c5", "#ffb020", "#e85dff", "#22d3ee"];

const OPERATIONS = new Set(["dot", "cross", "magnitude", "normalize", "angle"]);
const UNARY = new Set(["magnitude", "normalize"]);
const ARROW_OPS = new Set(["cross", "normalize"]);

const OPERATION_LABELS = {
  dot: "Dot product",
  cross: "Cross product",
  magnitude: "Magnitude",
  normalize: "Normalize",
  angle: "Angle",
};

const FIELD_LABELS = {
  "a-x": "vector A’s x component",
  "a-y": "vector A’s y component",
  "a-z": "vector A’s z component",
  "b-x": "vector B’s x component",
  "b-y": "vector B’s y component",
  "b-z": "vector B’s z component",
};

/**
 * Parse one component. Returns a finite number, or null when the field is
 * empty or not a number. The string "NaN" is rejected.
 */
export function parseComponent(raw) {
  if (typeof raw !== "string") return null;
  let text = raw.trim().replace(/\s+/g, "");
  if (text === "") return null;
  if (text.includes(",") && !text.includes(".")) text = text.replace(",", ".");
  if (!COMPONENT.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function showNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatNumber(value);
}

export function formatVector(vector) {
  return `(${showNumber(vector.x)}, ${showNumber(vector.y)}, ${showNumber(vector.z)})`;
}

export function formatEditable(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (Object.is(value, -0)) return "0";
  return String(value);
}

function roleName(role, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed === role) return role;
  return trimmed;
}

export function formatFormula(operation, target, nameA, nameB) {
  const left = roleName("A", nameA);
  const right = roleName("B", nameB);
  const one = target === "B" ? right : left;
  if (operation === "dot") return `${left} · ${right}`;
  if (operation === "cross") return `${left} × ${right}`;
  if (operation === "magnitude") return `|${one}|`;
  if (operation === "normalize") return `unit ${one}`;
  if (operation === "angle") return `∠(${left}, ${right})`;
  return "";
}

export function formatResultText(operation, result) {
  if (!result || typeof result !== "object") return "—";
  if (result.kind === "error") return "—";
  if (result.kind === "vector") {
    if (![result.x, result.y, result.z].every((part) => typeof part === "number" && Number.isFinite(part))) {
      return "—";
    }
    return formatVector(result);
  }
  if (result.kind === "scalar") {
    const text = showNumber(result.value);
    if (text === "—") return text;
    return operation === "angle" ? `${text}°` : text;
  }
  return "—";
}

function copyVector(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function blankCalculation(operation, target, nameA, nameB, message, sceneA, sceneB) {
  return {
    formula: formatFormula(operation, target, nameA, nameB),
    display: "—",
    message,
    result: null,
    arrow: null,
    sceneA: sceneA ? copyVector(sceneA) : null,
    sceneB: sceneB ? copyVector(sceneB) : null,
  };
}

function finishedCalculation(operation, target, nameA, nameB, sceneA, sceneB, result, arrow) {
  return {
    formula: formatFormula(operation, target, nameA, nameB),
    display: formatResultText(operation, result),
    message: "",
    result,
    arrow: arrow ? copyVector(arrow) : null,
    sceneA: copyVector(sceneA),
    sceneB: copyVector(sceneB),
  };
}

function errorCalculation(operation, target, nameA, nameB, sceneA, sceneB, message) {
  return {
    formula: formatFormula(operation, target, nameA, nameB),
    display: "—",
    message,
    result: { kind: "error", message },
    arrow: null,
    sceneA: copyVector(sceneA),
    sceneB: copyVector(sceneB),
  };
}

function isZeroVector(vector) {
  return magnitude(vector) < ZERO;
}

function angleMessage(a, b) {
  const aZero = isZeroVector(a);
  const bZero = isZeroVector(b);
  if (aZero && bZero) return "Both vectors have zero length, so the angle is undefined.";
  if (aZero) return "Vector A has zero length, so the angle is undefined.";
  if (bZero) return "Vector B has zero length, so the angle is undefined.";
  return "The angle is undefined when a vector has zero length.";
}

/**
 * Live result for the current operation. Scalar and vector numbers are left
 * at full precision on `result`; `display` is the formatted panel text.
 * `arrow` is set only for cross product and normalize.
 */
export function describeCalculation({
  operation,
  target,
  a,
  b,
  nameA = "",
  nameB = "",
  invalid = "",
}) {
  const op = OPERATIONS.has(operation) ? operation : "dot";
  const chosen = target === "B" ? "B" : "A";
  const sceneA = a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z) ? a : null;
  const sceneB = b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z) ? b : null;

  if (invalid || !sceneA || !sceneB) {
    return blankCalculation(
      op,
      chosen,
      nameA,
      nameB,
      invalid || "Enter a number for each component.",
      sceneA,
      sceneB,
    );
  }

  if (!OPERATIONS.has(operation)) {
    return blankCalculation(op, chosen, nameA, nameB, "Choose an operation.", sceneA, sceneB);
  }

  const subject = chosen === "B" ? sceneB : sceneA;

  if (op === "dot") {
    const value = dot(sceneA, sceneB);
    if (!Number.isFinite(value)) {
      return errorCalculation(op, chosen, nameA, nameB, sceneA, sceneB, "Enter a number for each component.");
    }
    return finishedCalculation(op, chosen, nameA, nameB, sceneA, sceneB, { kind: "scalar", value }, null);
  }

  if (op === "cross") {
    const value = cross(sceneA, sceneB);
    if (![value.x, value.y, value.z].every(Number.isFinite)) {
      return errorCalculation(op, chosen, nameA, nameB, sceneA, sceneB, "Enter a number for each component.");
    }
    return finishedCalculation(
      op,
      chosen,
      nameA,
      nameB,
      sceneA,
      sceneB,
      { kind: "vector", x: value.x, y: value.y, z: value.z },
      value,
    );
  }

  if (op === "magnitude") {
    const value = magnitude(subject);
    if (!Number.isFinite(value)) {
      return errorCalculation(op, chosen, nameA, nameB, sceneA, sceneB, "Enter a number for each component.");
    }
    return finishedCalculation(op, chosen, nameA, nameB, sceneA, sceneB, { kind: "scalar", value }, null);
  }

  if (op === "normalize") {
    const value = normalize(subject);
    if (!value) {
      return errorCalculation(
        op,
        chosen,
        nameA,
        nameB,
        sceneA,
        sceneB,
        `Vector ${chosen} has zero length, so it cannot be normalized.`,
      );
    }
    return finishedCalculation(
      op,
      chosen,
      nameA,
      nameB,
      sceneA,
      sceneB,
      { kind: "vector", x: value.x, y: value.y, z: value.z },
      value,
    );
  }

  const degrees = angleDegrees(sceneA, sceneB);
  if (degrees === null || !Number.isFinite(degrees)) {
    return errorCalculation(op, chosen, nameA, nameB, sceneA, sceneB, angleMessage(sceneA, sceneB));
  }
  return finishedCalculation(op, chosen, nameA, nameB, sceneA, sceneB, { kind: "scalar", value: degrees }, null);
}

function storageArea() {
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch {
    // Reading localStorage can throw when storage is blocked.
  }
  return {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("The browser could not save.");
    },
  };
}

function safeStore(store, method, arg) {
  try {
    return store[method](arg);
  } catch {
    return method === "listVectors" || method === "listHistory" ? [] : null;
  }
}

function sameSnapshot(a, b) {
  return !!a && !!b && a.name === b.name && a.x === b.x && a.y === b.y && a.z === b.z;
}

function sameResult(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "scalar") return a.value === b.value;
  if (a.kind === "vector") return a.x === b.x && a.y === b.y && a.z === b.z;
  if (a.kind === "error") return a.message === b.message;
  return false;
}

function sameCalculation(a, b) {
  return !!a
    && !!b
    && a.operation === b.operation
    && a.target === b.target
    && sameSnapshot(a.vectorA, b.vectorA)
    && sameSnapshot(a.vectorB, b.vectorB)
    && sameResult(a.result, b.result);
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

function invalidMessage(fields) {
  if (fields.length === 0) return "";
  if (fields.length === 1) return `Enter a number for ${FIELD_LABELS[fields[0]]}.`;
  return "Enter a number for each component.";
}

export function mountWorkspace(root = globalThis.document) {
  if (!root || typeof root.querySelector !== "function") return null;

  const panel = root.querySelector("#panel");
  const canvas = root.querySelector("#scene");
  if (!panel || !canvas) return null;

  const doc = typeof root.createElement === "function" ? root : root.ownerDocument;
  if (!doc || typeof doc.createElement !== "function") return { panel, canvas };

  let scene = null;
  if (typeof canvas.getContext === "function") {
    try {
      scene = createScene(canvas);
    } catch {
      scene = null;
    }
  }

  const ids = [
    "a-x", "a-y", "a-z", "b-x", "b-y", "b-z",
    "result-formula", "result-value", "message", "target-field",
    "vector-name", "save-form", "save-b",
    "library-list", "library-empty", "history-list", "history-empty",
  ];
  const nodes = {};
  for (const id of ids) nodes[id] = root.querySelector(`#${id}`);
  if (ids.some((id) => !nodes[id])) {
    if (scene) {
      scene.setVectors({ a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 } });
    }
    return { panel, canvas };
  }

  if (panel.dataset.workspaceReady === "true") return { panel, canvas };
  panel.dataset.workspaceReady = "true";

  const store = createStore(storageArea());
  const names = { A: "", B: "" };
  let storageNote = "";
  let editGeneration = 0;
  let historyTimer = 0;
  let demoRunning = false;
  let settling = false;
  let demoFrame = 0;
  let demoElapsed = 0;
  let playMs = 0;
  let lastAutoMs = 0;
  let lastPlaneMs = 0;
  let demoLastFrame = 0;
  let demoOrigin = null;
  let motion = "orbit";
  let handoff = null;
  let opHandoff = null;
  let opShown = null;
  let spin = 0;
  let frameDelta = 0;
  let wireCaches = new Map();
  let blendFades = [];
  let wireAlpha = 1;
  let visibleWires = null;
  let wireBounds = null;
  let wireHead = null;
  let fading = [];
  let planes = [];
  let planeSerial = 0;
  const view = root.defaultView || globalThis;
  const demoButton = root.querySelector("#demo-toggle");
  const demoNote = root.querySelector("#demo-note");
  const demoBar = root.querySelector(".demo-bar");
  const useFrame = !!(view && typeof view.requestAnimationFrame === "function");

  function byId(id) {
    return nodes[id];
  }

  function readField(id) {
    const input = byId(id);
    return parseComponent(input && typeof input.value === "string" ? input.value : "");
  }

  function readVector(prefix, role) {
    const keys = [`${prefix}-x`, `${prefix}-y`, `${prefix}-z`];
    const values = keys.map(readField);
    const invalidFields = keys.filter((key, index) => values[index] === null);
    if (invalidFields.length > 0) {
      return { vector: null, scene: null, invalidFields };
    }
    const [x, y, z] = values;
    const name = names[role] || "";
    return {
      vector: { name, x, y, z },
      scene: { x, y, z },
      invalidFields,
    };
  }

  function readOperation() {
    const selected = root.querySelector('input[name="operation"]:checked');
    const value = selected && selected.value;
    return OPERATIONS.has(value) ? value : "dot";
  }

  function readTarget() {
    const selected = root.querySelector('input[name="target"]:checked');
    return selected && selected.value === "B" ? "B" : "A";
  }

  function readCalculation() {
    const vectorA = readVector("a", "A");
    const vectorB = readVector("b", "B");
    const invalid = invalidMessage([...vectorA.invalidFields, ...vectorB.invalidFields]);
    return {
      operation: readOperation(),
      target: readTarget(),
      a: vectorA.scene,
      b: vectorB.scene,
      vectorA: vectorA.vector,
      vectorB: vectorB.vector,
      nameA: names.A,
      nameB: names.B,
      invalid,
    };
  }

  function setMessage(text, kind) {
    const message = byId("message");
    if (!text) {
      message.hidden = true;
      message.textContent = "";
      message.removeAttribute("data-kind");
      return;
    }
    message.hidden = false;
    message.dataset.kind = kind === "warn" ? "warn" : "error";
    message.textContent = text;
  }

  function markFields(prefix, invalidFields) {
    for (const axis of ["x", "y", "z"]) {
      const id = `${prefix}-${axis}`;
      const input = byId(id);
      if (!input) continue;
      if (invalidFields.includes(id)) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  function renderCalculation() {
    const current = readCalculation();
    const described = describeCalculation(current);
    byId("result-formula").textContent = described.formula;
    byId("result-value").textContent = described.display;
    byId("result-value").classList.toggle("is-empty", described.display === "—");
    if (described.message) byId("result-value").setAttribute("aria-hidden", "true");
    else byId("result-value").removeAttribute("aria-hidden");

    const vectorA = readVector("a", "A");
    const vectorB = readVector("b", "B");
    markFields("a", vectorA.invalidFields);
    markFields("b", vectorB.invalidFields);

    const unary = UNARY.has(current.operation);
    byId("target-field").dataset.active = unary ? "true" : "false";

    if (described.message) setMessage(described.message, "error");
    else if (storageNote) setMessage(storageNote, "warn");
    else setMessage("");

    const shown = presentedResult(current.a, current.b, described.arrow);
    if (scene) {
      scene.setVectors({
        a: described.sceneA,
        b: described.sceneB,
        result: shown.alpha > 0.02 ? shown.arrow : null,
        resultAlpha: shown.alpha,
        wires: visibleWires,
        wireAlpha,
        wireBounds,
        fading: fadingView().concat(blendFades),
        planes: planeView(),
        wireHead,
        extentFollow: extentFollowAmount(),
      });
    }
    return { current, described };
  }

  function clearList(list) {
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  function renderLibrary() {
    const list = byId("library-list");
    const empty = byId("library-empty");
    clearList(list);
    const vectors = safeStore(store, "listVectors") || [];
    empty.hidden = vectors.length > 0;
    for (const vector of vectors) {
      const item = doc.createElement("li");
      item.className = "library-item";

      const name = doc.createElement("span");
      name.className = "library-name";
      name.textContent = vector.name;

      const coords = doc.createElement("span");
      coords.className = "library-coords";
      coords.textContent = formatVector(vector);

      const actions = doc.createElement("div");
      actions.className = "row-actions";

      const loadA = doc.createElement("button");
      loadA.type = "button";
      loadA.className = "button";
      loadA.textContent = "Load A";
      loadA.setAttribute("data-action", "load-a");
      loadA.setAttribute("data-vector-id", vector.id);
      loadA.setAttribute("aria-label", `Load ${vector.name} into A`);

      const loadB = doc.createElement("button");
      loadB.type = "button";
      loadB.className = "button";
      loadB.textContent = "Load B";
      loadB.setAttribute("data-action", "load-b");
      loadB.setAttribute("data-vector-id", vector.id);
      loadB.setAttribute("aria-label", `Load ${vector.name} into B`);

      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "button button-quiet";
      remove.textContent = "Delete";
      remove.setAttribute("data-action", "delete");
      remove.setAttribute("data-vector-id", vector.id);
      remove.setAttribute("aria-label", `Delete ${vector.name}`);

      actions.append(loadA, loadB, remove);
      item.append(name, coords, actions);
      list.append(item);
    }
  }

  function renderHistory() {
    const list = byId("history-list");
    const empty = byId("history-empty");
    clearList(list);
    const history = safeStore(store, "listHistory") || [];
    empty.hidden = history.length > 0;
    for (const entry of history) {
      const item = doc.createElement("li");
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "history-button";
      button.setAttribute("data-history-id", entry.id);

      const op = doc.createElement("span");
      op.className = "history-op";
      op.textContent = OPERATION_LABELS[entry.operation] || entry.operation;

      const detail = doc.createElement("span");
      detail.className = "history-detail";
      detail.textContent = formatFormula(
        entry.operation,
        entry.target,
        entry.vectorA && entry.vectorA.name,
        entry.vectorB && entry.vectorB.name,
      );

      const operands = doc.createElement("span");
      operands.className = "history-detail";
      const left = formatVector(entry.vectorA);
      const right = formatVector(entry.vectorB);
      operands.textContent = `A ${left}    B ${right}`;

      const result = doc.createElement("span");
      result.className = "history-result";
      if (entry.result && entry.result.kind === "error") {
        result.textContent = entry.result.message || "This calculation could not be completed.";
      } else {
        result.textContent = formatResultText(entry.operation, entry.result);
      }

      button.append(op, detail, operands, result);
      const when = formatWhen(entry.createdAt);
      if (when) {
        const time = doc.createElement("time");
        time.className = "history-time";
        time.dateTime = entry.createdAt;
        time.textContent = when;
        button.append(time);
      }
      button.setAttribute(
        "aria-label",
        `Restore ${op.textContent}, ${detail.textContent}, ${result.textContent}`,
      );
      item.append(button);
      list.append(item);
    }
  }

  function rememberStorageFailure() {
    storageNote = "The browser could not save.";
    const current = readCalculation();
    const described = describeCalculation(current);
    if (!described.message) setMessage(storageNote, "warn");
  }

  function commitHistory() {
    historyTimer = 0;
    const current = readCalculation();
    const described = describeCalculation(current);
    if (!described.result || !current.vectorA || !current.vectorB) return;
    const entry = {
      operation: current.operation,
      target: current.target,
      vectorA: {
        name: current.vectorA.name,
        x: current.vectorA.x,
        y: current.vectorA.y,
        z: current.vectorA.z,
      },
      vectorB: {
        name: current.vectorB.name,
        x: current.vectorB.x,
        y: current.vectorB.y,
        z: current.vectorB.z,
      },
      result: described.result,
    };
    const latest = (safeStore(store, "listHistory") || [])[0];
    if (sameCalculation(latest, entry)) return;
    const saved = safeStore(store, "appendCalculation", entry);
    if (!saved) {
      rememberStorageFailure();
      return;
    }
    renderHistory();
  }

  function scheduleHistory() {
    if (demoRunning) return;
    const generation = ++editGeneration;
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      if (generation !== editGeneration) return;
      commitHistory();
    }, HISTORY_DELAY);
  }

  function commitSoon(immediate) {
    if (!immediate) {
      scheduleHistory();
      return;
    }
    editGeneration += 1;
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = 0;
    }
    commitHistory();
  }

  function flushHistory() {
    if (!historyTimer) return;
    clearTimeout(historyTimer);
    historyTimer = 0;
    commitHistory();
  }

  function setRadio(name, value) {
    const inputs = root.querySelectorAll(`input[name="${name}"]`);
    for (const input of inputs) input.checked = input.value === value;
  }

  function writeVector(prefix, vector) {
    byId(`${prefix}-x`).value = formatEditable(vector.x);
    byId(`${prefix}-y`).value = formatEditable(vector.y);
    byId(`${prefix}-z`).value = formatEditable(vector.z);
  }

  function nowMs() {
    const perf = view && view.performance;
    if (perf && typeof perf.now === "function") return perf.now();
    return Date.now();
  }

  function frame(callback) {
    if (useFrame) return view.requestAnimationFrame(callback);
    return setTimeout(() => callback(nowMs()), 16);
  }

  function cancelFrame(id) {
    if (useFrame) view.cancelAnimationFrame(id);
    else clearTimeout(id);
  }

  function writeSweep(prefix, vector) {
    byId(`${prefix}-x`).value = formatSweepValue(vector.x);
    byId(`${prefix}-y`).value = formatSweepValue(vector.y);
    byId(`${prefix}-z`).value = formatSweepValue(vector.z);
  }

  function readMotion() {
    const selected = root.querySelector('input[name="motion"]:checked');
    const value = selected && selected.value;
    return ANIMATION_TYPES.includes(value) ? value : "orbit";
  }

  function readChecked(id, fallback) {
    const input = root.querySelector(`#${id}`);
    if (!input) return fallback;
    return !!input.checked;
  }

  function motionNote(running) {
    if (!running) return DEMO_IDLE_NOTE;
    const detail = MOTION_NOTES[motion] || MOTION_NOTES.orbit;
    let note = `On. ${detail} Older wires and trace planes fade.`;
    if (readChecked("rotate-toggle", true)) note += " The view turns slowly.";
    if (readChecked("auto-toggle", true)) note += " Auto changes the motion and operation.";
    return note;
  }

  function clearVisuals() {
    visibleWires = null;
    wireBounds = null;
    wireCaches = new Map();
    blendFades = [];
    wireAlpha = 1;
    handoff = null;
    opHandoff = null;
    wireHead = null;
    fading = [];
    planes = [];
    settling = false;
    if (!demoRunning && demoFrame) {
      cancelFrame(demoFrame);
      demoFrame = 0;
    }
  }

  function extentFollowAmount() {
    if (!demoRunning && !settling) return null;
    if (!(frameDelta > 0)) return 0;
    return 1 - Math.exp(-frameDelta / EXTENT_TAU_MS);
  }

  function followSpin(delta) {
    const target = demoRunning && readChecked("rotate-toggle", true) ? CAMERA_SPIN : 0;
    spin = damp(spin, target, delta, SPIN_TAU_MS);
    return spin;
  }

  function applySpin(delta) {
    const rate = followSpin(delta);
    if (!(Math.abs(rate) > 1e-8) || !scene || typeof scene.orbitBy !== "function") return;
    scene.orbitBy(delta * rate);
  }

  function cloneWires(wires) {
    if (!wires) return null;
    return {
      a: wires.a ? wires.a.slice() : [],
      b: wires.b ? wires.b.slice() : [],
      cross: wires.cross ? wires.cross.slice() : [],
      shadowA: wires.shadowA ? wires.shadowA.slice() : [],
      shadowB: wires.shadowB ? wires.shadowB.slice() : [],
      spans: wires.spans ? wires.spans.slice() : [],
      drops: wires.drops ? wires.drops.slice() : [],
    };
  }

  function retireWires() {
    if (!visibleWires || !visibleWires.a || visibleWires.a.length < 2) return;
    fading.push({ wires: cloneWires(visibleWires), age: 0 });
    if (fading.length > 4) fading.shift();
  }

  function fadingView() {
    const layers = [];
    const keep = [];
    for (const layer of fading) {
      const alpha = wireOpacity(layer.age);
      if (!(alpha > 0.02) || !layer.wires) continue;
      keep.push(layer);
      layers.push({ wires: layer.wires, alpha });
    }
    fading = keep;
    return layers;
  }

  function planeView() {
    const view = [];
    const keep = [];
    for (const plane of planes) {
      const alpha = planeOpacity(playMs - plane.born);
      if (!(alpha > 0.015)) continue;
      keep.push(plane);
      view.push({ points: plane.points, alpha, color: plane.color });
    }
    planes = keep;
    return view;
  }

  function hasTrace() {
    return !!(visibleWires || wireBounds || fading.length || planes.length);
  }

  function wiresFor(motionName) {
    let cached = wireCaches.get(motionName);
    if (!cached) {
      cached = sweepWires(motionName);
      wireCaches.set(motionName, cached);
    }
    return cached;
  }

  function mergedBounds(caches) {
    if (caches.length === 1) return caches[0];
    const merged = { a: [], b: [], cross: [], shadowA: [], shadowB: [], spans: [], drops: [] };
    for (const wires of caches) {
      if (!wires) continue;
      if (wires.a) merged.a.push(...wires.a);
      if (wires.b) merged.b.push(...wires.b);
      if (wires.cross) merged.cross.push(...wires.cross);
    }
    return merged;
  }

  function paintDemo(running) {
    panel.classList.toggle("is-demo", running);
    if (!demoButton) return;
    demoButton.setAttribute("aria-pressed", running ? "true" : "false");
    demoButton.textContent = "Animate";
    if (running) demoButton.setAttribute("aria-label", "Stop animation");
    else demoButton.removeAttribute("aria-label");
    if (demoNote) demoNote.textContent = motionNote(running);
    const live = running ? "off" : "polite";
    const result = byId("result-value");
    const message = byId("message");
    if (result) result.setAttribute("aria-live", live);
    if (message) message.setAttribute("aria-live", live);
  }

  function pruneHandoff(node, now) {
    if (!node) return null;
    if (now - node.startMs >= MOTION_BLEND_MS) return null;
    node.from = pruneHandoff(node.from, now);
    return node;
  }

  function flattenHandoff(node, now, scale, out) {
    if (!node || !(scale > 0)) return;
    const eased = easeInOutCubic((now - node.startMs) / MOTION_BLEND_MS);
    const rest = scale * (1 - eased);
    const next = scale * eased;
    if (node.from) flattenHandoff(node.from, now, rest, out);
    else if (rest > 0.001) out.push({ motion: node.fromMotion, weight: rest });
    if (next > 0.001) out.push({ motion: node.toMotion, weight: next });
  }

  function mergeLayers(list) {
    const map = new Map();
    const order = [];
    for (const layer of list) {
      const existing = map.get(layer.motion);
      if (existing) {
        existing.weight += layer.weight;
        continue;
      }
      const item = { motion: layer.motion, weight: layer.weight };
      map.set(layer.motion, item);
      order.push(item);
    }
    return order;
  }

  function evalHandoff(node, elapsed) {
    const to = sampleSweep(elapsed, demoOrigin, { motion: node.toMotion });
    const from = node.from
      ? evalHandoff(node.from, elapsed)
      : sampleSweep(elapsed, demoOrigin, { motion: node.fromMotion });
    const mixed = blendSweep(from, to, (playMs - node.startMs) / MOTION_BLEND_MS);
    return {
      a: mixed.a,
      b: mixed.b,
      phase: "blend",
      motion: node.toMotion,
      progress: to.progress,
      laps: to.laps,
    };
  }

  function composeSweep(elapsed) {
    handoff = pruneHandoff(handoff, playMs);
    if (!handoff) {
      const sample = sampleSweep(elapsed, demoOrigin, { motion });
      return { sample, layers: [{ motion, weight: 1, sample }] };
    }
    const flat = [];
    flattenHandoff(handoff, playMs, 1, flat);
    const layers = mergeLayers(flat);
    for (const layer of layers) {
      layer.sample = sampleSweep(elapsed, demoOrigin, { motion: layer.motion });
    }
    if (layers.length === 0) {
      const sample = sampleSweep(elapsed, demoOrigin, { motion });
      return { sample, layers: [{ motion, weight: 1, sample }] };
    }
    return { sample: evalHandoff(handoff, elapsed), layers };
  }

  function applySweep(elapsed) {
    const view = composeSweep(elapsed);
    const sample = view.sample;
    writeSweep("a", sample.a);
    writeSweep("b", sample.b);
    let primary = view.layers[0];
    for (const layer of view.layers) {
      if (layer.weight > primary.weight) primary = layer;
    }
    const caches = [];
    const extras = [];
    for (const layer of view.layers) {
      const wires = wiresFor(layer.sample ? layer.motion : motion);
      caches.push(wires);
      const revealed = revealWires(wires, layer.sample.progress, layer.sample.laps);
      const head = layer.sample.laps >= 1 ? layer.sample.progress : 1;
      if (layer === primary) {
        visibleWires = revealed;
        wireHead = head;
        wireAlpha = view.layers.length > 1 ? layer.weight : 1;
        continue;
      }
      if (!(layer.weight > 0.02) || !revealed || !revealed.a || revealed.a.length < 2) continue;
      extras.push({ wires: revealed, alpha: layer.weight, head });
    }
    blendFades = extras;
    wireBounds = mergedBounds(caches);
    renderCalculation();
  }

  function leafArrow(op, a, b) {
    const arrow = describeCalculation({
      operation: op.operation,
      target: op.target,
      a,
      b,
    }).arrow;
    return { arrow, alpha: arrow ? 1 : 0 };
  }

  function presentOp(node, a, b) {
    const to = leafArrow(node.toOp, a, b);
    const from = node.from ? presentOp(node.from, a, b) : leafArrow(node.fromOp, a, b);
    return blendPresentations(from, to, (playMs - node.startMs) / MOTION_BLEND_MS);
  }

  function presentedResult(a, b, liveArrow) {
    const operation = readOperation();
    const target = readTarget();
    if (!demoRunning) {
      if (settling && opHandoff) {
        opHandoff = pruneHandoff(opHandoff, playMs);
        if (opHandoff) return presentOp(opHandoff, a, b);
      }
      opHandoff = null;
      opShown = { operation, target };
      return { arrow: liveArrow, alpha: liveArrow ? 1 : 0 };
    }
    if (opShown && (opShown.operation !== operation || opShown.target !== target)) {
      const active = opHandoff && playMs - opHandoff.startMs < MOTION_BLEND_MS ? opHandoff : null;
      opHandoff = {
        from: active,
        fromOp: { operation: opShown.operation, target: opShown.target },
        toOp: { operation, target },
        startMs: playMs,
      };
    }
    if (!opShown) opShown = { operation, target };
    else opShown = { operation, target };
    opHandoff = pruneHandoff(opHandoff, playMs);
    if (!opHandoff) return { arrow: liveArrow, alpha: liveArrow ? 1 : 0 };
    return presentOp(opHandoff, a, b);
  }

  function clockDelta(stamp) {
    let delta = 0;
    if (demoLastFrame > 0) {
      const raw = stamp - demoLastFrame;
      if (raw > 0) delta = Math.min(raw, 48);
    }
    demoLastFrame = stamp;
    return delta;
  }

  function stampPlane() {
    if (handoff) return;
    const sample = sampleSweep(demoElapsed, demoOrigin, { motion });
    if (sample.phase === "intro" || sample.phase === "blend") return;
    const plane = tracePlane(wiresFor(motion), sample.progress);
    if (!plane) return;
    planes.push({
      points: plane.points,
      born: playMs,
      color: PLANE_COLORS[planeSerial % PLANE_COLORS.length],
    });
    planeSerial += 1;
    if (planes.length > 6) planes.shift();
  }

  function beginMotion(next) {
    const active = handoff && playMs - handoff.startMs < MOTION_BLEND_MS ? handoff : null;
    if (next === motion && (!active || active.toMotion === next)) {
      paintDemo(true);
      return;
    }
    // Keep the sweep clock. The new setting eases in from the pose already showing.
    handoff = {
      from: active,
      fromMotion: motion,
      toMotion: next,
      startMs: playMs,
    };
    motion = next;
    lastAutoMs = playMs;
    paintDemo(true);
    applySweep(demoElapsed);
  }

  function advanceSettings() {
    const step = nextAnimationStep(motion, readOperation());
    setRadio("motion", step.motion);
    setRadio("operation", step.operation);
    beginMotion(step.motion);
  }

  function demoTick(now) {
    if (!demoRunning) return;
    const stamp = typeof now === "number" && Number.isFinite(now) ? now : nowMs();
    const delta = clockDelta(stamp);
    frameDelta = delta;
    playMs += delta;
    demoElapsed += delta;
    for (const layer of fading) layer.age += delta;
    applySpin(delta);
    if (readChecked("auto-toggle", true) && playMs - lastAutoMs >= AUTO_STEP_MS) {
      lastAutoMs = playMs;
      advanceSettings();
    } else {
      if (playMs - lastPlaneMs >= PLANE_STEP_MS) {
        lastPlaneMs = playMs;
        stampPlane();
      }
      applySweep(demoElapsed);
    }
    demoFrame = frame(demoTick);
  }

  function settleTick(now) {
    if (demoRunning) {
      settling = false;
      return;
    }
    const stamp = typeof now === "number" && Number.isFinite(now) ? now : nowMs();
    const delta = clockDelta(stamp);
    frameDelta = delta;
    playMs += delta;
    for (const layer of fading) layer.age += delta;
    applySpin(delta);
    const alive = fading.some((layer) => wireOpacity(layer.age) > 0.02)
      || planes.some((plane) => planeOpacity(playMs - plane.born) > 0.02)
      || Math.abs(spin) > 1e-7;
    renderCalculation();
    if (!alive) {
      settling = false;
      demoFrame = 0;
      return;
    }
    demoFrame = frame(settleTick);
  }

  function startSettle() {
    if (demoRunning) return;
    if (fading.length === 0 && planes.length === 0 && !(Math.abs(spin) > 1e-7)) return;
    if (settling && demoFrame) return;
    settling = true;
    demoLastFrame = 0;
    demoFrame = frame(settleTick);
  }

  function stopDemo(options = {}) {
    if (demoRunning) {
      demoRunning = false;
      if (demoFrame) {
        cancelFrame(demoFrame);
        demoFrame = 0;
      }
      settling = false;
      paintDemo(false);
      if (options.commit) commitSoon(true);
    }
    if (options.clearWires) {
      const hadWires = hasTrace();
      spin = 0;
      clearVisuals();
      if (hadWires) renderCalculation();
      return;
    }
    startSettle();
  }

  function componentOr(id, fallback) {
    const value = readField(id);
    return value === null ? fallback : value;
  }

  function startDemo() {
    if (demoRunning) return;
    if (demoFrame) {
      cancelFrame(demoFrame);
      demoFrame = 0;
    }
    settling = false;
    flushHistory();
    storageNote = "";
    names.A = "";
    names.B = "";
    motion = readMotion();
    demoOrigin = {
      a: {
        x: componentOr("a-x", 1),
        y: componentOr("a-y", 0),
        z: componentOr("a-z", 0),
      },
      b: {
        x: componentOr("b-x", 0),
        y: componentOr("b-y", 1),
        z: componentOr("b-z", 0),
      },
    };
    demoElapsed = 0;
    playMs = 0;
    lastAutoMs = 0;
    lastPlaneMs = 0;
    demoLastFrame = 0;
    planeSerial = 0;
    fading = [];
    planes = [];
    wireCaches = new Map();
    blendFades = [];
    wireAlpha = 1;
    handoff = null;
    opHandoff = null;
    frameDelta = 0;
    wireHead = null;
    visibleWires = null;
    demoRunning = true;
    paintDemo(true);
    applySweep(0);
    demoFrame = frame(demoTick);
  }

  function isDemoControl(target) {
    if (!demoBar || !target) return false;
    if (target === demoBar) return true;
    return typeof demoBar.contains === "function" && demoBar.contains(target);
  }

  function prefersReducedMotion() {
    try {
      return !!(view.matchMedia && view.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }

  function onMotionChange() {
    const next = readMotion();
    if (!demoRunning) {
      motion = next;
      if (hasTrace()) {
        retireWires();
        visibleWires = null;
        wireBounds = null;
        wireCaches = new Map();
        blendFades = [];
        wireAlpha = 1;
        handoff = null;
        wireHead = null;
        paintDemo(false);
        renderCalculation();
        startSettle();
      } else {
        paintDemo(false);
      }
      return;
    }
    if (next === motion) return;
    beginMotion(next);
  }

  function keepsDemo(target) {
    if (isDemoControl(target)) return true;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest("#target-field")) return true;
    if (target.closest('input[name="operation"]')) return true;
    const fieldset = target.closest("fieldset");
    if (!fieldset || typeof fieldset.querySelector !== "function") return false;
    return !!fieldset.querySelector('input[name="operation"]');
  }

  function endDemoSession() {
    if (demoRunning) stopDemo();
    flushHistory();
  }

  function restore(entry) {
    if (!entry) return;
    if (demoRunning) stopDemo({ clearWires: true });
    else if (hasTrace()) stopDemo({ clearWires: true });
    editGeneration += 1;
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = 0;
    }
    storageNote = "";
    names.A = entry.vectorA && typeof entry.vectorA.name === "string" ? entry.vectorA.name : "";
    names.B = entry.vectorB && typeof entry.vectorB.name === "string" ? entry.vectorB.name : "";
    writeVector("a", entry.vectorA);
    writeVector("b", entry.vectorB);
    setRadio("operation", entry.operation);
    setRadio("target", entry.target === "B" ? "B" : "A");
    renderCalculation();
    const resultBlock = root.querySelector(".result-block");
    if (resultBlock && typeof resultBlock.scrollIntoView === "function") {
      resultBlock.scrollIntoView({ block: "nearest" });
    }
  }

  function loadInto(role, id) {
    if (demoRunning || hasTrace()) stopDemo({ clearWires: true });
    const vector = (safeStore(store, "listVectors") || []).find((item) => item.id === id);
    if (!vector) {
      renderLibrary();
      return;
    }
    storageNote = "";
    names[role] = vector.name;
    writeVector(role === "B" ? "b" : "a", vector);
    renderCalculation();
    commitSoon(true);
  }

  function deleteNamed(id) {
    if (demoRunning || hasTrace()) stopDemo({ clearWires: true });
    const vectors = safeStore(store, "listVectors") || [];
    if (!vectors.some((item) => item.id === id)) {
      renderLibrary();
      return;
    }
    const removed = safeStore(store, "deleteVector", id);
    if (removed !== true) {
      rememberStorageFailure();
    } else {
      storageNote = "";
    }
    renderLibrary();
    renderCalculation();
  }

  function saveNamed(role) {
    if (demoRunning || hasTrace()) stopDemo({ clearWires: true });
    const prefix = role === "B" ? "b" : "a";
    const parsed = readVector(prefix, role);
    if (!parsed.vector) {
      storageNote = "";
      renderCalculation();
      return;
    }
    const name = String(byId("vector-name").value || "").trim();
    if (!name) {
      storageNote = "";
      setMessage("Enter a name to save this vector.", "error");
      if (typeof byId("vector-name").focus === "function") byId("vector-name").focus();
      return;
    }
    const existing = safeStore(store, "listVectors") || [];
    if (existing.length >= VECTOR_CAP) {
      storageNote = "The library is full. Delete a vector to save another.";
      setMessage(storageNote, "warn");
      return;
    }
    const saved = safeStore(store, "saveVector", {
      name,
      x: parsed.vector.x,
      y: parsed.vector.y,
      z: parsed.vector.z,
    });
    if (!saved) {
      rememberStorageFailure();
      return;
    }
    storageNote = "";
    names[role] = saved.name;
    renderLibrary();
    renderCalculation();
  }

  function onEdit(event) {
    const target = event.target;
    if (!target) return;
    const id = target.id || "";
    const name = target.name || "";
    const editsVectorA = id === "a-x" || id === "a-y" || id === "a-z";
    const editsVectorB = id === "b-x" || id === "b-y" || id === "b-z";
    const editsOperation = name === "operation" || name === "target";
    if (!editsVectorA && !editsVectorB && !editsOperation) return;
    if (editsOperation && demoRunning) {
      renderCalculation();
      return;
    }
    if (demoRunning) stopDemo();
    if (editsOperation && hasTrace()) {
      retireWires();
      visibleWires = null;
      wireBounds = null;
      wireCaches = new Map();
      blendFades = [];
      wireAlpha = 1;
      handoff = null;
      wireHead = null;
      storageNote = "";
      renderCalculation();
      startSettle();
      commitSoon(true);
      return;
    }
    clearVisuals();
    if (editsVectorA) names.A = "";
    if (editsVectorB) names.B = "";
    storageNote = "";
    renderCalculation();
    commitSoon(editsOperation);
  }

  panel.addEventListener("input", onEdit);
  panel.addEventListener("change", onEdit);

  byId("save-form").addEventListener("submit", (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    saveNamed("A");
  });
  byId("save-b").addEventListener("click", () => saveNamed("B"));

  byId("library-list").addEventListener("click", (event) => {
    const source = event.target;
    const button = source && typeof source.closest === "function"
      ? source.closest("[data-action]")
      : null;
    if (!button || !byId("library-list").contains(button)) return;
    const id = button.getAttribute("data-vector-id");
    const action = button.getAttribute("data-action");
    if (action === "load-a") loadInto("A", id);
    else if (action === "load-b") loadInto("B", id);
    else if (action === "delete") deleteNamed(id);
  });

  byId("history-list").addEventListener("click", (event) => {
    const source = event.target;
    const button = source && typeof source.closest === "function"
      ? source.closest("[data-history-id]")
      : null;
    if (!button || !byId("history-list").contains(button)) return;
    const id = button.getAttribute("data-history-id");
    const entry = (safeStore(store, "listHistory") || []).find((item) => item.id === id);
    restore(entry);
  });

  if (demoButton) {
    demoButton.addEventListener("click", (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (demoRunning) {
        stopDemo({ commit: true });
        return;
      }
      startDemo();
    });
  }

  const motionPicker = root.querySelector(".motion-picker");
  if (motionPicker && typeof motionPicker.addEventListener === "function") {
    motionPicker.addEventListener("change", onMotionChange);
  }

  if (demoBar && typeof demoBar.addEventListener === "function") {
    demoBar.addEventListener("change", (event) => {
      const target = event.target;
      if (!target) return;
      if (target.id === "auto-toggle" && target.checked) lastAutoMs = playMs;
      if (target.id === "rotate-toggle" || target.id === "auto-toggle") {
        if (demoNote) demoNote.textContent = motionNote(demoRunning);
      }
    });
  }

  panel.addEventListener("pointerdown", (event) => {
    if (!demoRunning) return;
    if (keepsDemo(event.target)) return;
    stopDemo();
  });

  panel.addEventListener("focusin", (event) => {
    if (!demoRunning) return;
    if (keepsDemo(event.target)) return;
    stopDemo();
  });

  if (view && typeof view.addEventListener === "function") {
    view.addEventListener("pagehide", endDemoSession);
    view.addEventListener("beforeunload", endDemoSession);
  }
  if (typeof root.addEventListener === "function" && "visibilityState" in root) {
    root.addEventListener("visibilitychange", () => {
      if (root.visibilityState === "hidden") flushHistory();
    });
  }

  renderCalculation();
  renderLibrary();
  renderHistory();
  if (!prefersReducedMotion()) startDemo();

  return { panel, canvas, scene };
}

if (typeof document !== "undefined") {
  const start = () => {
    mountWorkspace(document);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
