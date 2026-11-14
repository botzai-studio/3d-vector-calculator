# Subtask: Calculation workspace

## Metadata
- **Subtask ID**: 05
- **Feature**: 3D Vector Calculator
- **Assigned Subagent**: generalPurpose
- **Dependencies**: 01, 02, 03, 04
- **Created**: 20261112

## Objective

Wire the left panel to the math, storage, and scene so the five operations, library, and history work live.

## Deliverables Checklist
- [x] public/index.html controls for both vectors, the operation, the unary target, the result, the library, and history
- [x] public/app.js recomputing on input and redrawing arrows through createScene
- [x] a message region for zero-length and non-numeric input with no NaN shown
- [x] save, load into A or B, and delete for named vectors
- [x] history rows that restore operands, operation, target, and result

## Definition of Done
- [x] Changing a component or operation updates the formatted result without a submit button
- [x] Cross product and normalize draw a result arrow; dot, magnitude, and angle do not
- [x] Magnitude and normalize follow the A/B target; dot, cross, and angle use both vectors
- [x] After a reload, saved vectors and history are still listed and a history row restores that calculation
- [x] Empty library and empty history each show a short empty state, and the first visit defaults to i and j

## Implementation Notes

Import math.js, storage.js, and scene.js from app.js. Pass localStorage to createStore. Operation values are dot, cross, magnitude, normalize, and angle. Format displayed numbers with formatNumber and append a degree sign for angles. On null math results, show a specific sentence such as that the vector has zero length. Catch storage errors and show that the browser could not save. Legend and canvas stay in the right pane. Extend the skeleton CSS for inputs, segmented operations, lists, focus, and the message; do not replace the split layout.

## Testing Strategy

Verify through the pure modules' tests plus a manual pass: each operation, the zero vector, save and reload, load into A and B, delete, and history restore. Confirm the result text and which arrows are requested.

## Execution Notes

[To be filled by executing agent]

### Agent Session Info
- Agent: [Not yet assigned]
- Started: [Not yet started]
- Completed: [Not yet completed]

### Work Log

### Blockers Encountered

### Files Modified
