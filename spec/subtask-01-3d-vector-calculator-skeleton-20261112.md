# Subtask: Project skeleton and server

## Metadata
- **Subtask ID**: 01
- **Feature**: 3D Vector Calculator
- **Assigned Subagent**: generalPurpose
- **Dependencies**: None
- **Created**: 20261112

## Objective

Create the zero-dependency app root, a static server, and the dark split shell the later modules fill in.

## Deliverables Checklist
- [x] package.json with type module, start and test scripts, and no dependencies
- [x] server.mjs that serves public/ and exports createServer
- [x] public/index.html split shell with an empty left panel and a canvas
- [x] public/styles.css full-height dark split layout
- [x] public/app.js ES module entry that loads without throwing

## Definition of Done
- [x] npm start serves index.html, styles.css, and app.js with matching MIME types
- [x] A missing file returns 404
- [x] A path that contains .. does not escape public/
- [x] The page shows a left column and a right-hand canvas

## Implementation Notes

App root is demos/3d-vector-calculator/. Start script is node server.mjs. Listen on process.env.PORT or 3000 only when the file is the main module, and export createServer so tests can bind port 0. Resolve paths inside public/ and reject traversal. MIME map: html, css, js, svg, and a binary fallback. Left column about 380px and scrollable; the canvas fills the rest. Colors lean dark: page near #0e1116, panel near #171b22, text near #e7ecf3. Script tag is type=module.

## Testing Strategy

Boot createServer on port 0 and fetch /, /styles.css, a missing path, and a traversal path. Confirm status codes and that index.html contains the panel and canvas.

## Execution Notes

[To be filled by executing agent]

### Agent Session Info
- Agent: [Not yet assigned]
- Started: [Not yet started]
- Completed: [Not yet completed]

### Work Log

### Blockers Encountered

### Files Modified
