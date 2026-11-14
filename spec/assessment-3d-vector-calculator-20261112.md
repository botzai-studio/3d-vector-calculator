# Spec Assessment: 3D Vector Calculator

**Target**: `specs/20261112-3d-vector-calculator/spec-3d-vector-calculator-20261112.md`
**Assessed**: 2026-11-12
**Verdict**: Approve
**Review rounds**: 1

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 4/5 | FR-1–FR-13 and the confirmed features are all assigned: five operations, split workspace, named library, reopenable history, localStorage, degrees to three decimals, and a clear zero-length message. Calculation adds target, which magnitude and normalize need. Nothing states when a history row is appended, the 40-vector cap has no overflow rule, and the live panel is accepted only by a manual pass. |
| Feasibility | 4/5 | The work fits Node 22, node:http, vanilla ES modules, localStorage, and node:test with no packages. Math, storage, and a pure project() seam are realistic slice sizes. The interactive canvas is one subtask whose camera and zoom numbers are left open, so tests can pass while the arrow view is still hard to read. |
| Structure | 5/5 | Manifest, mermaid graph, and phases agree. Subtasks 02, 03, and 04 depend only on 01 and must not import each other, so phase 2 is parallel. 05 wires them together and 06 follows. No cycles. |
| Specificity | 4/5 | Fixtures, storage keys, snapshot and result shapes, caps, arrow colors, MIME types, and traversal checks are concrete. The history commit rule, named-vector overflow, on-screen vector text, and camera yaw, pitch, fov, and zoom limits are still open. |
| Risk Awareness | 4/5 | The risk table covers acos domain errors, localStorage write failures, and a weak custom projection, each with a mitigation and a test hook. Rollback is to delete the demo directory and stay on the zero-dependency stack. Corrupt stored JSON, history flooding from live recompute, and wheel-scroll side effects are not called out. |
| Convention Compliance | 5/5 | Index and subtasks use the zoto layout: decisions, requirements, manifest, dependency graph, phased order, definition of done, risks, and rollback. The app root is demos/3d-vector-calculator/ with npm start, npm test, and no dependencies. |
| **Overall** | **4.3/5** | **Approve** |

## Findings

### Strengths
- The zero-dependency boundary is consistent across decisions, non-goals, the static server, tests, and rollback, with a canvas scene standing in for Three.js.
- Phase-2 modules stay independent, with injectable storage and a pure project() so node:test can cover persistence and projection without a browser.
- Math acceptance is fixture-level: i·j = 0, i×j = k, |(3,4,0)| = 5, normalize(2,0,0) = i, 0/90/180 degree angles, cosine clamping, and null for zero length.
- History stores component snapshots plus a target flag, so later library edits do not rewrite past calculations.

### Issues
| # | Severity | Subtask | Finding | Recommendation |
|---|----------|---------|---------|----------------|
| 1 | HIGH | 05 | History can be listed and restored, but no subtask says when a calculation is appended. Live recompute on every input would either flood the 30-row cap or never record a row. | Pick one write policy in subtask 05, such as an explicit save control or a commit when the operation changes, and add a definition-of-done check that reopening that row restores operands, operation, target, and result. |
| 2 | MEDIUM | 03 | History overflow is defined (31 appends leave the 30 newest). The named-vector cap of 40 has no drop-oldest or reject behavior, and subtask 03’s definition of done does not assert the 41st save. | State the overflow rule and cover the 41st save in test/storage.test.mjs, including the message if the save is rejected. |
| 3 | MEDIUM | 04 | Default camera, zoom bounds, and grid stroke are qualitative. The overview’s “dark perspective grid” also conflicts with FR-8 and the confirmed light grid on a dark viewport. | Pin yaw, pitch, fov, min/max distance, and a light grid color in subtask 04, and align the overview wording with that grid. |
| 4 | LOW | 06 | npm test locks math, storage, project(), and the server. Arrow selection, formatted result text, and history restore live only in the manual pass, so the workspace can break while tests stay green. | Extract a pure helper from operation plus vectors to result text, message, and arrow list, and cover it with node:test. |

### Dependency Graph
- Structural lint run on every round.

### Risk Summary
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| An implementer appends history on every keystroke, so the 30-row cap fills with partial edits and reopen becomes useless. | High | Med | Commit history on an explicit action or when the operation changes, and ignore incomplete drafts. |
| The hand-rolled camera clips long arrows or flattens depth, so the viewport misses the confirmed live arrow view. | Med | Med | Frame to the longest arrow with a minimum extent of 2, lock camera numbers, and keep the project() center, up, and right tests. |
| Corrupt localStorage JSON throws on load and the workspace never starts. | Low | Med | Catch parse failures in createStore and continue with an empty library and history. |

## Recommendation

Approve after a small revision. Sequencing, fixtures, and the zero-dependency split are solid enough to build; specify when history rows are written and how the vector cap overflows, and pin light-grid camera defaults so the viewport matches the confirmed look.

## Review History

| Round | Overall | Verdict |
|-------|---------|---------|
| 1 | 4.30 | Approve |
