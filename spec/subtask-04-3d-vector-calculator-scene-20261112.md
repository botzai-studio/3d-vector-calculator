# Subtask: Canvas vector scene

## Metadata
- **Subtask ID**: 04
- **Feature**: 3D Vector Calculator
- **Assigned Subagent**: generalPurpose
- **Dependencies**: 01
- **Created**: 20261112

## Objective

Draw the grid, axes, and arrows in perspective and let the user orbit and zoom.

## Deliverables Checklist
- [x] public/scene.js exporting createScene(canvas) and a pure project(point, camera)
- [x] an XZ grid and an RGB axis triad on a dark canvas
- [x] color-coded arrows for A, B, and an optional result vector, plus a small legend
- [x] pointer-drag orbit and wheel zoom that keep the view framed on the origin

## Definition of Done
- [x] project() maps the origin to the view center for the default camera
- [x] A point on the camera's up axis projects above the origin, and a point to the camera's right projects to the right
- [x] createScene does not touch document or window at import time
- [x] scene.js does not import math.js or storage.js

## Implementation Notes

Y-up, right-handed, perspective. Default camera looks at the origin from a front-right, slightly raised position. Arrow colors: A #3ee0c5, B #ffb020, result #e85dff; axes X #ff5a5a, Y #5dff7a, Z #5aa6ff. Draw arrowheads in screen space. Frame distance so the longest arrow spans about 70% of the view, with a minimum world extent of 2. Honor devicePixelRatio and resize with the canvas parent. Keep camera cross and normalize local to this file so the slice stays independent. Module top level must not read document.

## Testing Strategy

Import project in node:test with a fixed camera and assert center, up, and right. Do not require a canvas or a browser.

## Execution Notes

[To be filled by executing agent]

### Agent Session Info
- Agent: [Not yet assigned]
- Started: [Not yet started]
- Completed: [Not yet completed]

### Work Log

### Blockers Encountered

### Files Modified
