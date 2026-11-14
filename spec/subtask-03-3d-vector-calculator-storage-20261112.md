# Subtask: Library and history storage

## Metadata
- **Subtask ID**: 03
- **Feature**: 3D Vector Calculator
- **Assigned Subagent**: generalPurpose
- **Dependencies**: 01
- **Created**: 20261112

## Objective

Persist named vectors and calculation snapshots in a swappable storage area with caps.

## Deliverables Checklist
- [x] public/storage.js exporting createStore(storageArea)
- [x] save, list, and delete for named vectors
- [x] append and list for calculation history, newest first
- [x] caps of 40 named vectors and 30 history entries, with write failures caught

## Definition of Done
- [x] A saved vector round-trips through a memory storage area with id, name, x, y, and z
- [x] Deleting a vector removes only that id
- [x] Appending 31 calculations leaves the 30 newest
- [x] A storage area that throws on setItem does not crash the caller

## Implementation Notes

Keys are 3d-vector-calculator:vectors and 3d-vector-calculator:history. Ids use crypto.randomUUID when present, otherwise a time-and-random string. vectorA and vectorB are snapshots {name, x, y, z}. result is {kind: scalar|vector|error, value or x,y,z or message}. target is A or B. createdAt is an ISO string. Do not import math.js. The browser passes localStorage; tests pass a map with getItem and setItem.

## Testing Strategy

Drive createStore with an in-memory map in node:test. Cover save, list, delete, history order, the cap, and a setItem that throws.

## Execution Notes

[To be filled by executing agent]

### Agent Session Info
- Agent: [Not yet assigned]
- Started: [Not yet started]
- Completed: [Not yet completed]

### Work Log

### Blockers Encountered

### Files Modified
