import { defineTool } from "@grok/agent-sdk/tools";

export default defineTool({
  description: "Read the approved demo capabilities before explaining them.",
  effect: "read",
  async execute() {
    return {
  "title": "3D Vector Calculator",
  "overview": "A single-page calculator for people checking 3D vector math in graphics, physics, or coursework. The left side computes dot product, cross product, magnitude, normalize, and the angle between two vectors. The right side draws those vectors as colored arrows on a dark perspective grid, and named vectors plus recent calculations stay in the browser.",
  "requirements": [
    "FR-1: The user can enter vectors A and B as numeric x, y, and z components.",
    "FR-2: The user can compute the dot product of A and B and see a scalar.",
    "FR-3: The user can compute the cross product A × B and see the resulting vector.",
    "FR-4: The user can compute the magnitude of the selected vector, A or B.",
    "FR-5: The user can compute the unit vector of the selected vector, A or B.",
    "FR-6: The user can compute the angle between A and B in degrees, shown to three decimal places.",
    "FR-7: A zero-length vector used by normalize or angle, and any non-numeric component, shows a clear message and no NaN.",
    "FR-8: The right pane draws A and B, plus a result arrow when the result is a vector, on a light grid with an axis triad.",
    "FR-9: The user can drag to orbit the view and use the wheel to zoom, without losing the origin.",
    "FR-10: The user can save the current A or B under a name, load a saved vector into A or B, and delete it.",
    "FR-11: The user can reopen a recent calculation and restore its operands, operation, target, and result.",
    "FR-12: Named vectors and history persist in localStorage across reloads, within the stated caps.",
    "FR-13: The workspace is a full-height split: a calm dark calculation panel on the left and a large dark viewport on the right."
  ]
};
  },
});
