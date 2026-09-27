# Phase 0–3 architecture and validation

## Scope and ownership

- Read the complete `docs/WMS_Map_Engineering_Constitution.md`; root has no duplicate constitution.
- Phase 0 baseline: five original checks PASS, no pre-existing test failures.
- Phase 1: Vite dev/build, npm renderer imports, Vue plugin only, Prettier, ESLint, EditorConfig.
- Phase 2: model/spatial/doors/CAD geometry moved to Core with original algorithms and API names.
  Door form DOM was removed from Core. JSDoc documents actual v2 fields rather than inventing a new schema.
  ESLint and a test enforce inward Core imports and prohibit browser/persistence dependencies.
- Phase 3: Vue owns shell, toolbar/filter/mode/selection presentation, sidebar, property forms,
  layout history/import dialog, save/status/error presentation, and mount/unmount lifecycle.
  Shallow presentation snapshots are copied from the application; the CAD model is plain JS.
- Existing renderer and gesture algorithms stay in application/app and editor modules for compatibility.
  CAD precise/array/delete/help dialog markup is a Vue component, with original imperative form/preview
  and shortcut adapters retained in cad-editor. This explicit transitional boundary avoids rewriting CAD.
- Local storage is accessible only through infrastructure/browser-layout-repository and injected storage.
  Same keys/envelope/quota policy/debounce/import transaction/legacy schema migration remain in use.
  This is the user's explicit Phase 0–3 exception to the final Dexie persistence target.

## Automated coverage

`npm test`: original five check scripts, Core boundaries, plus application integration tests:

- Vue default view lock, mode switch, rack creation, property submit, undo/redo, nudge, 1200 ms autosave.
- Shift selection, FG list filtering with shared areas, precise transform and array dialogs.
- Door selection, horizontal along-edge drag, undo, property and drag lock in view mode.
- Real Three scene object creation and rack highlight count in FG/inventory modes.
- Component unmount frees renderer/stage and global listeners; remount does not duplicate shortcuts.
- Existing envelope loading, import validation, before-replacement history and history restoration.
- Group drag preserves relative positions; Alt precision, Esc cancel, rotation, F/Home.
- JSON export preserves complete model, stable slot IDs/codes and demo cartons.
- Autosave quota failures retain dirty in-memory work and allow retry; failed import save never replaces it.

Pure check scripts retain directional marquee, 0.5 m/grid/corner snapping, rotation, overlap, array copies,
door horizontal/vertical offset clamping, 0.1 m snap, overlap rejection, schema migration and storage atomicity.

An additional one-time AST comparison against the pre-migration source confirmed all four Core modules
retain the same logic (excluding import paths, removed door DOM function, formatting and let/const).
The original app/spatial-editor draw2d, draw3d, box, fit and label function ASTs also match.

DOM tests use happy-dom, real Konva nodes and real Three scene/geometry/material objects. Canvas rasterization
and WebGLRenderer are test doubles. This is not a claim of pixel-perfect browser validation.

## Remaining browser acceptance

Final commands: `npm install`, `npm run build`, `npm test` (15/15), `npm run check`
(all five scripts), `npm run lint` and `npm run format:check` PASS. Vite starts at the
original http://127.0.0.1:5173; HTML, entry and main Vue/application modules return HTTP 200.
Renderer versions are pinned to the original vendored Konva 10.6.0 and Three 0.180.0.
Production JS is approximately 831 kB / 237 kB gzip; Vite reports its normal >500 kB
chunk warning. Code splitting/performance work is deferred rather than changing renderer loading now.

In this Codex Windows sandbox esbuild cannot read an ancestor directory; build/test/dev
were therefore run successfully in the approved normal user environment. This was a
sandbox execution restriction, not a failing application test.

Browser automation failed at discovery (`nodeRepl.fetch request failed`), including before this refactor.
Manually verify production and dev pages in the same original browser profile/origin:

1. 2D canvas sizing, FG fading, 3D actual GPU render, OrbitControls, door/rack pointer hit testing.
2. Left/right marquee, snapping guides, space pan, real pointer capture and drag cancellation.
3. Property panels, native modal focus, file chooser/download, reload of the user's actual stored layout.

No browser storage or user layout was cleared. Tests use isolated in-memory/DOM storage.

## Deferred (Phase 4+)

Renderer class isolation and incremental rendering; finer command/history service decomposition;
complete CAD dialog imperative-adapter removal; Dexie/IndexedDB and legacy workspace migration;
separate runtime inventory contract; remote repositories, C# API, SignalR, SQL, collaboration.
No new layout fields, location-code semantics, CAD snapping/rotation behavior or backend dependencies were introduced.
