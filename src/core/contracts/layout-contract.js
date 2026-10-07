/**
 * Current persisted v6 contract. Names intentionally match existing JSON.
 * @typedef {Object} Slot
 * @property {string} id Stable identity, preserved on move/rotation/reload.
 * @property {string} code WMS location code; never replaced by internal IDs.
 * @property {number} level One-based level.
 * @property {number} col One-based column.
 */

/**
 * @typedef {Object} Rack
 * @property {string} id
 * @property {string} name
 * @property {'main'} spaceId
 * @property {'FG01'|'FG02'} fgCode
 * @property {number} x Metres in shared physical space.
 * @property {number} y
 * @property {number} cols
 * @property {number} levels
 * @property {number} width Width of one column, not the whole rack.
 * @property {number} depth
 * @property {number} levelHeight
 * @property {number} rotation Clockwise degrees.
 * @property {Slot[]} slots
 */

/**
 * @typedef {Object} Door
 * @property {string} id
 * @property {string} name
 * @property {'top'|'bottom'|'left'|'right'} side
 * @property {'inbound'|'outbound'|'general'} type
 * @property {number} offset Metres from the start of the boundary edge.
 * @property {number} width
 */

/**
 * @typedef {Object} Area
 * Physical Area. Existing flat x/y/width/depth/rotation geometry remains unchanged.
 * @property {string} id
 * @property {string} name
 * @property {'aisle'|'inbound'|'outbound'|'general'} type
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} depth
 * @property {number} rotation
 */

/**
 * @typedef {Object} Boundary
 * @property {'boundary'} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} depth
 * @property {0} rotation
 * @property {Door[]} [doors]
 */

/**
 * @typedef {Object} Layout
 * @property {6} schemaVersion
 * @property {string} layoutId
 * @property {string} layoutCode
 * @property {string|null} warehouseCode Explicit WMS scope, never inferred from FG ownership.
 * @property {string|number|null} floorNo
 * @property {Rack[]} racks
 * @property {Boundary} boundary Normalized by ensureSpatial when loading older data.
 * @property {Room[]} rooms 附加房间，内部对象不建立父子坐标关系。
 * @property {Fixture[]} fixtures 固定设施不生成货位或库存。
 * @property {Area[]} areas
 * @property {AreaBinding[]} areaBindings
 */

/**
 * Transient CAD selection group, not a new persistent JSON field.
 * @typedef {Object} Group
 * @property {string[]} objectIds IDs of selected racks/areas.
 */

// 本文件仅提供 JSDoc 类型契约；export {} 将其声明为模块，不创建运行时业务对象。
export {};

/**
 * @typedef {Object} AreaBinding
 * @property {string} id
 * @property {string} areaId References a Physical Area in layout.areas.
 * @property {string} virtualLocationCode Unique within this layout, including inactive bindings.
 * @property {string} displayName
 * @property {string} purpose Business purpose, never HOLD/WAITING/URGENT state labels.
 * @property {boolean} isActive All active bindings are displayed, with no priority.
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} depth
 * @property {0} rotation 房间保持轴对齐。
 * @property {Door[]} doors 门偏移相对于本房间。
 */

/**
 * @typedef {Object} Fixture
 * @property {string} id 稳定身份，复制生成新 ID。
 * @property {string} name
 * @property {'cabinet'|'pillar'|'other'} type
 * @property {number} x 世界坐标及尺寸以米保存。
 * @property {number} y
 * @property {number} width
 * @property {number} depth
 * @property {number} height
 * @property {number} rotation 顺时针角度。
 */
