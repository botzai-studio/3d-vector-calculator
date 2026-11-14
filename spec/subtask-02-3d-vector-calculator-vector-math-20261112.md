# Subtask: Vector math module

## Metadata
- **Subtask ID**: 02
- **Feature**: 3D Vector Calculator
- **Assigned Subagent**: generalPurpose
- **Dependencies**: 01
- **Created**: 20261112

## Objective

Implement the five operations as pure functions with safe results for zero-length vectors.

## Deliverables Checklist
- [x] public/math.js exporting dot, cross, magnitude, normalize, and angleDegrees
- [x] null returns from normalize and angleDegrees when a required vector has length 0
- [x] angleDegrees in degrees with the cosine clamped to [-1, 1]
- [x] formatNumber using three decimal places

## Definition of Done
- [x] i·j is 0, i×j is (0, 0, 1), magnitude of (3, 4, 0) is 5, and normalize(2, 0, 0) is (1, 0, 0)
- [x] The angle between i and j is 90, between i and 2i is 0, and between i and -i is 180
- [x] normalize and angleDegrees of a zero vector return null
- [x] math.js imports no DOM and no other local module

## Implementation Notes

Vectors are plain {x, y, z}. Cross product is right-handed. angleDegrees is acos(clamped dot / (|a||b|)) times 180/π. Treat magnitude below 1e-12 as zero. formatNumber uses toFixed(3) and does not change the numeric result. Do not import storage.js or scene.js.

## Testing Strategy

Import the exports from node:test and assert the fixtures above, including a cosine slightly outside [-1, 1] still returning a finite angle.

## Execution Notes

[To be filled by executing agent]

### Agent Session Info
- Agent: [Not yet assigned]
- Started: [Not yet started]
- Completed: [Not yet completed]

### Work Log

### Blockers Encountered

### Files Modified
