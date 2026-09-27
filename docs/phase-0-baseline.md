# Phase 0 baseline — 2026-09-21

Before migration, `npm run check` passed all five existing check scripts:
model, spatial, CAD, doors, layout-store. No baseline test failures.

Entry: hand-maintained `dist/index.html`, loading global vendored Konva 10.6.0,
Three 0.180 through an import map and vendored OrbitControls. `npm run dev`
ran `scripts/serve.mjs` at http://127.0.0.1:5173. No bundler or Vue shell.

Source modules: model, spatial, doors (including DOM form rendering), cad-geometry,
cad-editor, spatial-editor, app, rack-highlight, layout-store, layout-manager.
The two editor modules and app combined editor orchestration, DOM and rendering.

Storage: `warehouse-layout-library-v1`, envelope `{format:1,savedAt,current,history}`.
History snapshots contain `{id,at,label,model}`; cap 20, with existing quota trimming.
Fallback reads `warehouse-layout-v3`, `warehouse-layout-v2`, `warehouse-layout-v1`.
Layout JSON remains schema 1/2, with `racks[].slots[].code` and demo `cartons`.
Import validates the complete JSON (5 MB), preserves a before-replacement snapshot,
then replaces atomically. Export includes the same complete layout and demo inventory.
Autosave debounces 1200 ms; visibility/unload and mode switching flush dirty changes.

Behavior baseline: Konva 2D and Three 3D share one model, default view mode, FG filters,
rack/area/door property editing, CAD multi-selection, directional marquee, group drag,
snap/guides, transformations, array, keyboard nudges, undo/redo, focus and fit.
Doors move along their boundary edge with 0.1 m snap and overlap/bounds validation.
Existing JSON import fixtures are preserved under scripts/fixtures.

Known verification limitations: browser automation connection was unavailable before
this migration. Previous door horizontal/vertical drag and undo were manually exercised;
the most recent 3D rack highlight had only code checks, not visual acceptance.
A prior test door may remain in that browser's local layout. No user storage was cleared.

Scope exception explicitly requested: retain legacy localStorage persistence and demo
cartons behind an infrastructure boundary until later phases; do not migrate the JSON
contract, Dexie, runtime separation, location-code semantics or CAD algorithms in phases 0–3.
