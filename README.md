# 3D Vector Calculator

A desktop workspace for checking 3D vector math. The page is a full-height split: a calculation panel on the left, and a large view on the right. The view is a 2D canvas with a hand-rolled perspective projection (Y-up, right-handed). It is not Three.js.

Dot, cross, magnitude, normalize, and angle update as you type. Angles are in degrees and displayed numbers use three decimal places. A fresh visit starts at A = (1, 0, 0) and B = (0, 1, 0). Magnitude and normalize use the selected vector; dot, cross, and angle use both. A zero-length vector shows a message instead of NaN.

Play demo eases A and B along a looping path. The component fields, the result, and the arrows update together until the sweep is stopped.

Named vectors and calculation history stay in `localStorage`. The library key is `3d-vector-calculator:vectors` (at most 40 named vectors). The history key is `3d-vector-calculator:history` (the 30 newest rows, newest first). Each history row stores component snapshots, the operation, the unary target, and the result, so later edits do not rewrite the past. A failed write is caught and reported in the panel.

## Run

From `demos/3d-vector-calculator`:

```bash
npm start
```

That runs `node server.mjs` and serves `public/` at <https://localhost:4100>. The certificate is the local file `certs/localhost.crt`. Set `PORT` to choose another port. There are no npm dependencies.

```bash
npm test
```

That runs `node --test` on the math, storage, projection, and server tests. No extra test runner is required.

## Agent SDK companion

This demo also includes a file-first Agent SDK project under `bot/` with smoke evals under `evals/`. See [agent run instructions](AGENT.md). SDK tooling is optional; the browser app still runs and tests without installing it.
