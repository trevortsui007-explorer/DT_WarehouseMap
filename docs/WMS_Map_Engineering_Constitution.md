# WMS Map Engineering Constitution

> Version: 1.0  
> Scope: WMS Finished-Goods Warehouse Map Editor  
> Status: Engineering Baseline / Codex Refactoring Specification  
> Target stack: Vue 3 + Vite + Pure ES Modules + Konva.js + Three.js + Dexie.js / IndexedDB  
> Backend evolution: C# WMS API + SQL Server + SignalR  
> Code style: Enterprise Compact

---

## 0. Purpose

This document is the engineering constitution for the standalone WMS Map project.

It is intended to be used by:

- Codex when refactoring or extending the project.
- Human developers when reviewing architecture and code.
- Future maintainers when integrating the editor into the C# / WMS platform.

The project is a **local-first warehouse map editor**. Its key architectural idea is that warehouse layout editing and warehouse-location status visualization share the same layout model, while 2D and 3D are only two renderers of that model.

The project MUST remain maintainable as it evolves from a local prototype into an enterprise WMS map module.

---

# 1. Architectural Principles

The following rules are constitutional and take priority over implementation convenience.

## 1.1 Framework-Agnostic Core

The domain core MUST NOT depend on:

- Vue
- Konva.js
- Three.js
- DOM APIs
- `window`
- `document`
- `localStorage`
- IndexedDB / Dexie
- HTTP
- SignalR

The core receives plain data and returns plain data.

Example:

```js
export function edgeLength(boundary, side) {
  return ['top', 'bottom'].includes(side) ? boundary.width : boundary.depth;
}
```

The core must remain independently testable in Node.js.

---

## 1.2 Vue Is the Application Shell

Vue 3 is responsible for:

- Application UI
- Toolbar
- Sidebar
- Property panels
- Dialogs
- View/edit mode
- Selection presentation
- Layout manager UI
- Local/server persistence status
- Error and validation messages

Vue MUST NOT become the owner of CAD geometry algorithms.

Do not move geometry code into `ref`, `reactive`, `watch`, or Vue components merely because Vue has been introduced.

---

## 1.3 Konva and Three.js Are Renderers

Konva.js and Three.js are rendering technologies, not business-data owners.

They consume:

```text
Layout Model
+
Editor/View State
+
Runtime State
```

and produce a visual representation.

They MUST NOT become the authoritative source for:

- Rack coordinates
- Door positions
- Location identity
- Layout version
- Inventory state
- Business status

A renderer may cache graphical objects internally, but the source of truth remains the application/domain model.

---

## 1.4 Layout State and Runtime State Must Be Separate

The system contains two fundamentally different domains.

### Layout Domain

Low-frequency, versioned master data:

- Warehouse boundary
- Rack
- Slot / Location
- Area
- Group
- Door
- FG ownership
- Spatial configuration

### Runtime Domain

High-frequency business state:

- CurrentLocation
- HU count
- Outer-box count
- SKU / product summary
- Occupancy
- Lock state
- Inbound/outbound task state
- Inventory-check state
- Last update time

Do not store runtime inventory information inside the authoritative layout model.

The current prototype field such as:

```js
slot.cartons
```

is considered demo/runtime data and MUST eventually be removed from the authoritative layout schema.

---

## 1.5 Source Code Must Never Be Manually Minified

The project uses the **Enterprise Compact** style:

> Compact does not mean minified.

Source files MUST prioritize:

1. Readability
2. Debuggability
3. Clear Git diffs
4. Maintainability
5. Stable formatting

Do not reduce line count as an optimization target.

---

## 1.6 `src` Is Source; `dist` Is Generated Output

All editable source code MUST live under:

```text
src/
```

The `dist/` directory is build output only.

Codex MUST NOT directly edit files inside `dist/`.

If the current project contains hand-written source files under `dist/`, they must be migrated into `src/` before `dist/` becomes build-only.

---

# 2. Target Architecture

```text
                         ┌─────────────────────────────┐
                         │          Vue 3 UI           │
                         │                             │
                         │ Toolbar / Sidebar / Dialog  │
                         │ Property Panels / Status    │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │      Application Layer      │
                         │                             │
                         │ Editor State                │
                         │ Selection                   │
                         │ Commands                    │
                         │ Undo / Redo                 │
                         │ Layout Lifecycle            │
                         │ Persistence Coordination    │
                         └──────────────┬──────────────┘
                                        │
                   ┌────────────────────┴────────────────────┐
                   ▼                                         ▼
        ┌────────────────────────┐               ┌────────────────────────┐
        │      Domain Core       │               │       Renderers        │
        │                        │               │                        │
        │ Model                  │◄─────────────►│ Konva Renderer         │
        │ Geometry               │               │ Three Renderer         │
        │ Spatial Rules          │               │                        │
        │ Door Rules             │               └────────────────────────┘
        │ Validation             │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │     Infrastructure     │
        │                        │
        │ Preferences            │
        │ Dexie / IndexedDB      │
        │ JSON Import/Export     │
        │ C# REST API            │
        │ SignalR                │
        └────────────────────────┘
```

Dependency direction MUST point inward toward the core.

---

# 3. Technology Decisions

## 3.1 Required

- Vue 3
- Vite
- Native ES Modules
- Konva.js
- Three.js
- Dexie.js
- IndexedDB
- ESLint
- Prettier
- Vitest

---

## 3.2 Initial Language Strategy

The initial refactor SHOULD remain:

```text
JavaScript + JSDoc
```

Do not combine all of the following migrations into one large change:

```text
Native JS
→ Vue 3
→ TypeScript
→ New persistence
→ New renderer architecture
```

TypeScript may be introduced later as a separate controlled migration.

For now, domain contracts SHOULD use JSDoc.

Example:

```js
/**
 * @typedef {Object} Rack
 * @property {string} id
 * @property {string} code
 * @property {'FG01'|'FG02'} fg
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} depth
 * @property {number} rotation
 * @property {number} columns
 * @property {number} levels
 */
```

---

## 3.3 State Management

Do not introduce Pinia merely because Vue 3 is introduced.

Phase 1 may use:

- Composition API
- Small explicit stores
- `reactive`
- `readonly`
- application services

Pinia may be introduced later if state complexity materially benefits from it.

---

## 3.4 CSS Strategy

Use normal CSS.

Do not introduce Tailwind or a CSS framework during the architecture refactor unless there is a separate approved requirement.

---

# 4. Recommended Directory Structure

```text
wms-map/
│
├─ src/
│  │
│  ├─ core/
│  │  ├─ model/
│  │  │  ├─ layout.js
│  │  │  ├─ rack.js
│  │  │  ├─ slot.js
│  │  │  ├─ area.js
│  │  │  ├─ group.js
│  │  │  └─ door.js
│  │  │
│  │  ├─ geometry/
│  │  │  ├─ bounds.js
│  │  │  ├─ collision.js
│  │  │  ├─ snap.js
│  │  │  ├─ transform.js
│  │  │  └─ array.js
│  │  │
│  │  ├─ spatial/
│  │  │  ├─ boundary.js
│  │  │  ├─ overlap.js
│  │  │  └─ validation.js
│  │  │
│  │  ├─ doors/
│  │  │  ├─ geometry.js
│  │  │  └─ validation.js
│  │  │
│  │  └─ contracts/
│  │     ├─ layout-contract.js
│  │     └─ runtime-contract.js
│  │
│  ├─ application/
│  │  ├─ editor/
│  │  │  ├─ editor-service.js
│  │  │  └─ editor-state.js
│  │  ├─ commands/
│  │  ├─ history/
│  │  ├─ selection/
│  │  ├─ layout/
│  │  └─ persistence/
│  │
│  ├─ renderers/
│  │  ├─ konva/
│  │  │  ├─ KonvaRenderer.js
│  │  │  ├─ rack-renderer.js
│  │  │  ├─ area-renderer.js
│  │  │  ├─ door-renderer.js
│  │  │  └─ guides-renderer.js
│  │  │
│  │  └─ three/
│  │     ├─ ThreeRenderer.js
│  │     ├─ rack-mesh.js
│  │     ├─ slot-mesh.js
│  │     └─ door-mesh.js
│  │
│  ├─ infrastructure/
│  │  ├─ persistence/
│  │  │  ├─ preference/
│  │  │  │  └─ local-preference.js
│  │  │  │
│  │  │  ├─ indexeddb/
│  │  │  │  ├─ db.js
│  │  │  │  ├─ schema.js
│  │  │  │  ├─ repositories/
│  │  │  │  │  ├─ local-layout-repository.js
│  │  │  │  │  ├─ draft-repository.js
│  │  │  │  │  ├─ history-repository.js
│  │  │  │  │  └─ snapshot-repository.js
│  │  │  │  └─ migrations/
│  │  │  │     ├─ v1.js
│  │  │  │     ├─ v2.js
│  │  │  │     └─ v3.js
│  │  │  │
│  │  │  └─ remote/
│  │  │     └─ remote-layout-repository.js
│  │  │
│  │  ├─ api/
│  │  │  └─ layout-api.js
│  │  │
│  │  ├─ realtime/
│  │  │  └─ signalr-client.js
│  │  │
│  │  └─ import-export/
│  │     ├─ json-importer.js
│  │     └─ json-exporter.js
│  │
│  ├─ stores/
│  │  ├─ editor-store.js
│  │  ├─ layout-store.js
│  │  └─ runtime-store.js
│  │
│  ├─ components/
│  │  ├─ toolbar/
│  │  ├─ sidebar/
│  │  ├─ properties/
│  │  ├─ layout-manager/
│  │  └─ dialogs/
│  │
│  ├─ views/
│  │  └─ MapEditorView.vue
│  │
│  ├─ styles/
│  │  ├─ variables.css
│  │  ├─ base.css
│  │  ├─ editor.css
│  │  └─ components.css
│  │
│  ├─ App.vue
│  └─ main.js
│
├─ tests/
│  ├─ model/
│  ├─ geometry/
│  ├─ spatial/
│  ├─ doors/
│  ├─ persistence/
│  └─ application/
│
├─ public/
├─ dist/
│
├─ AGENTS.md
├─ .editorconfig
├─ .prettierrc
├─ eslint.config.js
├─ package.json
├─ vite.config.js
└─ README.md
```

The exact file split may evolve, but the layer boundaries MUST be preserved.

---

# 5. Mapping From Existing Modules

The current modules should be migrated rather than rewritten from scratch.

```text
Current                         Target

model.js
  └──────────────────────────► core/model/

spatial.js
  └──────────────────────────► core/spatial/

doors.js
  └──────────────────────────► core/doors/

cad-geometry.js
  └──────────────────────────► core/geometry/

cad-editor.js
  └──────────────────────────► application/editor/
                               + renderers/konva/

spatial-editor.js
  └──────────────────────────► application/editor/
                               + Vue property panels

layout-store.js
  └──────────────────────────► infrastructure/persistence/

layout-manager.js
  └──────────────────────────► application/layout/

app.js
  └──────────────────────────► progressively decomposed into:
                               App.vue
                               application services
                               stores
                               renderers
```

The goal is not a rewrite.

The goal is decomposition while preserving behavior.

---

# 6. Domain Model Rules

## 6.1 Stable Identity

Every persistent map object MUST have a stable ID.

Examples:

- Layout ID
- Rack ID
- Slot ID
- Door ID
- Area ID
- Group ID

IDs MUST NOT be regenerated merely because:

- The object moved
- The object rotated
- The layout was reopened
- A renderer was rebuilt

WMS location codes are business identifiers and are not a substitute for internal stable IDs.

---

## 6.2 Location Identity

A slot/location should conceptually contain:

```js
{
  id: 'slot-...',
  locationCode: 'H201-03-02',
  rackId: 'rack-H201',
  column: 3,
  level: 2
}
```

Runtime state should be keyed by `locationCode` or another explicitly agreed integration key.

---

## 6.3 Door Model

Doors remain stored relative to a warehouse boundary edge:

```text
side
offset
width
```

rather than as an independent absolute X/Y rectangle.

This allows boundary movement and scaling without invalidating door placement.

---

## 6.4 FG and Physical Space

FG01 / FG02 are business ownership dimensions.

They do not imply physically separate map coordinate systems unless explicitly configured.

Shared physical areas such as:

- Aisles
- Inbound staging
- Outbound staging
- Warehouse boundary

remain visible regardless of FG filtering unless business rules explicitly state otherwise.

---

# 7. Layout Contract and Runtime Contract

## 7.1 Layout Contract

The layout contract is low-frequency and versioned.

Recommended shape:

```text
Layout
├─ schemaVersion
├─ layoutId
├─ layoutCode
├─ warehouseCode
├─ floorNo
├─ boundary
├─ racks
├─ slots
├─ groups
├─ areas
└─ doors
```

---

## 7.2 Runtime Contract

Runtime state is high-frequency and separate.

Recommended shape:

```text
LocationRuntimeState
├─ locationCode
├─ huCount
├─ outerBoxCount
├─ skuSummary
├─ occupancyStatus
├─ lockStatus
├─ inboundTaskStatus
├─ outboundTaskStatus
├─ inventoryTaskStatus
├─ updatedAt
└─ version
```

---

## 7.3 Rendering Rule

Both renderers consume the same logical inputs:

```text
Layout
+
Runtime State
+
View State
```

2D and 3D MUST NOT maintain separate business models.

---

# 8. Persistence Constitution

The final persistence architecture is:

```text
Vue / Map Editor
       │
       ├─ localStorage
       │    └─ Preference
       │
       ├─ Dexie.js
       │    └─ IndexedDB
       │         └─ Local Workspace
       │
       └─ WMS API
            └─ SQL Server
                 └─ Enterprise Source of Truth
```

---

# 9. `localStorage` Responsibilities

`localStorage` is retained only as a lightweight preference store.

Allowed examples:

- `theme`
- `sidebarWidth`
- `lastTab`
- `lastTool`
- `lastLayoutCode`
- Simple UI toggles
- Non-critical zoom/pan preferences

Example:

```js
localStorage.setItem('wms-map.theme', 'dark');
localStorage.setItem('wms-map.lastTool', 'select');
localStorage.setItem('wms-map.sidebarWidth', '320');
```

Forbidden:

- Full layout JSON
- Map objects
- Rack data
- Location master data
- Group data
- Drafts
- History
- Snapshots
- Sync queue
- Enterprise business data

Decision rule:

> If deleting the value only resets the interface, it may be stored in `localStorage`.

> If deleting the value would destroy meaningful user work, it MUST NOT be stored in `localStorage`.

Final role:

```text
localStorage
    ↓
Preference Store Only
```

---

# 10. Dexie.js + IndexedDB Responsibilities

Dexie.js is the IndexedDB access layer.

IndexedDB is the browser-local workspace.

Recommended local stores:

```text
Local Workspace
├─ layouts
├─ objects
├─ drafts
├─ history
├─ snapshots
├─ cache
└─ syncQueue
```

Appropriate uses:

- Local map drafts
- Autosave
- Browser crash recovery
- Offline work
- Local history
- Snapshots
- Service-data cache
- Pending synchronization queue
- Local editor state that represents user work

Core flow:

```text
High-frequency Editing
        ↓
      Memory
        ↓
Debounced Dexie AutoSave
```

Do not call the server for every rack drag, resize, rotation, or geometry adjustment.

---

# 11. SQL Server Responsibilities

SQL Server is the enterprise source of truth.

It stores:

- Server drafts
- Published layouts
- Layout versions
- Business-query projections
- Map objects where relational access is useful
- Audit information
- Creator / modifier
- Publish metadata
- Multi-user shared state

A formal layout MUST NOT exist only in IndexedDB.

IndexedDB is:

- Browser-profile scoped
- Device scoped
- Clearable by users
- Unsuitable as enterprise backup
- Unsuitable as the only shared source of truth

---

# 12. Draft Model

Two draft types MUST be distinguished.

## 12.1 Local Draft

Storage:

```text
Dexie / IndexedDB
```

Purpose:

- High-frequency autosave
- Refresh recovery
- Browser-crash recovery
- Network-loss recovery
- Local editing continuity

Characteristics:

```text
High Frequency
Local
Fast
Network Independent
```

---

## 12.2 Server Draft

Storage:

```text
SQL Server
```

Purpose:

- Continue editing on another PC
- Continue editing in another browser
- Shift handover
- Administrator visibility
- Shared enterprise draft
- Formal version management
- Pre-publish persistence

Characteristics:

```text
Low Frequency
Server Persistent
Shared
Auditable
```

---

# 13. Save Semantics

## 13.1 AutoSave

```text
AutoSave
    ↓
Dexie / IndexedDB
```

Recommended debounce:

```text
1–3 seconds after meaningful model changes
```

Autosave MUST NOT continuously serialize/write on every pointer-move event.

A drag operation should generally persist after a meaningful edit boundary such as drag end, command completion, or a debounced model-change event.

---

## 13.2 Save Draft

Triggered by:

```text
Ctrl + S
```

or:

```text
Save Draft
```

Flow:

```text
Current Memory Model
      ↓
Local Draft
      ↓
WMS API
      ↓
SQL Server DRAFT
```

---

## 13.3 Publish

Flow:

```text
SQL Server DRAFT
      ↓
Validation
      ↓
PUBLISHED Version
```

Only a successfully validated published version becomes the production layout.

---

# 14. Local Synchronization Metadata

Recommended local metadata:

```js
{
  layoutId: '...',
  layoutCode: 'FG01-MAIN',
  baseVersion: 18,
  dirty: true,
  lastLocalSaveAt: '2026-09-21T22:10:15',
  lastServerSaveAt: '2026-09-21T22:08:30'
}
```

Possible UI status:

```text
Saved locally
Server draft not synchronized
```

After a successful server draft save:

```text
dirty = false
baseVersion = serverVersion
```

---

# 15. Optimistic Version Control

The server API SHOULD use optimistic concurrency.

Example:

```text
User A loads Version 18
User B loads Version 18

User A publishes
→ Server becomes Version 19

User B attempts to save/publish
with BaseVersion = 18
```

The server should reject stale writes, typically as:

```text
409 Conflict
```

The client MUST NOT silently overwrite a newer server version.

---

# 16. `syncQueue`

A Dexie-based `syncQueue` may be added for:

- Temporary API outages
- Offline editing
- Deferred synchronization
- Retryable local operations

However:

- The initial migration does not need to implement a full offline-sync engine.
- `syncQueue` should be treated as an extensibility point.
- Formal business truth remains on SQL Server.

Do not build distributed-conflict resolution prematurely.

---

# 17. IndexedDB Schema Migration

Recommended structure:

```text
src/
└─ infrastructure/
   └─ persistence/
      └─ indexeddb/
         ├─ db.js
         ├─ schema.js
         ├─ repositories/
         └─ migrations/
            ├─ v1.js
            ├─ v2.js
            └─ v3.js
```

Schema versions must be explicit.

Example evolution:

```text
Version 1
layouts
objects
```

```text
Version 2
layouts
objects
drafts
history
```

```text
Version 3
layouts
objects
drafts
history
snapshots
syncQueue
```

An application upgrade MUST NOT require users to clear IndexedDB as the normal migration strategy.

Migration goal:

```text
Old Local Data
      ↓
Schema Migration
      ↓
New Local Structure
```

Existing drafts and local history should be preserved whenever safely possible.

---

# 18. Repository Boundary

Business code MUST NOT directly access Dexie.

Forbidden:

```js
// MapEditorView.vue

db.layouts.put(...);
db.drafts.put(...);
```

Required direction:

```text
UI
 ↓
Application
 ↓
Repository Contract
 ↓
Infrastructure Implementation
 ↓
Dexie
```

Example:

```js
await draftRepository.saveDraft(layout);
await historyRepository.append(entry);
```

Possible implementations:

```text
LocalStoragePreferenceRepository
IndexedDbLayoutRepository
RemoteLayoutRepository
```

This rule ensures persistence technology can change without contaminating the editor core.

---

# 19. SQL Persistence Strategy

SQL Server should use a hybrid model:

```text
Snapshot + Relational Projection
```

## 19.1 Version Snapshot

A layout version should retain a complete immutable snapshot.

Conceptually:

```text
WMS_FG_MapLayout
WMS_FG_MapLayoutVersion
```

Example version fields:

```text
VersionId
LayoutId
VersionNo
SnapshotJson
Status
CreatedBy
CreatedDt
PublishedBy
PublishedDt
```

`SnapshotJson` may use `NVARCHAR(MAX)`.

This supports:

- Restore
- Version comparison
- Historical audit
- Stable client/server contract
- Future schema migration

---

## 19.2 Relational Projection

Data required for WMS querying should also be projected into relational structures.

Examples:

```text
WMS_FG_MapRack
WMS_FG_MapLocation
```

Possible fields:

```text
WarehouseCode
LayoutId
LocationCode
RackCode
FG
FloorNo
ColumnNo
LevelNo
X
Y
```

Use relational projection for:

- WMS joins
- Location lookup
- Reports
- Operational queries
- Integration

Do not force all map editing behavior to operate by querying JSON inside SQL Server.

---

# 20. Layout / Runtime SQL Boundary

The map layout domain and WMS runtime domain remain separate.

```text
MapLocation
     │
     │ LocationCode
     ▼
CurrentLocation
     │
     ▼
HU
```

The map defines:

```text
Where a location is
What rack it belongs to
How it is rendered
```

The WMS runtime domain defines:

```text
What inventory is there
What HU is there
What task is active
Whether it is locked
```

---

# 21. Persistence Levels

The full persistence lifecycle is:

```text
┌───────────────────────────────────────┐
│          Level 1 - Memory             │
│                                       │
│ Current editing model                 │
│ Application / Editor state            │
└─────────────────┬─────────────────────┘
                  │ AutoSave
                  ▼
┌───────────────────────────────────────┐
│        Level 2 - IndexedDB            │
│                                       │
│ Local Draft                           │
│ AutoSave                              │
│ Local History                         │
│ Recovery                              │
│ Import Backup                         │
└─────────────────┬─────────────────────┘
                  │ Save Draft / Publish
                  ▼
┌───────────────────────────────────────┐
│         Level 3 - SQL Server          │
│                                       │
│ Server Draft                          │
│ Published Layout                      │
│ Version History                       │
│ Audit                                 │
│ Permission                            │
└───────────────────────────────────────┘
```

---

# 22. Local Draft Recovery

When the application starts:

```text
Load Server Metadata
       +
Load Local Draft Metadata
```

If:

```text
Local dirty = true
Local baseVersion == Server currentVersion
```

the application may offer:

```text
Unsaved local edits were found.

[Restore Local Draft]
[Discard Local Draft]
```

If:

```text
Local baseVersion < Server currentVersion
```

the local draft is stale.

The application MUST NOT silently overwrite the newer server state.

---

# 23. History and Undo/Redo

Undo/Redo and persistence history are related but not identical.

## 23.1 Editor Undo/Redo

Purpose:

- Fast in-session editing
- Command-level reversal

This SHOULD remain application/editor state.

It does not need to write every intermediate command to SQL Server.

---

## 23.2 Local History

Purpose:

- Crash recovery
- Recent local restoration
- Local snapshots

Stored in IndexedDB.

---

## 23.3 Server Version History

Purpose:

- Enterprise audit
- Published history
- Formal recovery

Stored in SQL Server.

Do not conflate these three concepts into one table or one store.

---

# 24. Command Boundary

Complex editor operations SHOULD be modeled as meaningful commands.

Examples:

```text
MoveObjects
RotateObjects
CreateRack
DeleteRack
CreateDoor
ResizeBoundary
ArrayCopy
UpdateRackProperties
```

This helps:

- Undo/Redo
- Autosave boundaries
- Testing
- Audit descriptions
- Future collaboration

Do not persist pointer-move events as business commands.

---

# 25. Vue / Renderer Interaction

Vue owns controls and application state.

Konva owns the 2D rendering surface.

Three.js owns the 3D rendering surface.

Preferred interaction:

```text
Vue Command
    ↓
Application Service
    ↓
Domain Model Change
    ↓
Renderer Update
```

Renderer-originated gestures:

```text
Konva Drag / Select
       ↓
Application Command
       ↓
Domain Model Change
       ↓
Render
```

Do not mutate the domain model in multiple unrelated places.

---

# 26. Rendering Performance Rules

Do not re-create the entire 2D/3D scene after every trivial runtime update if a targeted update is available.

Prefer:

```text
LocationChanged
      ↓
Find affected slot
      ↓
Update visual state
```

rather than:

```text
LocationChanged
      ↓
Destroy entire scene
      ↓
Rebuild everything
```

Correctness comes first, but renderer APIs should be designed to support incremental updates.

---

# 27. Enterprise Compact Code Style

## 27.1 General

- Use 2 spaces for indentation.
- Maximum line width: 120 characters.
- One statement per line.
- Use semicolons.
- Use single quotes in JavaScript.
- Use double quotes for HTML attributes.
- Do not manually minify.
- Do not collapse unrelated statements merely to reduce line count.
- Avoid meaningless blank-line noise.
- Prefer descriptive names over short aliases.
- Keep formatting changes scoped to touched code where practical.

---

## 27.2 JavaScript

Allowed concise forms:

```js
if (!layout) return;

const doors = boundary.doors || [];

const isHorizontal = side => side === 'top' || side === 'bottom';
```

Good:

```js
export function draggedDoorOffset(boundary, door, delta, snap = true) {
  let offset = door.offset + delta;
  if (snap) offset = Math.round(offset * 10) / 10;

  const maxOffset = edgeLength(boundary, door.side);
  return Math.max(0, Math.min(maxOffset, offset));
}
```

Bad:

```js
export function draggedDoorOffset(b,d,delta,snap=true){let offset=d.offset+delta;if(snap)offset=Math.round(offset*10)/10;const max=edgeLength(b,d.side);return Math.max(0,Math.min(max,offset));}
```

Rules:

- Guard clauses may remain one line.
- Short assignments may remain one line.
- Short arrow functions may remain one line.
- Multi-step logic MUST be multiline.
- Complex callbacks MUST be multiline.
- `for`, `while`, `switch`, `try/catch` MUST remain structurally readable.
- Complex objects/arrays should expand if readability suffers or line length exceeds 120.
- Do not use nested ternaries for business logic.
- Do not write code-golf style expressions.

---

## 27.3 Naming

Domain objects MUST use descriptive names.

Prefer:

```js
boundary
door
rack
object
selection
layout
runtimeState
```

Avoid:

```js
b
d
r
o
x
```

Short mathematical names are allowed where conventional:

```js
x
y
dx
dy
i
j
```

---

## 27.4 HTML / Vue Templates

Preserve DOM hierarchy.

Simple leaf elements may stay on one line:

```html
<span class="map-status">Saved locally</span>
```

Nested structures should be expanded:

```html
<div class="map-toolbar">
  <div class="map-toolbar__left">
    <button type="button" class="toolbar-button">
      <i class="fa fa-save"></i>
      Save Draft
    </button>
  </div>
</div>
```

Do not collapse multiple meaningful DOM levels onto one line.

Long attribute lists may wrap.

---

## 27.5 CSS

Use expanded CSS formatting.

Good:

```css
.map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
}
```

Bad:

```css
.map-toolbar{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 16px}
```

Rules:

- One declaration per line.
- One clear block per selector.
- Use CSS custom properties for recurring design tokens.
- Avoid inline styles except for genuinely dynamic geometry/rendering values.
- Do not introduce unexplained magic values repeatedly.

---

# 28. Prettier Baseline

Recommended `.prettierrc`:

```json
{
  "printWidth": 120,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "htmlWhitespaceSensitivity": "css",
  "endOfLine": "auto"
}
```

Prettier is the formatting authority where applicable.

Codex SHOULD NOT fight Prettier formatting.

---

# 29. EditorConfig Baseline

Recommended `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

If the project requires UTF-8 with BOM for specific integration reasons, enforce that through a dedicated repository script/CI check, because editor and formatter behavior can differ.

---

# 30. Encoding Policy

For this standalone map project:

- Prefer standard UTF-8 source encoding.
- If integration into an existing C# / Learun environment later requires UTF-8 with BOM for selected file types, that requirement should be enforced deliberately at the integration boundary.

Do not let encoding requirements silently vary by developer machine.

---

# 31. ESLint Responsibilities

ESLint should focus on code quality rather than formatting battles.

Recommended categories:

- No unused variables
- No accidental globals
- No unreachable code
- Prefer `const`
- Require strict equality
- Prevent duplicate imports
- Prevent obvious promise misuse
- Prevent accidental mutation patterns where project rules prohibit them

Formatting is primarily handled by Prettier.

---

# 32. Testing Strategy

The current pure-logic tests are a strong foundation.

Migrate the existing checks into Vitest.

Recommended structure:

```text
tests/
├─ model/
├─ geometry/
├─ spatial/
├─ doors/
├─ persistence/
└─ application/
```

Core tests MUST remain independent of browser rendering where possible.

Important coverage:

- Stable slot identity
- Location-code uniqueness
- Copy behavior
- Migration
- Boundary rules
- Rotation
- Collision
- Overlap
- Snap behavior
- Array copy
- Door geometry
- Door overlap
- Door boundary limits
- Layout import
- History limits
- IndexedDB migration
- Autosave atomicity
- Repository behavior

---

# 33. Test Philosophy

Priority order:

1. Domain/core unit tests
2. Persistence tests
3. Application-command tests
4. Renderer integration tests
5. Limited end-to-end tests

Do not make browser E2E the only safety net for geometry logic.

---

# 34. Validation

Validation must be explicit and layered.

## Domain Validation

Examples:

- Invalid dimensions
- Duplicate location codes
- Invalid rack/slot relationships
- Door outside boundary
- Door overlap
- Negative dimensions
- Unsupported object type

## Persistence Validation

Examples:

- Unsupported schema version
- Corrupt local draft
- Invalid imported JSON
- Migration failure

## Publish Validation

Publishing must perform stricter validation than local autosave.

A layout may be locally recoverable while still not being eligible for publish.

---

# 35. Schema Versioning

Every persisted layout snapshot MUST include:

```text
schemaVersion
```

Example:

```js
{
  schemaVersion: 4,
  layoutId: '...',
  ...
}
```

Migration logic must be explicit.

Never infer schema version only from the presence or absence of arbitrary fields.

---

# 36. Import / Export

JSON import/export remains supported.

Import rules:

1. Parse
2. Detect schema version
3. Migrate if needed
4. Validate
5. Preserve the current draft as a recovery snapshot
6. Replace the working model atomically
7. Persist the imported local draft

Never partially mutate the active model while import validation is still running.

---

# 37. Error Handling

Do not swallow errors silently.

Infrastructure errors should be converted into meaningful application-level errors.

Examples:

```text
LOCAL_SAVE_FAILED
LOCAL_MIGRATION_FAILED
IMPORT_VALIDATION_FAILED
SERVER_DRAFT_CONFLICT
PUBLISH_VALIDATION_FAILED
SERVER_UNAVAILABLE
```

UI messages may be user friendly, while logs retain technical details.

---

# 38. Autosave Failure Semantics

Autosave failure must not corrupt the in-memory layout.

Preferred behavior:

```text
Memory model remains active
Local persistence reports failure
UI shows unsaved warning
Retry remains possible
```

Do not clear valid in-memory user work because IndexedDB failed.

---

# 39. Build Rules

`npm run build` should produce `dist/`.

`dist/` is disposable.

A clean checkout should be able to regenerate it.

Codex MUST NOT solve source problems by manually editing generated bundles.

---

# 40. Git / Refactoring Rules

Codex MUST:

- Preserve behavior during structural migration.
- Keep commits/changes conceptually scoped where possible.
- Avoid broad unrelated reformatting.
- Avoid renaming every file and rewriting every algorithm in one step.
- Preserve tests before moving implementation.
- Add tests before changing subtle CAD behavior.
- Prefer moving working code first, then improving it.
- Explain any intentional behavior change.

---

# 41. Codex Mandatory Rules

When Codex works on this repository, it MUST follow these rules.

## Architecture

1. Do not import Vue inside `src/core`.
2. Do not import Konva or Three.js inside `src/core`.
3. Do not access browser persistence inside `src/core`.
4. Do not access Dexie directly from Vue components.
5. Do not put business truth inside renderer objects.
6. Do not merge layout and runtime inventory models.
7. Do not edit `dist/`.

## Code Style

8. Use Enterprise Compact style.
9. Do not manually minify.
10. Use one statement per line.
11. Use descriptive domain variable names.
12. Maximum target line width is 120 characters.
13. Let Prettier be the formatting authority.

## Persistence

14. `localStorage` is preference-only.
15. IndexedDB / Dexie is local workspace.
16. SQL Server is enterprise source of truth.
17. Local Draft and Server Draft are different concepts.
18. Repository abstractions must isolate persistence technology.
19. Layout snapshots require explicit `schemaVersion`.
20. Local migrations must preserve valid user work.

## Refactoring

21. Preserve existing CAD behavior unless a behavior change is explicitly requested.
22. Migrate in small phases.
23. Keep pure logic pure.
24. Add/maintain tests for geometry and migration behavior.
25. Do not introduce TypeScript, Pinia, Tailwind, or another major dependency without a separate reason.

---

# 42. Recommended Refactoring Phases

## Phase 0 — Baseline Safety

Before major structural changes:

- Capture current behavior.
- Run all existing `check-*.mjs` scripts.
- Record failing/passing baseline.
- Add package scripts for checks.
- Ensure layout import/export samples are preserved.

No behavior change.

---

## Phase 1 — Source Layout and Formatting

Goals:

- Create `src/`.
- Move hand-written files out of `dist/`.
- Add Vite build.
- Add Prettier.
- Add ESLint.
- Add `.editorconfig`.
- Establish Enterprise Compact style.

Do not rewrite algorithms.

---

## Phase 2 — Extract Core

Move pure logic into:

```text
src/core/
```

Target:

- model
- geometry
- spatial
- doors
- validation

Core tests must continue to pass.

---

## Phase 3 — Introduce Vue 3 Shell

Introduce:

- `App.vue`
- `MapEditorView.vue`
- Toolbar
- Sidebar
- Property panels
- Dialogs

Gradually remove direct DOM orchestration from `app.js`.

Do not rewrite Konva geometry.

---

## Phase 4 — Renderer Isolation

Create explicit:

```text
KonvaRenderer
ThreeRenderer
```

Move rendering concerns out of application/domain modules.

Keep renderer inputs explicit.

---

## Phase 5 — Application Layer

Introduce:

- editor state
- selection
- commands
- history
- layout lifecycle
- persistence coordination

Begin decomposing the large application controller.

---

## Phase 6 — Persistence Abstraction

Create repository contracts.

First implementations:

```text
PreferenceRepository
LocalLayoutRepository
DraftRepository
HistoryRepository
```

At this stage existing behavior may temporarily use the old local-storage implementation behind the repository boundary.

---

## Phase 7 — Dexie / IndexedDB

Replace business-data persistence in `localStorage` with Dexie.

Migrate:

- Drafts
- History
- Snapshots
- Local layout workspace

Retain only UI preferences in `localStorage`.

Provide migration from legacy local-storage map data where feasible.

---

## Phase 8 — Formalize Runtime Separation

Remove demo inventory from authoritative layout structures.

Introduce:

```text
layoutStore
runtimeStore
```

Renderers receive both.

Mock runtime data may continue until C# integration is available.

---

## Phase 9 — Remote Repository Contract

Add C# API-facing repository/service interfaces.

Do not require a real backend to complete the frontend architecture.

Use explicit DTO contracts.

Support:

- Load server draft
- Save server draft
- Load published layout
- Publish
- Version conflict

---

## Phase 10 — SignalR Runtime Updates

After backend integration:

```text
SignalR Event
      ↓
Runtime Store
      ↓
Targeted Renderer Update
```

Do not use SignalR as the layout-edit save transport.

Layout saves remain normal API operations.

---

# 43. Non-Goals of the First Refactor

The first architecture refactor MUST NOT attempt all of the following:

- Real-time multiplayer editing
- Figma-like collaborative merge
- Full offline conflict reconciliation
- Conversion to TypeScript
- Pinia migration
- Tailwind migration
- Replacement of Konva
- Replacement of Three.js
- Replacement of all CSS
- Full WMS runtime integration
- SQL Server schema deployment
- SignalR production deployment

Those are separate phases.

---

# 44. Acceptance Criteria for the Architecture Refactor

The refactor is considered structurally successful when:

- Hand-written source code lives in `src/`.
- `dist/` is generated only.
- Existing map behavior remains available.
- Vue 3 controls application UI.
- Core geometry/model logic has no Vue dependency.
- Konva and Three are isolated as renderers.
- Persistence is accessed through repositories.
- `localStorage` contains only preferences.
- Dexie stores local workspace data.
- Existing local data can be migrated or safely imported.
- Tests cover core geometry and persistence migration.
- Formatting is stable under Prettier.
- `npm run build` succeeds.
- `npm test` succeeds.
- A future C# API can be added without redesigning the core.

---

# 45. Engineering Definition

The project shall be described as:

> A local-first warehouse map editor with a framework-agnostic domain core, Vue 3 application shell, Konva.js and Three.js renderers, IndexedDB local workspace, and a future C# / SQL Server enterprise persistence layer.

Architecture style:

```text
Framework-Agnostic Core
+
Vue Application Shell
+
Renderer Adapters
+
Repository-Based Persistence
+
Local-First Workspace
```

Code style:

```text
Enterprise Compact
```

Persistence model:

```text
Memory
  ↓
Dexie / IndexedDB
  ↓
C# WMS API
  ↓
SQL Server
```

with:

```text
localStorage = Preference Only
```

---

# 46. Final Constitutional Rules

These rules summarize the project.

```text
1. Core is framework agnostic.
2. Vue manages UI and application state, not geometry.
3. Konva and Three.js render shared models; they do not own business data.
4. Layout state and runtime WMS state remain separate.
5. Source code is compact but structured; never manually minified.
6. src is source; dist is generated output.
7. localStorage is preference-only.
8. Dexie / IndexedDB is the local workspace.
9. SQL Server is the enterprise source of truth.
10. Local Draft, Server Draft, and Published Layout are distinct lifecycle states.
11. Persistence is accessed through repository abstractions.
12. Every persisted layout has an explicit schema version.
13. Stable map-object identity must survive editing and reloads.
14. Optimistic version control prevents silent multi-user overwrite.
15. Pure geometry remains independently testable.
16. Architecture refactoring must preserve working behavior.
```

These rules take precedence over attempts to reduce code size, simplify directory count, or accelerate a single feature by breaking architectural boundaries.
