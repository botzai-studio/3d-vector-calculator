import assert from "node:assert/strict";
import { test } from "node:test";

import { HISTORY_CAP, VECTOR_CAP, createStore } from "../public/storage.js";

const VECTORS_KEY = "3d-vector-calculator:vectors";
const HISTORY_KEY = "3d-vector-calculator:history";

function memoryArea() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

function calculation(value, overrides = {}) {
  return {
    operation: "dot",
    target: value % 2 === 0 ? "A" : "B",
    vectorA: { name: "A", x: value, y: 0, z: 0 },
    vectorB: { name: "B", x: 0, y: 1, z: 0 },
    result: { kind: "scalar", value },
    createdAt: `2026-11-12T00:00:${String(value).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

test("a saved vector round-trips with id, name, x, y, and z", () => {
  const area = memoryArea();
  const store = createStore(area);
  const saved = store.saveVector({ name: " velocity ", x: 3, y: -1, z: 0.5, extra: true });

  assert.ok(saved);
  assert.deepEqual(Object.keys(saved).sort(), ["id", "name", "x", "y", "z"]);
  assert.equal(typeof saved.id, "string");
  assert.ok(saved.id.length > 0);
  assert.deepEqual(saved, { id: saved.id, name: "velocity", x: 3, y: -1, z: 0.5 });

  const reopened = createStore(area);
  assert.deepEqual(reopened.listVectors(), [saved]);
  const stored = JSON.parse(area.getItem(VECTORS_KEY));
  assert.deepEqual(stored, [saved]);
});

test("deleting a vector removes only that id", () => {
  const store = createStore(memoryArea());
  const first = store.saveVector({ name: "a", x: 1, y: 0, z: 0 });
  const second = store.saveVector({ name: "b", x: 0, y: 2, z: 0 });
  const third = store.saveVector({ name: "c", x: 0, y: 0, z: 3 });

  assert.equal(store.deleteVector(second.id), true);

  assert.deepEqual(
    store.listVectors().map((vector) => vector.id),
    [third.id, first.id],
  );
  assert.deepEqual(
    store.listVectors().map((vector) => vector.name),
    ["c", "a"],
  );
  assert.equal(store.deleteVector(second.id), false);
  assert.equal(store.listVectors().length, 2);
});

test("history lists newest first", () => {
  const store = createStore(memoryArea());
  const first = store.appendCalculation(calculation(1));
  const second = store.appendCalculation(calculation(2, { operation: "cross", result: { kind: "vector", x: 0, y: 0, z: 1 } }));
  const third = store.appendCalculation(calculation(3, {
    operation: "angle",
    result: { kind: "error", message: "Vector has zero length" },
  }));

  const history = store.listHistory();
  assert.deepEqual(history.map((row) => row.id), [third.id, second.id, first.id]);
  assert.equal(history[0].result.kind, "error");
  assert.equal(history[0].result.message, "Vector has zero length");
  assert.deepEqual(history[1].result, { kind: "vector", x: 0, y: 0, z: 1 });
  assert.equal(history[1].operation, "cross");
  assert.equal(history[2].target, "B");
  assert.deepEqual(history[2].vectorA, { name: "A", x: 1, y: 0, z: 0 });
  assert.equal(history[2].createdAt, "2026-11-12T00:00:01.000Z");
});

test("appending 31 calculations leaves the 30 newest", () => {
  const area = memoryArea();
  const store = createStore(area);

  for (let value = 0; value <= HISTORY_CAP; value += 1) {
    const saved = store.appendCalculation(calculation(value));
    assert.ok(saved);
    assert.equal(saved.result.value, value);
  }

  const history = store.listHistory();
  assert.equal(HISTORY_CAP, 30);
  assert.equal(history.length, 30);
  assert.deepEqual(
    history.map((row) => row.result.value),
    Array.from({ length: 30 }, (_, index) => 30 - index),
  );
  const stored = JSON.parse(area.getItem(HISTORY_KEY));
  assert.equal(stored.length, 30);
  assert.equal(stored[0].result.value, 30);
  assert.equal(stored.at(-1).result.value, 1);
});

test("named vectors cap at 40 and the next save is refused", () => {
  const store = createStore(memoryArea());
  const saved = [];

  for (let index = 0; index < VECTOR_CAP; index += 1) {
    const vector = store.saveVector({ name: `v${index}`, x: index, y: 0, z: 0 });
    assert.ok(vector);
    saved.push(vector);
  }

  assert.equal(VECTOR_CAP, 40);
  assert.equal(store.saveVector({ name: "overflow", x: 1, y: 1, z: 1 }), null);
  const listed = store.listVectors();
  assert.equal(listed.length, 40);
  assert.deepEqual(
    listed.map((vector) => vector.id),
    saved.map((vector) => vector.id).reverse(),
  );

  assert.equal(store.deleteVector(saved[0].id), true);
  const after = store.saveVector({ name: "after", x: 4, y: 5, z: 6 });
  assert.equal(after.name, "after");
  assert.equal(store.listVectors()[0].id, after.id);
  assert.equal(store.listVectors().length, 40);
});

test("a storage area that throws on setItem does not crash the caller", () => {
  const area = {
    data: {
      [VECTORS_KEY]: JSON.stringify([{ id: "keep", name: "a", x: 1, y: 0, z: 0 }]),
      [HISTORY_KEY]: JSON.stringify([{
        id: "calc-1",
        operation: "magnitude",
        target: "A",
        vectorA: { name: "A", x: 1, y: 0, z: 0 },
        vectorB: { name: "B", x: 0, y: 1, z: 0 },
        result: { kind: "scalar", value: 1 },
        createdAt: "2026-11-12T00:00:00.000Z",
      }]),
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  const store = createStore(area);

  assert.equal(store.saveVector({ name: "b", x: 0, y: 1, z: 0 }), null);
  assert.equal(store.deleteVector("keep"), false);
  assert.equal(store.appendCalculation(calculation(4)), null);
  assert.deepEqual(store.listVectors(), [{ id: "keep", name: "a", x: 1, y: 0, z: 0 }]);
  assert.equal(store.listHistory()[0].id, "calc-1");
  assert.equal(area.getItem(VECTORS_KEY).includes("keep"), true);
});

test("corrupt or throwing reads become empty lists", () => {
  const area = memoryArea();
  area.setItem(VECTORS_KEY, "{");
  area.setItem(HISTORY_KEY, "null");
  const store = createStore(area);

  assert.deepEqual(store.listVectors(), []);
  assert.deepEqual(store.listHistory(), []);

  const saved = store.saveVector({ name: "recovered", x: 1, y: 2, z: 3 });
  assert.equal(saved.name, "recovered");
  assert.deepEqual(store.listVectors(), [saved]);

  const broken = createStore({
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  });
  assert.deepEqual(broken.listVectors(), []);
  assert.deepEqual(broken.listHistory(), []);
  assert.equal(broken.saveVector({ name: "x", x: 1, y: 0, z: 0 }), null);
  assert.equal(broken.deleteVector("x"), false);
  assert.equal(broken.appendCalculation(calculation(1)), null);
});

test("history stores snapshots so later edits do not rewrite the past", () => {
  const store = createStore(memoryArea());
  const vectorA = { name: "A", x: 1, y: 0, z: 0 };
  const vectorB = { name: "B", x: 0, y: 1, z: 0 };
  store.appendCalculation({
    operation: "normalize",
    target: "B",
    vectorA,
    vectorB,
    result: { kind: "vector", x: 0, y: 1, z: 0 },
  });

  vectorA.x = 99;
  vectorB.name = "changed";

  const row = store.listHistory()[0];
  assert.equal(row.operation, "normalize");
  assert.equal(row.target, "B");
  assert.deepEqual(row.vectorA, { name: "A", x: 1, y: 0, z: 0 });
  assert.deepEqual(row.vectorB, { name: "B", x: 0, y: 1, z: 0 });
  assert.equal(typeof row.createdAt, "string");
  assert.equal(Number.isNaN(Date.parse(row.createdAt)), false);
});
