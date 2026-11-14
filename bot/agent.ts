import { defineAgent, tempFs } from "@grok/agent-sdk";

export default defineAgent({
  name: "3d-vector-calculator",
  tools: ["read", "grep", "glob", "ls"],
  fs: tempFs({ "/brief.md": "A single-page calculator for people checking 3D vector math in graphics, physics, or coursework. The left side computes dot product, cross product, magnitude, normalize, and the angle between two vectors. The right side draws those vectors as colored arrows on a dark perspective grid, and named vectors plus recent calculations stay in the browser." }),
});
