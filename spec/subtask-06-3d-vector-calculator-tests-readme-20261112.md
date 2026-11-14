# Subtask: Tests and README

## Metadata
- **Subtask ID**: 06
- **Feature**: 3D Vector Calculator
- **Assigned Subagent**: generalPurpose
- **Dependencies**: 01, 02, 03, 04, 05
- **Created**: 20261112

## Objective

Lock the math, storage, projection, and server behavior in node:test, and document how to run the app.

## Deliverables Checklist
- [x] test/math.test.mjs for the five operations, null guards, clamping, and formatNumber
- [x] test/storage.test.mjs using an in-memory storage area
- [x] test/scene.test.mjs for project() without a canvas
- [x] test/server.test.mjs for 200, MIME, 404, and traversal
- [x] README.md with npm start, npm test, the five operations, and localStorage behavior

## Definition of Done
- [x] npm test passes with node:test and no extra runner
- [x] README states the app root command, the default port, and that the 3D view is canvas rather than Three.js
- [x] Tests cover the fixtures named in the vector-math subtask and the storage caps

## Implementation Notes

Test files are ESM and import from ../public/ and ../server.mjs. Server test uses port 0 and closes the server. README is short: what the app does, the split layout, degrees and three decimals, library and history caps, and the two npm scripts. Do not add dependencies to package.json.

## Testing Strategy

Run npm test from demos/3d-vector-calculator and confirm every test file passes.

## Execution Notes

[To be filled by executing agent]

### Agent Session Info
- Agent: [Not yet assigned]
- Started: [Not yet started]
- Completed: [Not yet completed]

### Work Log

### Blockers Encountered

### Files Modified
